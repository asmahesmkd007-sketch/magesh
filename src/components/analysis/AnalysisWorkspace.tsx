// =====================================================================
// AnalysisWorkspace — the ChessOX engine room
// ---------------------------------------------------------------------
// Composes the whole analysis experience: interactive board with eval
// bar and engine arrows, live Stockfish panel, annotated move tree,
// game review, charts, position insights, opening explorer, Syzygy
// endgame verdicts, import/export and the saved-analysis library.
//
// Entry points:
//   /analysis                 blank board
//   /analysis?gameId=…        loads a finished game's PGN from the DB
//   localStorage handoff      "chessox-analysis-pgn" (Play → Analyse)
//
// Keyboard: ←/→ step · Home/End jump · [ ] cycle variations ·
//           F flip · E engine · Shift+F fullscreen
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookMarked,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Expand,
  RefreshCw,
  RotateCcw,
  Shrink,
  Upload,
} from "lucide-react";
import type { Square } from "chess.js";

import { Card, GhostButton, GoldButton } from "@/components/site/Primitives";
import { InteractiveBoard, type BoardArrow } from "@/components/site/InteractiveBoard";
import { PromotionPicker } from "@/components/site/PromotionPicker";
import { useEngine } from "@/hooks/useEngine";
import { supabase } from "@/integrations/supabase/client";
import { soundForChessMove } from "@/lib/audio/sounds";
import { scoreForWhite, scoreToCp } from "@/lib/engine/uci";

import { AnalysisCharts } from "./AnalysisCharts";
import { EnginePanel } from "./EnginePanel";
import { EvalBar } from "./EvalBar";
import { ImportDialog, ExportDialog } from "./ImportExportDialogs";
import { InsightsPanel } from "./InsightsPanel";
import { MoveTreePanel } from "./MoveTreePanel";
import { OpeningExplorerPanel } from "./OpeningExplorerPanel";
import { ReviewPanel } from "./ReviewPanel";
import { SavedAnalysesDialog } from "./SavedAnalysesDialog";
import { TablebasePanel } from "./TablebasePanel";
import { useAnalysisSession } from "./useAnalysisSession";

const ENGINE_ON_KEY = "chessox-engine-on";
const HANDOFF_KEY = "chessox-analysis-pgn";

type PanelTab = "review" | "charts" | "position" | "openings" | "endgame";

const PANEL_TABS: { id: PanelTab; label: string }[] = [
  { id: "review", label: "Review" },
  { id: "charts", label: "Graphs" },
  { id: "position", label: "Position" },
  { id: "openings", label: "Openings" },
  { id: "endgame", label: "Endgame" },
];

