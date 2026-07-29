// =====================================================================
// Import / Export dialogs
// ---------------------------------------------------------------------
// Import accepts pasted PGN or FEN (auto-detected), a .pgn file upload,
// or a file dragged onto the dialog. Parse problems surface inline —
// recoverable issues import with warnings, hard failures explain why.
// Export produces standard PGN (annotated or clean), a .pgn download,
// and the current position as FEN.
// =====================================================================
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GhostButton, GoldButton } from "@/components/site/Primitives";
import { Textarea } from "@/components/ui/textarea";

import type { AnalysisSession } from "./useAnalysisSession";

const MAX_PGN_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — far beyond any real game

/** Rough shape test: does this look like a FEN rather than PGN? */
function looksLikeFen(text: string): boolean {
  const t = text.trim();
  if (t.includes("[") || t.includes("{")) return false;
  const fields = t.split(/\s+/);
  return fields.length >= 2 && fields.length <= 6 && /^[pnbrqkPNBRQK1-8/]+$/.test(fields[0]);
}

// ── Import ───────────────────────────────────────────────────────────

export function ImportDialog({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: AnalysisSession;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doImport = useCallback(
    (raw: string) => {
      setError(null);
      const input = raw.trim();
      if (!input) {
        setError("Paste a PGN or FEN first — or drop a .pgn file here.");
        return;
      }
      const result = looksLikeFen(input) ? session.importFen(input) : session.importPgn(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      setText("");
      if (result.warnings.length > 0) {
        toast.warning(
          `Imported with ${result.warnings.length} issue${result.warnings.length > 1 ? "s" : ""}: ${result.warnings[0]}`,
        );
      } else {
        toast.success("Game imported.");
      }
    },
    [session, onOpenChange],
  );

  const readFile = useCallback(
    (file: File) => {
      if (file.size > MAX_PGN_FILE_BYTES) {
        setError("That file is over 2 MB — export a single game and try again.");
        return;
      }
      file
        .text()
        .then((content) => {
          setText(content);
          doImport(content);
        })
        .catch(() => setError("Could not read that file."));
    },
    [doImport],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-gold/25 bg-background/95 backdrop-blur-xl sm:max-w-lg"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) readFile(file);
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Import a game</DialogTitle>
          <DialogDescription>
            Paste a PGN (annotations and variations are kept) or a FEN position — or drop a .pgn
            file anywhere on this dialog.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder={
            "1. e4 e5 2. Nf3 { A comment } Nc6 (2... d6 3. d4) 3. Bb5 …\nor: r1bqkbnr/… w KQkq - 0 4"
          }
          className={`min-h-[160px] border-gold/20 bg-white/[0.02] font-mono text-xs transition-colors ${
            dragOver ? "border-gold ring-1 ring-gold/50" : ""
          }`}
          aria-invalid={error !== null}
        />

        {error && (
          <p
            role="alert"
            className="rounded-md border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-400"
          >
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pgn,.txt,application/x-chess-pgn,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) readFile(file);
                e.target.value = "";
              }}
            />
            <GhostButton onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" /> Upload .pgn
            </GhostButton>
          </div>
          <div className="flex gap-2">
            <GhostButton onClick={() => onOpenChange(false)}>Cancel</GhostButton>
            <GoldButton onClick={() => doImport(text)}>
              <Upload className="h-4 w-4" /> Import
            </GoldButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Export ───────────────────────────────────────────────────────────

export function ExportDialog({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: AnalysisSession;
}) {
  const [annotated, setAnnotated] = useState(true);

  const pgn = open ? session.exportPgn({ annotations: annotated, variations: annotated }) : "";

  const copy = async (content: string, label: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(`${label} copied to clipboard.`);
    } catch {
      toast.error("Clipboard unavailable in this browser.");
    }
  };

  const download = () => {
    try {
      const blob = new Blob([pgn], { type: "application/x-chess-pgn" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chessox-analysis-${new Date().toISOString().slice(0, 10)}.pgn`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not create the download.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-gold/25 bg-background/95 backdrop-blur-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Export</DialogTitle>
          <DialogDescription>
            Standard PGN — readable by every chess tool. The annotated form keeps your comments,
            glyphs and side variations.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={annotated}
            onChange={(e) => setAnnotated(e.target.checked)}
            className="accent-gold"
          />
          Include comments, annotations and variations
        </label>

        <pre className="scrollbar-thin max-h-56 overflow-auto rounded-lg border border-white/10 bg-white/[0.02] p-3 font-mono text-[11px] leading-5 text-muted-foreground">
          {pgn}
        </pre>

        <DialogFooter className="flex-wrap gap-2">
          <GhostButton onClick={() => void copy(session.fen, "FEN")}>Copy FEN</GhostButton>
          <GhostButton onClick={download}>
            <Download className="h-4 w-4" /> Download .pgn
          </GhostButton>
          <GoldButton onClick={() => void copy(pgn, "PGN")}>Copy PGN</GoldButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
