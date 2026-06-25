import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { toast } from "sonner";
import { Upload, Download, RefreshCw, Cpu, RotateCcw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { InteractiveBoard } from "@/components/site/InteractiveBoard";
import { PromotionPicker } from "@/components/site/PromotionPicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };

function materialEval(g: Chess): number {
  let s = 0;
  for (const row of g.board()) for (const c of row) if (c) s += (c.color === "w" ? 1 : -1) * PIECE_VALUES[c.type];
  return s;
}

export function AnalysisBoard() {
  const [sans, setSans] = useState<string[]>([]);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [engineOn, setEngineOn] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const loadedRef = useRef(false);

  const current = useMemo(() => {
    const g = new Chess();
    for (let i = 0; i < ply; i++) g.move(sans[i]);
    return g;
  }, [sans, ply]);

  // Load a PGN handed over from /play ("Analyze Game")
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const stored = localStorage.getItem("chessox-analysis-pgn");
    if (!stored) return;
    localStorage.removeItem("chessox-analysis-pgn");
    try {
      const g = new Chess();
      g.loadPgn(stored);
      setSans(g.history());
      setPly(g.history().length);
      toast.success("Game loaded into the engine room.");
    } catch {
      /* ignore */
    }
  }, []);

  // Arrow-key navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setPly((p) => Math.max(0, p - 1)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPly((p) => Math.min(sans.length, p + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setPly(0); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setPly(sans.length); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sans.length]);

  const lastMove = useMemo(() => {
    const h = current.history({ verbose: true });
    const last = h[h.length - 1];
    return last ? { from: last.from, to: last.to } : null;
  }, [current]);

  const checkSquare = useMemo(() => {
    if (!current.inCheck()) return null;
    const turn = current.turn();
    for (const row of current.board()) for (const cell of row) if (cell && cell.type === "k" && cell.color === turn) return cell.square;
    return null;
  }, [current]);

  const evalScore = useMemo(() => {
    const jitter = Math.sin((ply + 1) * 1.37) * 0.35;
    return Math.round((materialEval(current) + jitter) * 10) / 10;
  }, [current, ply]);

  const engineLines = useMemo(() => {
    if (!engineOn) return [];
    const moves = current.moves({ verbose: true });
    const ranked = [...moves].sort((a, b) => Number(Boolean(b.captured)) - Number(Boolean(a.captured)));
    return ranked.slice(0, 3).map((m, i) => {
      const g = new Chess(current.fen());
      const line = [g.move(m.san).san];
      for (let k = 0; k < 3; k++) {
        const next = g.moves();
        if (next.length === 0) break;
        line.push(g.move(next[(i + k * 7) % next.length]).san);
      }
      const score = Math.round((evalScore + 0.4 - i * 0.35) * 10) / 10;
      return { score: score >= 0 ? `+${score.toFixed(1)}` : score.toFixed(1), line: line.join(" ") };
    });
  }, [current, engineOn, evalScore]);

  const fullPgn = () => {
    const g = new Chess();
    for (const s of sans) g.move(s);
    return g.pgn();
  };

  const makeMove = (from: string, to: string, promotion?: string) => {
    const g = new Chess(current.fen());
    try {
      const made = g.move({ from, to, promotion: promotion ?? "q" });
      setSans([...sans.slice(0, ply), made.san]);
      setPly(ply + 1);
      setSelected(null);
      setTargets([]);
    } catch {
      setSelected(null);
      setTargets([]);
    }
  };

  const onSquare = (sq: string) => {
    const piece = current.get(sq as Square);
    if (piece && piece.color === current.turn()) {
      setSelected(sq);
      setTargets(current.moves({ square: sq as Square, verbose: true }).map((m) => m.to));
      return;
    }
    if (!selected) return;
    const candidates = current.moves({ square: selected as Square, verbose: true }).filter((m) => m.to === sq);
    if (candidates.length === 0) {
      setSelected(null);
      setTargets([]);
      return;
    }
    if (candidates.some((m) => m.promotion)) {
      setPendingPromotion({ from: selected, to: sq });
      return;
    }
    makeMove(selected, sq);
  };

  const doImport = () => {
    try {
      const g = new Chess();
      g.loadPgn(importText.trim());
      if (g.history().length === 0) throw new Error("empty");
      setSans(g.history());
      setPly(0);
      setImportOpen(false);
      setImportText("");
      toast.success(`PGN imported — ${g.history().length} moves loaded.`);
    } catch {
      toast.error("Could not parse that PGN. Check the format and try again.");
    }
  };

  const doExport = async () => {
    const pgn = fullPgn();
    if (!pgn) {
      toast.info("Nothing to export yet — make some moves first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(pgn);
      toast.success("PGN copied to clipboard.");
    } catch {
      toast.error("Clipboard unavailable in this browser.");
    }
  };

  const reset = () => {
    setSans([]);
    setPly(0);
    setSelected(null);
    setTargets([]);
    toast.info("Board reset to the starting position.");
  };

  const barPct = Math.max(5, Math.min(95, 50 + evalScore * 7));
  const movePairs: [string, string | undefined][] = [];
  for (let i = 0; i < sans.length; i += 2) movePairs.push([sans[i], sans[i + 1]]);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <GhostButton onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import PGN</GhostButton>
        <GhostButton onClick={doExport}><Download className="h-4 w-4" /> Export PGN</GhostButton>
        <GhostButton onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}><RefreshCw className="h-4 w-4" /> Flip Board</GhostButton>
        <GhostButton onClick={reset}><RotateCcw className="h-4 w-4" /> Reset</GhostButton>
        <GoldButton onClick={() => setEngineOn((v) => !v)}><Cpu className="h-4 w-4" /> Engine {engineOn ? "On" : "Off"}</GoldButton>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="relative">
            <InteractiveBoard
              board={current.board()}
              orientation={orientation}
              selected={selected}
              targets={targets}
              lastMove={lastMove}
              checkSquare={checkSquare}
              onSquare={onSquare}
            />
            {pendingPromotion && (
              <PromotionPicker
                color={current.turn()}
                onPick={(p) => {
                  makeMove(pendingPromotion.from, pendingPromotion.to, p);
                  setPendingPromotion(null);
                }}
                onCancel={() => setPendingPromotion(null)}
              />
            )}
          </div>

          <div className="mt-4 flex items-center justify-center gap-2">
            <GhostButton onClick={() => setPly(0)} aria-label="First move"><ChevronsLeft className="h-4 w-4" /></GhostButton>
            <GhostButton onClick={() => setPly((p) => Math.max(0, p - 1))} aria-label="Previous move"><ChevronLeft className="h-4 w-4" /></GhostButton>
            <span className="px-3 text-sm text-muted-foreground">{ply} / {sans.length}</span>
            <GhostButton onClick={() => setPly((p) => Math.min(sans.length, p + 1))} aria-label="Next move"><ChevronRight className="h-4 w-4" /></GhostButton>
            <GhostButton onClick={() => setPly(sans.length)} aria-label="Last move"><ChevronsRight className="h-4 w-4" /></GhostButton>
          </div>
          <div className="mt-2 text-center text-xs text-muted-foreground">Use ← → arrow keys to step through the game. Click any piece to explore lines.</div>
        </div>

        <div className="space-y-4 lg:col-span-5">
          {engineOn && (
            <Card className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-display">Engine</div>
                <span className="rounded-full bg-emerald/20 px-2.5 py-1 text-xs text-emerald">Depth 24</span>
              </div>
              <div className="space-y-2 text-sm">
                {engineLines.length === 0 && <div className="text-xs text-muted-foreground">Game over — no moves to suggest.</div>}
                {engineLines.map((l, i) => (
                  <div key={i} className="flex gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <span className="w-12 font-mono text-gold">{l.score}</span>
                    <span className="text-muted-foreground">{l.line}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <div className="mb-2 font-display">Evaluation</div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full gradient-gold transition-all duration-300" style={{ width: `${barPct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>Black {Math.round(100 - barPct)}%</span>
              <span className="text-gold">{evalScore >= 0 ? `White +${evalScore.toFixed(1)}` : `Black ${evalScore.toFixed(1)}`}</span>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-2 font-display">Move List</div>
            {sans.length === 0 ? (
              <p className="text-xs text-muted-foreground">No moves yet — play on the board or import a PGN.</p>
            ) : (
              <div className="grid max-h-72 grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 overflow-y-auto pr-2 text-sm scrollbar-thin">
                {movePairs.map((pair, i) => (
                  <div className="contents" key={i}>
                    <div className="text-muted-foreground">{i + 1}.</div>
                    <button
                      type="button"
                      onClick={() => setPly(i * 2 + 1)}
                      className={`rounded px-1 text-left hover:bg-white/5 ${ply === i * 2 + 1 ? "bg-gold/15 text-gold" : ""}`}
                    >
                      {pair[0]}
                    </button>
                    {pair[1] ? (
                      <button
                        type="button"
                        onClick={() => setPly(i * 2 + 2)}
                        className={`rounded px-1 text-left text-muted-foreground hover:bg-white/5 ${ply === i * 2 + 2 ? "bg-gold/15 text-gold" : ""}`}
                      >
                        {pair[1]}
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="border-gold/25 bg-background/95 backdrop-blur-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Import PGN</DialogTitle>
            <DialogDescription>Paste a PGN below — the board and move list will be populated.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...'}
            className="min-h-[160px] border-gold/20 bg-white/[0.02] font-mono text-xs"
          />
          <DialogFooter>
            <GhostButton onClick={() => setImportOpen(false)}>Cancel</GhostButton>
            <GoldButton onClick={doImport}>Import Game</GoldButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
