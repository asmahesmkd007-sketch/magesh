import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload,
  Download,
  RefreshCw,
  Cpu,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react";
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
import type { MoveAnalysis } from "@/lib/chess/analysis.worker";
import {
  type Classification,
  CLASS_LABEL,
  CLASS_COLOR,
  CLASS_ICON,
} from "@/lib/chess/classification";
import { detectOpening, type OpeningMatch } from "@/lib/chess/openings";
import { buildAnalysisReport, saveGameAnalysis } from "@/lib/api/analysisClient";

// ── Classification helpers ──────────────────────────────────────────────────
function ClassBadge({ cls }: { cls: Classification }) {
  return (
    <span
      className={`inline-block w-5 text-center text-[10px] font-bold leading-none ${CLASS_COLOR[cls]}`}
      title={CLASS_LABEL[cls]}
    >
      {CLASS_ICON[cls]}
    </span>
  );
}

// ── Eval graph (SVG sparkline) ──────────────────────────────────────────────
function EvalGraph({
  evals,
  currentPly,
  onSeek,
}: {
  evals: number[];
  currentPly: number;
  onSeek: (ply: number) => void;
}) {
  if (evals.length < 2) return null;
  const W = 400;
  const H = 80;
  const MID = H / 2;
  const SCALE = MID / 600; // 600cp → full half height

  const clamp = (v: number) => Math.max(-600, Math.min(600, v));
  const toY = (v: number) => MID - clamp(v) * SCALE;

  const pts = evals.map((v, i) => {
    const x = (i / (evals.length - 1)) * W;
    const y = toY(v);
    return `${x},${y}`;
  });
  const linePts = pts.join(" ");

  // White-advantage fill (above midline)
  const whiteArea =
    `M ${(0 / (evals.length - 1)) * W},${MID} ` +
    evals.map((v, i) => `L ${(i / (evals.length - 1)) * W},${Math.min(MID, toY(v))}`).join(" ") +
    ` L ${W},${MID} Z`;

  // Black-advantage fill (below midline)
  const blackArea =
    `M ${(0 / (evals.length - 1)) * W},${MID} ` +
    evals.map((v, i) => `L ${(i / (evals.length - 1)) * W},${Math.max(MID, toY(v))}`).join(" ") +
    ` L ${W},${MID} Z`;

  const curX = (currentPly / (evals.length - 1)) * W;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full cursor-pointer rounded"
      style={{ height: H }}
      onClick={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        const idx = Math.round(pct * (evals.length - 1));
        onSeek(Math.max(0, Math.min(evals.length - 1, idx)));
      }}
    >
      {/* Background */}
      <rect x={0} y={0} width={W} height={H} fill="rgba(255,255,255,0.03)" rx={4} />
      {/* Center line */}
      <line x1={0} y1={MID} x2={W} y2={MID} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      {/* White advantage fill */}
      <path d={whiteArea} fill="rgba(212,175,55,0.25)" />
      {/* Black advantage fill */}
      <path d={blackArea} fill="rgba(0,0,0,0.5)" />
      {/* Eval line */}
      <polyline points={linePts} fill="none" stroke="rgb(212,175,55)" strokeWidth={1.5} />
      {/* Current ply indicator */}
      <line x1={curX} y1={0} x2={curX} y2={H} stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} />
      <circle cx={curX} cy={toY(evals[currentPly] ?? 0)} r={3} fill="white" />
    </svg>
  );
}

// ── Centipawn display ───────────────────────────────────────────────────────
function fmtCp(cp: number): string {
  const abs = Math.abs(cp);
  if (abs >= 100000) return cp > 0 ? "+M" : "-M"; // checkmate
  const pawns = (abs / 100).toFixed(1);
  return cp >= 0 ? `+${pawns}` : `-${pawns}`;
}