export function AnalysisWorkspace({ gameId }: { gameId?: string }) {
  const session = useAnalysisSession();
  const engine = useEngine();

  const [engineOn, setEngineOn] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(ENGINE_ON_KEY) !== "0";
  });
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(
    null,
  );
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("review");
  const [fullscreen, setFullscreen] = useState(false);
  const [openSaved, setOpenSaved] = useState<{ id: string; title: string } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  const { position, fen } = session;

  // ── Entry-point loading (DB game or Play-page handoff) ─────────────
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    if (gameId) {
      supabase
        .from("games")
        .select("pgn")
        .eq("id", gameId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data?.pgn) {
            toast.error("No PGN found for this game.");
            return;
          }
          const result = session.importPgn(data.pgn);
          if (result.ok) toast.success("Game loaded — run a review to grade every move.");
          else toast.error(result.error);
        });
      return;
    }

    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(HANDOFF_KEY) : null;
    if (stored) {
      localStorage.removeItem(HANDOFF_KEY);
      const result = session.importPgn(stored);
      if (result.ok) toast.success("Game loaded into the engine room.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // ── Live engine analysis (debounced on position change) ────────────
  useEffect(() => {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(ENGINE_ON_KEY, engineOn ? "1" : "0");
  }, [engineOn]);

  const reviewRunning = session.reviewState.status === "running";
  useEffect(() => {
    // A running batch review owns the engine — never preempt its
    // fixed-depth searches with the live infinite search.
    if (reviewRunning) return;
    if (!engineOn || position.isGameOver()) {
      engine.stop();
      return;
    }
    const timer = setTimeout(() => engine.analyze(fen), 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, engineOn, reviewRunning]);

  // Halt the engine when the workspace unmounts.
  useEffect(() => () => engine.stop(), [engine]);

  // ── Board interaction ──────────────────────────────────────────────
  const clearSelection = useCallback(() => {
    setSelected(null);
    setTargets([]);
  }, []);

  const makeMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      session.playMove({ from, to, promotion });
      clearSelection();
    },
    [session, clearSelection],
  );

  const onSquare = useCallback(
    (sq: string) => {
      const piece = position.get(sq as Square);
      if (piece && piece.color === position.turn()) {
        setSelected(sq);
        setTargets(position.moves({ square: sq as Square, verbose: true }).map((m) => m.to));
        return;
      }
      if (!selected) return;
      const candidates = position
        .moves({ square: selected as Square, verbose: true })
        .filter((m) => m.to === sq);
      if (candidates.length === 0) {
        clearSelection();
        return;
      }
      if (candidates.some((m) => m.promotion)) {
        setPendingPromotion({ from: selected, to: sq });
        return;
      }
      makeMove(selected, sq);
    },
    [position, selected, makeMove, clearSelection],
  );

  /** Play a UCI move (engine line / tablebase click). */
  const playUci = useCallback(
    (uci: string) => {
      session.playMove({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      });
      clearSelection();
    },
    [session, clearSelection],
  );

  const playSan = useCallback(
    (san: string) => {
      session.playMove(san);
      clearSelection();
    },
    [session, clearSelection],
  );

  // ── Move sounds on navigation ──────────────────────────────────────
  const prevNodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevNodeRef.current === null) {
      prevNodeRef.current = session.currentId;
      return;
    }
    if (prevNodeRef.current === session.currentId) return;
    prevNodeRef.current = session.currentId;
    const node = session.currentNode;
    if (node.parentId === null) return;
    // Reconstruct the move from the parent position for its sound.
    const parent = session.tree.node(node.parentId);
    if (!parent) return;
    try {
      const g = session.tree.positionAt(parent.id);
      const made = g.move({
        from: node.uci.slice(0, 2),
        to: node.uci.slice(2, 4),
        promotion: (node.uci[4] as "q" | undefined) ?? "q",
      });
      soundForChessMove(made, g);
    } catch {
      /* sound is best-effort */
    }
  }, [session.currentId, session.currentNode, session.tree, position]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      )
        return;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          session.goPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          session.goNext();
          break;
        case "Home":
        case "ArrowUp":
          e.preventDefault();
          session.goStart();
          break;
        case "End":
        case "ArrowDown":
          e.preventDefault();
          session.goEnd();
          break;
        case "[":
          session.goToVariation(-1);
          break;
        case "]":
          session.goToVariation(1);
          break;
        case "f":
          setOrientation((o) => (o === "w" ? "b" : "w"));
          break;
        case "F":
          void toggleFullscreen();
          break;
        case "e":
        case "E":
          setEngineOn((v) => !v);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.goPrev, session.goNext, session.goStart, session.goEnd, session.goToVariation]);

  // ── Fullscreen ─────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (rootRef.current) {
        await rootRef.current.requestFullscreen();
      }
    } catch {
      /* fullscreen unsupported (iOS Safari) — the button just no-ops */
    }
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── Derived board decorations ──────────────────────────────────────
  const arrows = useMemo(() => {
    if (!engineOn) return [];
    const snap = engine.snapshot;
    if (!snap || snap.fen !== fen) return [];
    const out: BoardArrow[] = [];
    const top = snap.lines.filter(Boolean).slice(0, Math.min(3, engine.settings.multiPv));
    top.forEach((line, i) => {
      const uci = line.pv[0];
      if (!uci) return;
      out.push({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        weight: 1 - i * 0.35,
        color: i === 0 ? "rgb(212,175,55)" : "rgba(212,175,55,0.65)",
      });
    });
    return out;
  }, [engineOn, engine.snapshot, engine.settings.multiPv, fen]);

  const evalForBar = useMemo(() => {
    const snap = engine.snapshot;
    if (engineOn && snap && snap.fen === fen && snap.lines[0]) {
      const turn = (fen.split(" ")[1] as "w" | "b") ?? "w";
      const white = scoreForWhite(snap.lines[0].score, turn);
      return {
        cpWhite: scoreToCp(white),
        mateIn: white.type === "mate" ? white.value : null,
        active: true,
      };
    }
    // Fall back to review evals when the engine is off.
    const analysis =
      session.currentNode.parentId !== null ? session.analysisFor(session.currentNode) : null;
    if (analysis) {
      return {
        cpWhite: analysis.evalAfter.cpWhite,
        mateIn: analysis.evalAfter.mateIn,
        active: false,
      };
    }
    return { cpWhite: null, mateIn: null, active: false };
  }, [engineOn, engine.snapshot, fen, session]);

  const mainlinePlyCount = session.mainline.length;
  const currentPly = session.tree.isMainline(session.currentId) ? session.pathToCurrent.length : 0;

  const mainlineSansToCurrent = useMemo(
    () => session.pathToCurrent.map((n) => n.san),
    [session.pathToCurrent],
  );

  return (
    <div ref={rootRef} className={fullscreen ? "bg-background p-4" : ""}>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <GhostButton onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Import
        </GhostButton>
        <GhostButton onClick={() => setExportOpen(true)}>
          <Download className="h-4 w-4" /> Export
        </GhostButton>
        <GoldButton onClick={() => setLibraryOpen(true)}>
          <BookMarked className="h-4 w-4" /> Library
        </GoldButton>
        <GhostButton onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
          <RefreshCw className="h-4 w-4" /> Flip
        </GhostButton>
        <GhostButton
          onClick={() => {
            session.reset();
            setOpenSaved(null);
            clearSelection();
            toast.info("Board reset to the starting position.");
          }}
        >
          <RotateCcw className="h-4 w-4" /> Reset
        </GhostButton>
        <GhostButton onClick={() => void toggleFullscreen()}>
          {fullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          {fullscreen ? " Exit" : " Focus"}
        </GhostButton>

        {openSaved && (
          <span className="flex items-center gap-1 rounded-full border border-gold/25 bg-gold/5 px-2.5 py-1 text-xs text-gold">
            <BookMarked className="h-3 w-3" /> {openSaved.title}
          </span>
        )}
        {session.opening && (
          <span className="rounded-full border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-xs text-amber-300/90">
            {session.opening.eco} · {session.opening.name}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Board column */}
        <div className="lg:col-span-7">
          <div className="flex items-stretch gap-2">
            <EvalBar
              cpWhite={evalForBar.cpWhite}
              mateIn={evalForBar.mateIn}
              orientation={orientation}
              active={evalForBar.active || evalForBar.cpWhite !== null}
            />
            <div className="relative min-w-0 flex-1">
              <InteractiveBoard
                board={position.board()}
                orientation={orientation}
                selected={selected}
                targets={targets}
                lastMove={session.lastMove}
                checkSquare={session.checkSquare}
                onSquare={onSquare}
                arrows={arrows}
              />
              {pendingPromotion && (
                <PromotionPicker
                  color={position.turn()}
                  onPick={(p) => {
                    makeMove(pendingPromotion.from, pendingPromotion.to, p);
                    setPendingPromotion(null);
                  }}
                  onCancel={() => setPendingPromotion(null)}
                />
              )}
            </div>
          </div>

          {/* Mainline scrubber */}
          {mainlinePlyCount > 0 && (
            <div className="mt-3 px-1">
              <input
                type="range"
                min={0}
                max={mainlinePlyCount}
                value={currentPly}
                onChange={(e) => session.goToPly(Number(e.target.value))}
                className="w-full cursor-pointer accent-gold"
                aria-label="Scrub through the mainline"
              />
            </div>
          )}

          <div className="mt-2 flex items-center justify-center gap-2">
            <GhostButton onClick={session.goStart} aria-label="First move">
              <ChevronsLeft className="h-4 w-4" />
            </GhostButton>
            <GhostButton onClick={session.goPrev} aria-label="Previous move">
              <ChevronLeft className="h-4 w-4" />
            </GhostButton>
            <span className="px-3 text-sm tabular-nums text-muted-foreground">
              {session.currentNode.parentId === null
                ? "Start"
                : `${session.currentNode.moveNumber}${session.currentNode.color === "w" ? "." : "…"} ${session.currentNode.san}`}
            </span>
            <GhostButton onClick={session.goNext} aria-label="Next move">
              <ChevronRight className="h-4 w-4" />
            </GhostButton>
            <GhostButton onClick={session.goEnd} aria-label="Last move">
              <ChevronsRight className="h-4 w-4" />
            </GhostButton>
          </div>
          <div className="mt-1 text-center text-xs text-muted-foreground">
            ← → step · [ ] variations · F flip · E engine
          </div>
        </div>

        {/* Panels column */}
        <div className="space-y-4 lg:col-span-5">
          <Card className="p-4">
            <EnginePanel
              engine={engine}
              engineOn={engineOn}
              onToggleEngine={setEngineOn}
              fen={fen}
              onPlayUci={playUci}
            />
          </Card>

          <Card className="flex max-h-[340px] flex-col p-4">
            <MoveTreePanel session={session} />
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Analysis panels">
              {PANEL_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={panelTab === t.id}
                  onClick={() => setPanelTab(t.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    panelTab === t.id
                      ? "bg-gold/20 text-gold"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {panelTab === "review" && <ReviewPanel session={session} />}
            {panelTab === "charts" && <AnalysisCharts session={session} />}
            {panelTab === "position" && <InsightsPanel fen={fen} />}
            {panelTab === "openings" && (
              <OpeningExplorerPanel
                fen={fen}
                sans={mainlineSansToCurrent}
                opening={session.opening}
                onPlaySan={playSan}
              />
            )}
            {panelTab === "endgame" && <TablebasePanel fen={fen} onPlaySan={playSan} />}
          </Card>
        </div>
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} session={session} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} session={session} />
      <SavedAnalysesDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        session={session}
        openSavedId={openSaved?.id ?? null}
        onOpenedSaved={(id, title) => setOpenSaved({ id, title })}
      />
    </div>
  );
}
