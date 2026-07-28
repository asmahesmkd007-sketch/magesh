import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { loadPgnSafe } from "@/lib/chess/validation";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Play,
  Pause,
  RotateCcw,
  ArrowLeft,
  LineChart,
  Crown,
  Loader2,
  Sparkles,
  Clock,
} from "lucide-react";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { InteractiveBoard } from "@/components/site/InteractiveBoard";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGameSettings } from "@/hooks/useGameSettings";
import {
  type Classification,
  CLASS_LABEL,
  CLASS_COLOR,
  CLASS_ICON,
  CLASS_ORDER,
  isClassification,
} from "@/lib/chess/classification";
import { detectOpening } from "@/lib/chess/openings";
import { soundForChessMove } from "@/lib/audio/sounds";
import {
  fetchReviewMoves,
  fetchGameAnalysis,
  saveGameAnalysis,
  buildAnalysisReport,
  type ReviewMove,
  type GameAnalysis,
  type ClassCounts,
} from "@/lib/api/analysisClient";
import type { MoveAnalysis } from "@/lib/chess/analysis.worker";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/game/$id/review")({
  head: () =>
    noindexSeo(
      "Chess Game Review — ChessOx",
      "Move-by-move review of a finished chess game on ChessOx, with accuracy and key moments.",
    ),
  component: GameReview,
});

type GameRow = {
  id: string;
  white_id: string | null;
  black_id: string | null;
  white_username: string | null;
  black_username: string | null;
  white_rating: number | null;
  black_rating: number | null;
  pgn: string | null;
  result: string;
  end_reason: string | null;
  time_class: string;
  time_control: string;
  initial_seconds: number;
  is_rated: boolean;
  ended_at: string | null;
  created_at: string;
  vs_computer: boolean;
  opening: string | null;
};

const PIECE_UNICODE: Record<string, Record<string, string>> = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};
const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function CapturedPieces({ current, orientation }: { current: Chess; orientation: "w" | "b" }) {
  const captured = useMemo(() => {
    const initial = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const remaining: Record<"w" | "b", Record<string, number>> = {
      w: { ...initial },
      b: { ...initial },
    };
    for (const row of current.board()) {
      for (const cell of row) {
        if (!cell) continue;
        const color = cell.color as "w" | "b";
        const type = cell.type;
        if (type !== "k" && remaining[color][type] !== undefined) remaining[color][type]--;
      }
    }
    const whiteCaptured: string[] = [];
    const blackCaptured: string[] = [];
    for (const [type, count] of Object.entries(remaining.b))
      for (let i = 0; i < Math.max(0, count); i++) whiteCaptured.push(type);
    for (const [type, count] of Object.entries(remaining.w))
      for (let i = 0; i < Math.max(0, count); i++) blackCaptured.push(type);
    whiteCaptured.sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
    blackCaptured.sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
    const materialAdv =
      whiteCaptured.reduce((s, p) => s + PIECE_VALUE[p], 0) -
      blackCaptured.reduce((s, p) => s + PIECE_VALUE[p], 0);
    return { whiteCaptured, blackCaptured, materialAdv };
  }, [current]);

  const top = orientation === "w" ? "black" : "white";
  const bottom = orientation === "w" ? "white" : "black";
  const topPieces = top === "white" ? captured.whiteCaptured : captured.blackCaptured;
  const bottomPieces = bottom === "white" ? captured.whiteCaptured : captured.blackCaptured;
  const captureColor = top === "white" ? "b" : "w";
  const bottomCaptureColor = bottom === "white" ? "b" : "w";

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-center gap-1 min-h-[20px]">
        {topPieces.map((p, i) => (
          <span key={i} className="text-base leading-none">
            {PIECE_UNICODE[captureColor][p]}
          </span>
        ))}
        {captured.materialAdv < 0 && (
          <span className="text-xs text-muted-foreground ml-1">
            +{Math.abs(captured.materialAdv)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 min-h-[20px]">
        {bottomPieces.map((p, i) => (
          <span key={i} className="text-base leading-none">
            {PIECE_UNICODE[bottomCaptureColor][p]}
          </span>
        ))}
        {captured.materialAdv > 0 && (
          <span className="text-xs text-muted-foreground ml-1">+{captured.materialAdv}</span>
        )}
      </div>
    </div>
  );
}

// ── Eval graph (white-perspective centipawns per ply) ───────────────────────
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
  const H = 70;
  const MID = H / 2;
  const SCALE = MID / 600;
  const clamp = (v: number) => Math.max(-600, Math.min(600, v));
  const toY = (v: number) => MID - clamp(v) * SCALE;
  const linePts = evals.map((v, i) => `${(i / (evals.length - 1)) * W},${toY(v)}`).join(" ");
  const whiteArea =
    `M 0,${MID} ` +
    evals.map((v, i) => `L ${(i / (evals.length - 1)) * W},${Math.min(MID, toY(v))}`).join(" ") +
    ` L ${W},${MID} Z`;
  const blackArea =
    `M 0,${MID} ` +
    evals.map((v, i) => `L ${(i / (evals.length - 1)) * W},${Math.max(MID, toY(v))}`).join(" ") +
    ` L ${W},${MID} Z`;
  const curX = (Math.min(currentPly, evals.length - 1) / (evals.length - 1)) * W;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full cursor-pointer rounded"
      style={{ height: H }}
      onClick={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        onSeek(Math.max(0, Math.min(evals.length - 1, Math.round(pct * (evals.length - 1)))));
      }}
    >
      <rect x={0} y={0} width={W} height={H} fill="rgba(255,255,255,0.03)" rx={4} />
      <line x1={0} y1={MID} x2={W} y2={MID} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      <path d={whiteArea} fill="rgba(212,175,55,0.25)" />
      <path d={blackArea} fill="rgba(0,0,0,0.5)" />
      <polyline points={linePts} fill="none" stroke="rgb(212,175,55)" strokeWidth={1.5} />
      <line x1={curX} y1={0} x2={curX} y2={H} stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} />
      <circle
        cx={curX}
        cy={toY(evals[Math.min(currentPly, evals.length - 1)] ?? 0)}
        r={3}
        fill="white"
      />
    </svg>
  );
}