// ── Main component ──────────────────────────────────────────────────────────
export function AnalysisBoard({ gameId }: { gameId?: string }) {
  const [sans, setSans] = useState<string[]>([]);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [engineOn, setEngineOn] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(
    null,
  );

  // Analysis state
  const [analysisMap, setAnalysisMap] = useState<Map<number, MoveAnalysis>>(new Map());
  const [evals, setEvals] = useState<number[]>([]);
  const [analysing, setAnalysing] = useState(false);

  // Live eval for current position (from worker)
  const [liveEval, setLiveEval] = useState<{
    evalWhite: number;
    bestMoveSan: string | null;
    bestScore: number;
  } | null>(null);
  const evalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const loadedRef = useRef(false);
  // Accumulates per-move analyses for the run in progress so the "done"
  // handler can persist a complete report.
  const analysesRef = useRef<MoveAnalysis[]>([]);
  // Set only when reviewing a real saved game (so we persist to the right
  // game and never overwrite it once the user starts editing lines).
  const reviewCtxRef = useRef<{ gameId: string; opening: OpeningMatch | null } | null>(null);
  const savedRef = useRef(false);
  const [opening, setOpening] = useState<OpeningMatch | null>(null);
  const [reviewSaved, setReviewSaved] = useState(false);

  // ── Spawn worker ────────────────────────────────────────────────────────
  useEffect(() => {
    const w = new Worker(new URL("@/lib/chess/analysis.worker", import.meta.url), {
      type: "module",
    });
    w.onmessage = (e) => {
      const msg = e.data as
        | { type: "move"; data: MoveAnalysis }
        | { type: "done"; evals: number[] }
        | { type: "eval_result"; bestMoveSan: string | null; bestScore: number; evalWhite: number };

      if (msg.type === "move") {
        analysesRef.current.push(msg.data);
        setAnalysisMap((prev) => {
          const next = new Map(prev);
          next.set(msg.data.ply, msg.data);
          return next;
        });
      } else if (msg.type === "done") {
        setEvals(msg.evals);
        setAnalysing(false);
        // Persist the completed review for saved games (once).
        const ctx = reviewCtxRef.current;
        if (ctx && !savedRef.current && analysesRef.current.length > 0) {
          savedRef.current = true;
          const report = buildAnalysisReport(
            [...analysesRef.current].sort((a, b) => a.ply - b.ply),
          );
          saveGameAnalysis({
            gameId: ctx.gameId,
            ...report,
            openingName: ctx.opening?.name ?? null,
            openingEco: ctx.opening?.eco ?? null,
          })
            .then(() => setReviewSaved(true))
            .catch(() => {
              /* non-fatal — the review still shows, it just isn't cached */
            });
        }
      } else if (msg.type === "eval_result") {
        setLiveEval({
          evalWhite: msg.evalWhite,
          bestMoveSan: msg.bestMoveSan,
          bestScore: msg.bestScore,
        });
      }
    };
    workerRef.current = w;
    return () => {
      w.terminate();
    };
  }, []);

  // ── Run analysis ───────────────────────────────────────────────────────
  // Pass `gameId` only when analysing a real saved game (enables persistence).
  const runAnalysis = useCallback((gameSans: string[], persistGameId?: string) => {
    if (!workerRef.current || gameSans.length === 0) return;
    const op = detectOpening(gameSans);
    setOpening(op);
    setReviewSaved(false);
    analysesRef.current = [];
    savedRef.current = false;
    reviewCtxRef.current = persistGameId ? { gameId: persistGameId, opening: op } : null;
    setAnalysisMap(new Map());
    setEvals([]);
    setAnalysing(true);
    workerRef.current.postMessage({ type: "abort" });
    workerRef.current.postMessage({
      type: "analyze",
      sans: gameSans,
      depth: 4,
      bookPlies: op?.plies ?? 0,
    });
  }, []);

  // ── Debounced live eval on ply change ──────────────────────────────────
  useEffect(() => {
    if (!engineOn || !workerRef.current) return;
    if (evalTimerRef.current) clearTimeout(evalTimerRef.current);
    evalTimerRef.current = setTimeout(() => {
      const chess = new Chess();
      for (let i = 0; i < ply; i++) {
        try {
          chess.move(sans[i]);
        } catch {
          break;
        }
      }
      workerRef.current?.postMessage({ type: "eval", fen: chess.fen(), depth: 4 });
    }, 120);
    return () => {
      if (evalTimerRef.current) clearTimeout(evalTimerRef.current);
    };
  }, [ply, sans, engineOn]);

  // ── Load from Supabase game ─────────────────────────────────────────────
  useEffect(() => {
    if (!gameId || loadedRef.current) return;
    loadedRef.current = true;
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
        try {
          const g = new Chess();
          g.loadPgn(data.pgn);
          const history = g.history();
          setSans(history);
          setPly(history.length);
          toast.success(`Game loaded — ${history.length} moves.`);
          runAnalysis(history, gameId);
        } catch {
          toast.error("Could not parse this game's PGN.");
        }
      });
  }, [gameId, runAnalysis]);

  // ── Load from localStorage (VsComputer "Analyze" button) ───────────────
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const stored = localStorage.getItem("chessox-analysis-pgn");
    if (!stored) return;
    localStorage.removeItem("chessox-analysis-pgn");
    try {
      const g = new Chess();
      g.loadPgn(stored);
      const history = g.history();
      setSans(history);
      setPly(history.length);
      toast.success("Game loaded into the engine room.");
      runAnalysis(history);
    } catch {
      /* ignore */
    }
  }, [runAnalysis]);

  // ── Arrow-key navigation ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPly((p) => Math.max(0, p - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setPly((p) => Math.min(sans.length, p + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setPly(0);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setPly(sans.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sans.length]);

  const current = useMemo(() => {
    const g = new Chess();
    for (let i = 0; i < ply; i++) {
      if (!sans[i]) break;
      try {
        g.move(sans[i]);
      } catch (e) {
        console.error("Failed to apply move in AnalysisBoard:", sans[i], e);
        break;
      }
    }
    return g;
  }, [sans, ply]);

  const lastMove = useMemo(() => {
    const h = current.history({ verbose: true });
    const last = h[h.length - 1];
    return last ? { from: last.from, to: last.to } : null;
  }, [current]);

  const checkSquare = useMemo(() => {
    if (!current.inCheck()) return null;
    const turn = current.turn();
    for (const row of current.board())
      for (const cell of row)
        if (cell && cell.type === "k" && cell.color === turn) return cell.square;
    return null;
  }, [current]);

  // Eval bar: use live eval when available
  const evalWhite = liveEval?.evalWhite ?? 0;
  const barPct = Math.max(5, Math.min(95, 50 + (evalWhite / 600) * 45));

  const makeMove = (from: string, to: string, promotion?: string) => {
    const g = new Chess(current.fen());
    try {
      const made = g.move({ from, to, promotion: promotion ?? "q" });
      // Editing a line detaches from the saved game — don't persist over it.
      reviewCtxRef.current = null;
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
    const candidates = current
      .moves({ square: selected as Square, verbose: true })
      .filter((m) => m.to === sq);
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
      const history = g.history();
      setSans(history);
      setPly(0);
      setImportOpen(false);
      setImportText("");
      setAnalysisMap(new Map());
      setEvals([]);
      toast.success(`PGN imported — ${history.length} moves loaded.`);
      runAnalysis(history);
    } catch {
      toast.error("Could not parse that PGN. Check the format and try again.");
    }
  };

  const doExport = async () => {
    const g = new Chess();
    for (const s of sans) g.move(s);
    const pgn = g.pgn();
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
    workerRef.current?.postMessage({ type: "abort" });
    reviewCtxRef.current = null;
    setOpening(null);
    setReviewSaved(false);
    setSans([]);
    setPly(0);
    setSelected(null);
    setTargets([]);
    setAnalysisMap(new Map());
    setEvals([]);
    setAnalysing(false);
    setLiveEval(null);
    toast.info("Board reset to the starting position.");
  };

  // Accuracy per side
  const accuracy = useMemo(() => {
    const wa: number[] = [];
    const ba: number[] = [];
    analysisMap.forEach((a) => {
      const score = Math.max(0, 100 - a.cpl);
      if (a.ply % 2 === 1)
        wa.push(score); // white moves (plies 1,3,5,…)
      else ba.push(score);
    });
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
    return { white: avg(wa), black: avg(ba) };
  }, [analysisMap]);

  const movePairs: [string, string | undefined][] = [];
  for (let i = 0; i < sans.length; i += 2) movePairs.push([sans[i], sans[i + 1]]);

  const evalColor = evalWhite >= 0 ? "text-gold" : "text-muted-foreground";
  const evalLabel = evalWhite >= 0 ? `White ${fmtCp(evalWhite)}` : `Black ${fmtCp(-evalWhite)}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <GhostButton onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Import PGN
        </GhostButton>
        <GhostButton onClick={doExport}>
          <Download className="h-4 w-4" /> Export PGN
        </GhostButton>
        <GhostButton onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
          <RefreshCw className="h-4 w-4" /> Flip Board
        </GhostButton>
        <GhostButton onClick={reset}>
          <RotateCcw className="h-4 w-4" /> Reset
        </GhostButton>
        <GoldButton onClick={() => setEngineOn((v) => !v)}>
          <Cpu className="h-4 w-4" /> Engine {engineOn ? "On" : "Off"}
        </GoldButton>
        {analysing && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing…
          </div>
        )}
        {opening && (
          <div className="flex items-center rounded-full border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-xs text-amber-300/90">
            {opening.eco} · {opening.name}
          </div>
        )}
        {reviewSaved && (
          <div className="flex items-center text-xs text-emerald-400">Review saved ✓</div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Board column */}
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

          {/* Move slider */}
          {sans.length > 0 && (
            <div className="mt-3 px-1">
              <input
                type="range"
                min={0}
                max={sans.length}
                value={ply}
                onChange={(e) => setPly(Number(e.target.value))}
                className="w-full accent-gold cursor-pointer"
              />
            </div>
          )}

          <div className="mt-2 flex items-center justify-center gap-2">
            <GhostButton onClick={() => setPly(0)} aria-label="First move">
              <ChevronsLeft className="h-4 w-4" />
            </GhostButton>
            <GhostButton
              onClick={() => setPly((p) => Math.max(0, p - 1))}
              aria-label="Previous move"
            >
              <ChevronLeft className="h-4 w-4" />
            </GhostButton>
            <span className="px-3 text-sm text-muted-foreground tabular-nums">
              {ply} / {sans.length}
            </span>
            <GhostButton
              onClick={() => setPly((p) => Math.min(sans.length, p + 1))}
              aria-label="Next move"
            >
              <ChevronRight className="h-4 w-4" />
            </GhostButton>
            <GhostButton onClick={() => setPly(sans.length)} aria-label="Last move">
              <ChevronsRight className="h-4 w-4" />
            </GhostButton>
          </div>
          <div className="mt-1 text-center text-xs text-muted-foreground">
            ← → arrow keys · drag slider · click moves
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4 lg:col-span-5">
          {/* Engine panel */}
          {engineOn && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-display">Engine</div>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-400">
                  Depth 4
                </span>
              </div>

              {/* Eval bar */}
              <div className="mb-3 h-2.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full gradient-gold transition-all duration-300"
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <div className="mb-3 flex justify-between text-xs text-muted-foreground">
                <span>♚ {fmtCp(-evalWhite)}</span>
                <span className={evalColor}>{evalLabel}</span>
                <span>♔ {fmtCp(evalWhite)}</span>
              </div>

              {liveEval?.bestMoveSan ? (
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
                  <div className="text-xs text-muted-foreground mb-1">Best move</div>
                  <div className="font-mono text-gold">{liveEval.bestMoveSan}</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {current.moves().length === 0 ? "Game over." : "Computing…"}
                </div>
              )}

              {/* Accuracy summary (shown when analysis is done) */}
              {!analysing && (accuracy.white !== null || accuracy.black !== null) && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3 text-xs">
                  <div className="text-center">
                    <div className="text-muted-foreground">White accuracy</div>
                    <div className="mt-0.5 font-display text-lg text-gold">
                      {accuracy.white ?? "—"}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground">Black accuracy</div>
                    <div className="mt-0.5 font-display text-lg text-gold">
                      {accuracy.black ?? "—"}%
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Eval graph */}
          {evals.length >= 2 && (
            <Card className="p-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Evaluation Graph
              </div>
              <EvalGraph
                evals={evals}
                currentPly={Math.min(ply, evals.length - 1)}
                onSeek={setPly}
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>Start</span>
                <span>Move {Math.floor(evals.length / 2)}</span>
              </div>
            </Card>
          )}

          {/* Move list with classifications */}
          <Card className="p-5">
            <div className="mb-2 font-display">Move List</div>
            {sans.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No moves yet — play on the board or import a PGN.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-0.5 text-sm">
                  {movePairs.map((pair, i) => {
                    const whitePly = i * 2 + 1;
                    const blackPly = i * 2 + 2;
                    const wa = analysisMap.get(whitePly);
                    const ba = analysisMap.get(blackPly);
                    return (
                      <div className="contents" key={i}>
                        <div className="text-muted-foreground py-0.5">{i + 1}.</div>
                        <button
                          type="button"
                          onClick={() => setPly(whitePly)}
                          className={`flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-white/5 ${ply === whitePly ? "bg-gold/15 text-gold" : ""}`}
                        >
                          {wa && <ClassBadge cls={wa.classification} />}
                          <span>{pair[0]}</span>
                        </button>
                        {pair[1] ? (
                          <button
                            type="button"
                            onClick={() => setPly(blackPly)}
                            className={`flex items-center gap-1 rounded px-1 py-0.5 text-left text-muted-foreground hover:bg-white/5 ${ply === blackPly ? "bg-gold/15 text-gold" : ""}`}
                          >
                            {ba && <ClassBadge cls={ba.classification} />}
                            <span>{pair[1]}</span>
                          </button>
                        ) : (
                          <div />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* Move detail (current ply's analysis) */}
          {ply > 0 && analysisMap.has(ply) && (
            <Card className="p-4 text-sm">
              {(() => {
                const a = analysisMap.get(ply)!;
                return (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-medium">{a.san}</span>
                      <span className={`text-xs font-semibold ${CLASS_COLOR[a.classification]}`}>
                        {CLASS_ICON[a.classification]} {CLASS_LABEL[a.classification]}
                      </span>
                    </div>
                    {a.cpl > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {a.cpl}cp loss
                        {a.bestMoveSan && a.bestMoveSan !== a.san && (
                          <>
                            {" "}
                            · Best was <span className="text-gold font-mono">{a.bestMoveSan}</span>
                          </>
                        )}
                      </div>
                    )}
                    {a.cpl === 0 && a.bestMoveSan && (
                      <div className="text-xs text-muted-foreground">Optimal move played.</div>
                    )}
                  </>
                );
              })()}
            </Card>
          )}
        </div>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="border-gold/25 bg-background/95 backdrop-blur-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Import PGN</DialogTitle>
            <DialogDescription>
              Paste a PGN below — the board and move list will be populated and analysed.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ..."}
            className="min-h-[160px] border-gold/20 bg-white/[0.02] font-mono text-xs"
          />
          <DialogFooter>
            <GhostButton onClick={() => setImportOpen(false)}>Cancel</GhostButton>
            <GoldButton onClick={doImport}>Import &amp; Analyse</GoldButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