function ClassBadge({ cls }: { cls: Classification }) {
  return (
    <span
      className={`inline-block w-6 text-center text-[10px] font-bold leading-none ${CLASS_COLOR[cls]}`}
      title={CLASS_LABEL[cls]}
    >
      {CLASS_ICON[cls]}
    </span>
  );
}

function outcomeLabel(game: GameRow, userId: string | undefined): string {
  if (game.result === "draw") return "Draw";
  const userIsWhite = userId && game.white_id === userId;
  const userIsBlack = userId && game.black_id === userId;
  if (game.result === "white") {
    if (userIsWhite) return "You Won";
    if (userIsBlack) return "You Lost";
    return "White Won";
  }
  if (game.result === "black") {
    if (userIsBlack) return "You Won";
    if (userIsWhite) return "You Lost";
    return "Black Won";
  }
  return "Finished";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtClock(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function GameReview() {
  const { id } = useParams({ from: "/game/$id/review" });
  const { user } = useAuth();
  const { settings } = useGameSettings();
  const navigate = useNavigate();

  const [game, setGame] = useState<GameRow | null>(null);
  const [moves, setMoves] = useState<ReviewMove[]>([]);
  const [sans, setSans] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [ratingDelta, setRatingDelta] = useState<number | null>(null);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [whiteProfile, setWhiteProfile] = useState<{
    premium_active?: boolean;
    premium_expires_at?: string | null;
  } | null>(null);
  const [blackProfile, setBlackProfile] = useState<{
    premium_active?: boolean;
    premium_expires_at?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewProgress, setReviewProgress] = useState(0);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // ── Load game + moves + analysis ───────────────────────────────────────
  const load = useCallback(async () => {
    const [{ data: g, error: ge }, m, a] = await Promise.all([
      supabase.from("games").select("*").eq("id", id).maybeSingle(),
      fetchReviewMoves(id),
      fetchGameAnalysis(id),
    ]);
    if (ge || !g) {
      setError("Game not found.");
      setLoading(false);
      return;
    }
    const gameRow = g as unknown as GameRow;
    let moveSans: string[] = m.map((r) => r.san);
    if (moveSans.length === 0 && gameRow.pgn) {
      // loadPgnSafe never throws and rejects corrupt/illegal PGN records.
      const loaded = loadPgnSafe(gameRow.pgn);
      if (loaded) moveSans = loaded.sans;
    }
    setGame(gameRow);
    setMoves(m);
    setSans(moveSans);
    setAnalysis(a);
    setPly(moveSans.length);
    if (user && gameRow.black_id === user.id) setOrientation("b");
    else setOrientation("w");

    if (gameRow.white_id || gameRow.black_id) {
      const ids = [];
      if (gameRow.white_id) ids.push(gameRow.white_id);
      if (gameRow.black_id) ids.push(gameRow.black_id);
      const { data } = await supabase
        .from("profiles")
        .select("id, premium_active, premium_expires_at")
        .in("id", ids);
      const rows = (data ?? []) as Array<{
        id: string;
        premium_active?: boolean;
        premium_expires_at?: string | null;
      }>;
      if (data) {
        setWhiteProfile(rows.find((d) => d.id === gameRow.white_id) || null);
        setBlackProfile(rows.find((d) => d.id === gameRow.black_id) || null);
      }
    }

    setLoading(false);

    // Rating delta for the viewing user (rated games only).
    if (user) {
      const { data: rh } = await supabase
        .from("rating_history" as never)
        .select("delta")
        .eq("game_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      setRatingDelta((rh as { delta: number } | null)?.delta ?? null);
    }
  }, [id, user]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load().catch(() => {
      if (alive) {
        setError("Failed to load game.");
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [load]);

  // Shared step helpers — used by arrow keys, the transport buttons, and the
  // swipe gesture below, so "go to previous/next move" only lives in one place.
  const stepBack = useCallback(() => {
    setPlaying(false);
    setPly((p) => Math.max(0, p - 1));
  }, []);
  const stepForward = useCallback(() => {
    setPlaying(false);
    setPly((p) => Math.min(sans.length, p + 1));
  }, [sans.length]);

  // ── Swipe navigation (mobile_gestures) ───────────────────────────────────
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onBoardTouchStart = (e: React.TouchEvent) => {
    if (!settings.mobile_gestures) return;
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onBoardTouchEnd = (e: React.TouchEvent) => {
    if (!settings.mobile_gestures || !touchStart.current) return;
    const t = e.changedTouches[0];
    const start = touchStart.current;
    touchStart.current = null;
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Require a clearly horizontal swipe so it doesn't fire on vertical scroll.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) stepBack();
      else stepForward();
    }
  };

  // ── Arrow-key navigation ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepBack();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepForward();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setPlaying(false);
        setPly(0);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setPlaying(false);
        setPly(sans.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sans.length, stepBack, stepForward]);

  // ── Autoplay ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (playing) {
      autoPlayRef.current = setInterval(() => {
        setPly((p) => {
          if (p >= sans.length) {
            setPlaying(false);
            return p;
          }
          return p + 1;
        });
      }, 1200);
    } else if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
    };
  }, [playing, sans.length]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const current = useMemo(() => {
    const chess = new Chess();
    for (let i = 0; i < ply; i++) {
      try {
        chess.move(sans[i]);
      } catch {
        break;
      }
    }
    return chess;
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

  // Move audio when stepping/scrubbing through the replay (manual nav and
  // auto-play both funnel through `ply`). Skip the very first render so
  // loading a game doesn't fire a sound for its whole history.
  const prevPlyRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevPlyRef.current === null) {
      prevPlyRef.current = ply;
      return;
    }
    if (ply === prevPlyRef.current) return;
    prevPlyRef.current = ply;
    if (ply === 0) return;
    const h = current.history({ verbose: true });
    const last = h[h.length - 1];
    if (last) soundForChessMove(last, current);
  }, [ply, current]);

  // ── Per-ply data derived from stored moves ──────────────────────────────
  const classByPly = useMemo(() => {
    const map = new Map<number, Classification>();
    for (const mv of moves)
      if (isClassification(mv.classification)) map.set(mv.ply, mv.classification);
    return map;
  }, [moves]);

  const hasAnalysis = analysis?.analysis_status === "done" || classByPly.size > 0;

  // White-perspective eval per position index (0 = start). Carries the last
  // known eval forward across any un-annotated plies so the line stays smooth.
  const evals = useMemo(() => {
    if (!hasAnalysis) return [] as number[];
    const byPly = new Map<number, number>();
    for (const mv of moves) if (mv.eval_after_cp != null) byPly.set(mv.ply, mv.eval_after_cp);
    if (byPly.size === 0) return [] as number[];
    const out: number[] = [0];
    let last = 0;
    for (let p = 1; p <= sans.length; p++) {
      if (byPly.has(p)) last = byPly.get(p)!;
      out.push(last);
    }
    return out;
  }, [moves, sans.length, hasAnalysis]);

  // Both players' remaining clock after every ply (for the clock timeline).
  const clocks = useMemo(() => {
    const init = (game?.initial_seconds ?? 0) * 1000 || null;
    const white: (number | null)[] = [init];
    const black: (number | null)[] = [init];
    let w = init;
    let b = init;
    const byPly = new Map<number, number | null>();
    for (const mv of moves) byPly.set(mv.ply, mv.time_left_ms);
    for (let p = 1; p <= sans.length; p++) {
      const t = byPly.get(p);
      if (p % 2 === 1) {
        if (t != null) w = t;
      } else if (t != null) b = t;
      white.push(w);
      black.push(b);
    }
    return { white, black };
  }, [moves, sans.length, game?.initial_seconds]);

  const movePairs: [string, string | undefined][] = [];
  for (let i = 0; i < sans.length; i += 2) movePairs.push([sans[i], sans[i + 1]]);

  // ── Run the engine review and persist it ────────────────────────────────
  const runReview = useCallback(() => {
    if (reviewing || sans.length === 0) return;
    setReviewing(true);
    setReviewProgress(0);
    const collected: MoveAnalysis[] = [];
    const opening = detectOpening(sans);
    const w = new Worker(new URL("@/lib/chess/analysis.worker", import.meta.url), {
      type: "module",
    });
    workerRef.current?.terminate();
    workerRef.current = w;
    w.onmessage = (e) => {
      const msg = e.data as
        | { type: "move"; data: MoveAnalysis }
        | { type: "done"; evals: number[] };
      if (msg.type === "move") {
        collected.push(msg.data);
        setReviewProgress(Math.round((collected.length / sans.length) * 100));
      } else if (msg.type === "done") {
        const report = buildAnalysisReport([...collected].sort((a, b) => a.ply - b.ply));
        saveGameAnalysis({
          gameId: id,
          ...report,
          openingName: opening?.name ?? null,
          openingEco: opening?.eco ?? null,
        })
          .then(() => load())
          .catch(() => {
            /* persistence failed — surface nothing fatal */
          })
          .finally(() => {
            setReviewing(false);
            w.terminate();
            if (workerRef.current === w) workerRef.current = null;
          });
      }
    };
    w.postMessage({ type: "analyze", sans, depth: 4, bookPlies: opening?.plies ?? 0 });
  }, [reviewing, sans, id, load]);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <PageShell title="Game Not Found">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">{error ?? "This game does not exist."}</p>
          <div className="mt-6">
            <Link to="/play/history">
              <GoldButton>
                <ArrowLeft className="h-4 w-4" /> Back to History
              </GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  const outcome = outcomeLabel(game, user?.id);
  const openingName = analysis?.opening_name ?? game.opening ?? detectOpening(sans)?.name ?? null;
  const curClass = ply > 0 ? classByPly.get(ply) : undefined;
  const curMove = ply > 0 ? moves.find((m) => m.ply === ply) : undefined;

  // Counts summary (only classes that actually occurred).
  const counts = (cc: ClassCounts | null | undefined) =>
    CLASS_ORDER.filter((c) => (cc?.[c] ?? 0) > 0).map((c) => [c, cc![c]!] as const);

  return (
    <PageShell>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-gold/70">Game Review</div>
          <h1 className="mt-1 font-display text-3xl flex items-center flex-wrap">
            {game.white_username ?? "White"}
            <PremiumBadge
              premiumActive={whiteProfile?.premium_active}
              premiumExpiresAt={whiteProfile?.premium_expires_at}
              className="mx-2 h-6 w-6"
            />
            vs
            <span className="ml-2 flex items-center">
              {game.black_username ?? "Black"}
              <PremiumBadge
                premiumActive={blackProfile?.premium_active}
                premiumExpiresAt={blackProfile?.premium_expires_at}
                className="ml-2 h-6 w-6"
              />
            </span>
          </h1>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="capitalize">
              {game.time_class} · {game.time_control}
            </span>
            {game.is_rated && <span className="rounded px-1.5 py-0.5 bg-white/5">Rated</span>}
            {openingName && <span className="text-amber-300/80">{openingName}</span>}
            {game.ended_at && <span>{fmtDate(game.ended_at)}</span>}
            <span className="font-medium text-gold capitalize">
              {outcome} — {game.end_reason ?? game.result}
            </span>
            {ratingDelta != null && (
              <span className={ratingDelta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {ratingDelta >= 0 ? "+" : ""}
                {ratingDelta} rating
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/play/history">
            <GhostButton>
              <ArrowLeft className="h-4 w-4" /> History
            </GhostButton>
          </Link>
          <GoldButton onClick={() => navigate({ to: "/analysis", search: { gameId: id } })}>
            <LineChart className="h-4 w-4" /> Open in Analysis
          </GoldButton>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Board column */}
        <div className="lg:col-span-7">
          {/* Top player: name + clock + captured */}
          <div className="mb-1 flex items-center justify-between px-1">
            <CapturedPieces current={current} orientation={orientation} />
            <span className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 font-mono text-sm tabular-nums">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              {fmtClock(orientation === "w" ? clocks.black[ply] : clocks.white[ply])}
            </span>
          </div>

          <div onTouchStart={onBoardTouchStart} onTouchEnd={onBoardTouchEnd}>
            <InteractiveBoard
              board={current.board()}
              orientation={orientation}
              selected={null}
              targets={[]}
              lastMove={lastMove}
              checkSquare={checkSquare ?? undefined}
              onSquare={() => {}}
              disabled
            />
          </div>

          {/* Bottom player: clock + captured */}
          <div className="mt-1 flex items-center justify-between px-1">
            <CapturedPieces current={current} orientation={orientation === "w" ? "b" : "w"} />
            <span className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 font-mono text-sm tabular-nums">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              {fmtClock(orientation === "w" ? clocks.white[ply] : clocks.black[ply])}
            </span>
          </div>

          {/* Move slider */}
          {sans.length > 0 && (
            <div className="mt-2 px-1">
              <input
                type="range"
                min={0}
                max={sans.length}
                value={ply}
                onChange={(e) => {
                  setPlaying(false);
                  setPly(Number(e.target.value));
                }}
                className="w-full accent-gold cursor-pointer"
              />
            </div>
          )}

          {/* Navigation controls */}
          <div className="mt-2 flex items-center justify-center gap-2">
            <GhostButton
              onClick={() => {
                setPlaying(false);
                setPly(0);
              }}
              aria-label="First move"
            >
              <ChevronsLeft className="h-4 w-4" />
            </GhostButton>
            <GhostButton onClick={stepBack} aria-label="Previous move">
              <ChevronLeft className="h-4 w-4" />
            </GhostButton>
            <GhostButton
              onClick={() => {
                if (ply >= sans.length) setPly(0);
                setPlaying((p) => !p);
              }}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </GhostButton>
            <span className="w-20 text-center text-sm tabular-nums text-muted-foreground">
              {ply} / {sans.length}
            </span>
            <GhostButton onClick={stepForward} aria-label="Next move">
              <ChevronRight className="h-4 w-4" />
            </GhostButton>
            <GhostButton
              onClick={() => {
                setPlaying(false);
                setPly(sans.length);
              }}
              aria-label="Last move"
            >
              <ChevronsRight className="h-4 w-4" />
            </GhostButton>
          </div>

          <div className="mt-2 flex justify-center gap-4">
            <button
              onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Flip Board
            </button>
            <span className="text-xs text-muted-foreground">← → arrow keys to navigate</span>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4 lg:col-span-5">
          {/* Result card */}
          <Card className="p-5 text-center">
            <Crown className="mx-auto h-6 w-6 text-gold" />
            <div className="mt-2 font-display text-2xl text-gradient-gold">{outcome}</div>
            {game.end_reason && (
              <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground capitalize">
                {game.end_reason}
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="text-xs text-muted-foreground">♔ White</div>
                <div className="mt-1 font-display flex items-center">
                  {game.white_username ?? "—"}
                  <PremiumBadge
                    premiumActive={whiteProfile?.premium_active}
                    premiumExpiresAt={whiteProfile?.premium_expires_at}
                  />
                </div>
                {game.white_rating && <div className="text-xs text-gold">{game.white_rating}</div>}
                {analysis?.accuracy_white != null && (
                  <div className="mt-1 text-xs text-emerald-400">
                    {analysis.accuracy_white}% acc
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="text-xs text-muted-foreground">♚ Black</div>
                <div className="mt-1 font-display flex items-center">
                  {game.black_username ?? "—"}
                  <PremiumBadge
                    premiumActive={blackProfile?.premium_active}
                    premiumExpiresAt={blackProfile?.premium_expires_at}
                  />
                </div>
                {game.black_rating && <div className="text-xs text-gold">{game.black_rating}</div>}
                {analysis?.accuracy_black != null && (
                  <div className="mt-1 text-xs text-emerald-400">
                    {analysis.accuracy_black}% acc
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Review / report card */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-display">Game Report</div>
              {!hasAnalysis && (
                <GoldButton onClick={runReview} disabled={reviewing || sans.length === 0}>
                  {reviewing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> {reviewProgress}%
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Review Game
                    </>
                  )}
                </GoldButton>
              )}
            </div>

            {!hasAnalysis && !reviewing && (
              <p className="text-xs text-muted-foreground">
                Run a full engine review to grade every move (Brilliant → Blunder), compute
                accuracy, and chart the evaluation. Results are saved for instant reload.
              </p>
            )}

            {hasAnalysis && (
              <>
                {evals.length >= 2 && (
                  <div className="mb-3">
                    <EvalGraph evals={evals} currentPly={ply} onSeek={setPly} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="mb-1 font-medium text-muted-foreground">♔ White</div>
                    {counts(analysis?.class_counts_white).length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      counts(analysis?.class_counts_white).map(([c, n]) => (
                        <div key={c} className="flex items-center justify-between">
                          <span className={CLASS_COLOR[c]}>
                            {CLASS_ICON[c]} {CLASS_LABEL[c]}
                          </span>
                          <span className="tabular-nums">{n}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <div className="mb-1 font-medium text-muted-foreground">♚ Black</div>
                    {counts(analysis?.class_counts_black).length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      counts(analysis?.class_counts_black).map(([c, n]) => (
                        <div key={c} className="flex items-center justify-between">
                          <span className={CLASS_COLOR[c]}>
                            {CLASS_ICON[c]} {CLASS_LABEL[c]}
                          </span>
                          <span className="tabular-nums">{n}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Current move detail */}
                {ply > 0 && curMove && (
                  <div className="mt-3 border-t border-white/5 pt-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium">
                        {Math.ceil(ply / 2)}
                        {ply % 2 === 1 ? "." : "..."} {curMove.san}
                      </span>
                      {curClass && (
                        <span className={`text-xs font-semibold ${CLASS_COLOR[curClass]}`}>
                          {CLASS_ICON[curClass]} {CLASS_LABEL[curClass]}
                        </span>
                      )}
                    </div>
                    {curMove.best_move_san && curMove.best_move_san !== curMove.san && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Best was{" "}
                        <span className="font-mono text-gold">{curMove.best_move_san}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Move list */}
          <Card className="p-5">
            <div className="mb-3 font-display">Moves</div>
            {sans.length === 0 ? (
              <p className="text-xs text-muted-foreground">No move data recorded for this game.</p>
            ) : (
              <div className="grid max-h-[340px] grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 overflow-y-auto pr-2 text-sm scrollbar-thin">
                {movePairs.map((pair, i) => {
                  const wPly = i * 2 + 1;
                  const bPly = i * 2 + 2;
                  const wc = classByPly.get(wPly);
                  const bc = classByPly.get(bPly);
                  return (
                    <div className="contents" key={i}>
                      <div className="text-muted-foreground">{i + 1}.</div>
                      <button
                        type="button"
                        onClick={() => setPly(wPly)}
                        className={`flex items-center gap-1 rounded px-1 text-left hover:bg-white/5 ${
                          ply === wPly ? "bg-gold/15 text-gold" : ""
                        }`}
                      >
                        {wc && <ClassBadge cls={wc} />}
                        <span>{pair[0]}</span>
                      </button>
                      {pair[1] ? (
                        <button
                          type="button"
                          onClick={() => setPly(bPly)}
                          className={`flex items-center gap-1 rounded px-1 text-left text-muted-foreground hover:bg-white/5 ${
                            ply === bPly ? "bg-gold/15 text-gold" : ""
                          }`}
                        >
                          {bc && <ClassBadge cls={bc} />}
                          <span>{pair[1]}</span>
                        </button>
                      ) : (
                        <div />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
