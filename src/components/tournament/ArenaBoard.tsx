import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chess, type Square } from "chess.js";
import { toast } from "sonner";
import { Flag, Handshake, Loader2, OctagonX, Timer, WifiOff } from "lucide-react";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import { PromotionPicker } from "@/components/site/PromotionPicker";
import { CapturedPieces } from "@/components/site/CapturedPieces";
import { ClockTime } from "@/components/site/ClockTime";
import { GoldButton, GhostButton } from "@/components/site/Primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useGameSettings } from "@/hooks/useGameSettings";
import { useClockAudio } from "@/hooks/useClockAudio";
import { submitMove, resignGame, respondDraw, claimTimeout } from "@/lib/api/gameClient";
import {
  abortGame,
  claimNoShow,
  declineDraw,
  type CaptureRow,
  type TournamentEntry,
} from "@/lib/api/tournamentClient";
import { playGameSound, soundForChessMove } from "@/lib/audio/sounds";
import { buzz } from "@/lib/haptics";
import { PlayerAvatar, fmtClock } from "./bits";

// =====================================================================
// ArenaBoard — the TR lobby's playable match surface (Boxes 6–11).
// Same server contract as the main game page (optimistic move → makeMove
// server fn → realtime reconciliation; resign/draw/timeout RPCs) plus the
// arena-only actions: abort-with-replacement and no-show claim. The board
// itself is InteractiveBoard, which always renders the player's saved
// board + piece theme.
// =====================================================================
type GameRow = {
  id: string;
  white_id: string | null;
  black_id: string | null;
  white_username: string | null;
  black_username: string | null;
  white_rating: number | null;
  black_rating: number | null;
  fen: string;
  turn: string;
  status: string;
  result: string;
  initial_seconds: number;
  increment_seconds: number;
  white_time_ms: number;
  black_time_ms: number;
  last_move_at: string | null;
  winner_id: string | null;
  draw_offered_by: string | null;
  end_reason: string | null;
  moves_count: number;
  created_at: string;
};

type MoveRow = { ply: number; san: string; uci: string; fen_after: string };

// Opponent left the arena mid-game: give them a short grace (page hops,
// socket blips), then surface the reconnect countdown. The forfeit itself
// is server-side — their clock flags out via the sweep / timeout claim —
// this banner just makes that timer visible.
function ReconnectBanner({
  name,
  clockMs,
  ticking,
  lastMoveAt,
}: {
  name: string;
  clockMs: number;
  ticking: boolean;
  lastMoveAt: number | null;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!ticking || !lastMoveAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking, lastMoveAt]);
  const remaining =
    ticking && lastMoveAt ? Math.max(0, clockMs - Math.max(0, now - lastMoveAt)) : clockMs;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-400 animate-in fade-in slide-in-from-top-1">
      <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
      <span className="min-w-0 flex-1">
        <span className="text-foreground">{name}</span> disconnected — they can reconnect, but{" "}
        {ticking ? (
          <>
            auto-forfeit in <span className="font-mono text-amber-300">{fmtClock(remaining)}</span>
          </>
        ) : (
          <>
            their clock (<span className="font-mono text-amber-300">{fmtClock(remaining)}</span>)
            starts on their turn
          </>
        )}
        .
      </span>
    </div>
  );
}

// Compact SAN move list (spec: board surface shows the move list). Auto
// scrolls to the latest move.
function MoveList({ moves }: { moves: MoveRow[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [moves.length]);
  if (moves.length === 0) return null;

  const pairs: { n: number; white?: MoveRow; black?: MoveRow }[] = [];
  for (const mv of moves) {
    const n = Math.ceil(mv.ply / 2);
    let pair = pairs[pairs.length - 1];
    if (!pair || pair.n !== n) {
      pair = { n };
      pairs.push(pair);
    }
    if (mv.ply % 2 === 1) pair.white = mv;
    else pair.black = mv;
  }

  return (
    <div className="max-h-24 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] leading-snug">
        {pairs.map((p) => (
          <span key={p.n} className="whitespace-nowrap">
            <span className="text-muted-foreground/60">{p.n}.</span>{" "}
            <span className="text-foreground">{p.white?.san ?? "…"}</span>
            {p.black && <span className="ml-1.5 text-muted-foreground">{p.black.san}</span>}
          </span>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function PlayerPanel({
  entry,
  fallbackName,
  clockMs,
  lastMoveAt,
  active,
  me,
  connected,
  matchPoints,
  board,
  color,
  extra,
}: {
  entry: TournamentEntry | null;
  fallbackName: string;
  clockMs: number;
  lastMoveAt: number | null;
  active: boolean;
  me?: boolean;
  connected?: boolean;
  matchPoints: number;
  board: BoardCell[][];
  color: "w" | "b";
  extra?: ReactNode;
}) {
  // Local 100ms tick keeps the running clock smooth without re-rendering
  // the board tree (same trick as the game page's PlayerCard).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active || !lastMoveAt) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [active, lastMoveAt]);
  const elapsed = active && lastMoveAt ? Math.max(0, now - lastMoveAt) : 0;
  const ms = Math.max(0, clockMs - elapsed);
  useClockAudio(Math.ceil(ms / 1000), active && !!me);

  const name = entry?.username ?? fallbackName;
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
        active ? "border-emerald/40 bg-emerald/5" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <PlayerAvatar username={name} avatarUrl={entry?.avatar_url} size="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-sm font-medium">
          {name}
          {me && <span className="text-[10px] text-emerald">(you)</span>}
          {connected != null && (
            <span
              title={connected ? "Connected" : "Connection lost"}
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-emerald" : "bg-rose-400 animate-pulse"}`}
            />
          )}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {entry?.country ?? "—"} · IQ {entry?.iq_rating ?? 100} ·{" "}
          <span className="text-gold">{Number(entry?.score ?? 0)} pts</span>
          {matchPoints > 0 && <span className="text-emerald"> · +{matchPoints} this game</span>}
        </div>
        <CapturedPieces board={board} player={color} className="mt-0.5" />
        {extra}
      </div>
      <div
        className={`rounded-lg px-3 py-1.5 font-mono text-base tabular-nums ${
          active ? "bg-gold text-[#0B0D10]" : "bg-white/5"
        } ${ms < 20000 && active ? "!bg-rose-500 !text-white animate-pulse" : ""}`}
      >
        <Timer className="mr-1 inline h-3.5 w-3.5 opacity-70" />
        <ClockTime ms={ms} active={active} />
      </div>
    </div>
  );
}

export const ArenaBoard = memo(function ArenaBoard({
  gameId,
  matchId,
  userId,
  meEntry,
  oppEntry,
  captures,
  offsetMs,
  connected,
  oppOnline,
  friendSlot,
  onChanged,
}: {
  gameId: string;
  matchId: string;
  userId: string;
  meEntry: TournamentEntry | null;
  oppEntry: TournamentEntry | null;
  /** Tournament capture rows (any game) — filtered per game here. */
  captures: CaptureRow[];
  offsetMs: number;
  connected: boolean;
  /** Opponent's live presence (null/undefined = unknown → assume online). */
  oppOnline?: boolean | null;
  friendSlot?: ReactNode;
  onChanged: () => void;
}) {
  const { settings } = useGameSettings();
  const [game, setGame] = useState<GameRow | null>(null);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [optimistic, setOptimistic] = useState<{
    fen: string;
    from: string;
    to: string;
    at: number;
  } | null>(null);
  const [confirm, setConfirm] = useState<"resign" | "abort" | "draw" | null>(null);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const timeoutClaimedRef = useRef(false);
  const finishedRef = useRef(false);
  // Mirrors `game`/`optimistic` for reading fresh values from async
  // callbacks (setTimeout) without a stale-closure snapshot.
  const gameRef = useRef<GameRow | null>(null);
  const optimisticRef = useRef<{ fen: string; from: string; to: string } | null>(null);
  // Pending fallback re-fetch, in case the post-move realtime UPDATE never
  // arrives (dropped event / reconnect gap right after submitting).
  const reconcileFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  useEffect(() => {
    optimisticRef.current = optimistic;
  }, [optimistic]);
  useEffect(
    () => () => {
      if (reconcileFallbackRef.current) clearTimeout(reconcileFallbackRef.current);
    },
    [],
  );

  // 12s grace before declaring the opponent disconnected — page hops and
  // socket blips drop presence for a moment without the player leaving.
  const [oppAway, setOppAway] = useState(false);
  useEffect(() => {
    if (oppOnline !== false) {
      setOppAway(false);
      return;
    }
    const t = setTimeout(() => setOppAway(true), 12000);
    return () => clearTimeout(t);
  }, [oppOnline]);

  // ---- Load + realtime for this specific game -------------------------
  useEffect(() => {
    let alive = true;
    setGame(null);
    setMoves([]);
    setOptimistic(null);
    setSelected(null);
    setTargets([]);
    timeoutClaimedRef.current = false;
    finishedRef.current = false;

    (async () => {
      const [{ data: g }, { data: m }] = await Promise.all([
        supabase.from("games").select("*").eq("id", gameId).maybeSingle(),
        supabase
          .from("game_moves")
          .select("ply,san,uci,fen_after")
          .eq("game_id", gameId)
          .order("ply"),
      ]);
      if (!alive) return;
      setGame(g as GameRow | null);
      setMoves((m ?? []) as MoveRow[]);
    })();

    const ch = supabase
      .channel(`arena_game:${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        (p) => setGame(p.new as GameRow),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_moves", filter: `game_id=eq.${gameId}` },
        (p) =>
          setMoves((prev) => {
            const row = p.new as MoveRow;
            if (prev.some((r) => r.ply === row.ply)) return prev;
            return [...prev, row].sort((a, b) => a.ply - b.ply);
          }),
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Recover from any gap while disconnected — re-fetching game_moves
          // alone recovers missed moves but not a missed change to the games
          // row itself (opponent resigned/timed out/a draw was accepted
          // while this client was briefly offline); re-fetch both.
          const [{ data: g }, { data: m }] = await Promise.all([
            supabase.from("games").select("*").eq("id", gameId).maybeSingle(),
            supabase
              .from("game_moves")
              .select("ply,san,uci,fen_after")
              .eq("game_id", gameId)
              .order("ply"),
          ]);
          if (!alive) return;
          if (g) setGame(g as GameRow);
          if (m) setMoves(m as MoveRow[]);
        }
      });
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [gameId]);

  // Reconcile optimistic once the authoritative FEN lands.
  useEffect(() => {
    setOptimistic(null);
  }, [game?.fen]);

  const activeFen = optimistic?.fen ?? game?.fen;
  const chess = useMemo(() => {
    const c = new Chess();
    if (activeFen) {
      try {
        c.load(activeFen);
      } catch {
        /* noop */
      }
    }
    return c;
  }, [activeFen]);

  const myColor: "w" | "b" | null =
    game?.white_id === userId ? "w" : game?.black_id === userId ? "b" : null;
  const orientation: "w" | "b" = myColor ?? "w";
  const isMyTurn = !!myColor && myColor === game?.turn && game?.status === "active" && !optimistic;

  // Opponent move audio (my own move sounds on the optimistic apply).
  const prevMovesRef = useRef(0);
  useEffect(() => {
    if (moves.length <= prevMovesRef.current) {
      prevMovesRef.current = moves.length;
      return;
    }
    prevMovesRef.current = moves.length;
    const last = moves[moves.length - 1];
    if (!last?.san) return;
    const moverColor: "w" | "b" = last.ply % 2 === 1 ? "w" : "b";
    if (myColor && myColor === moverColor) return;
    if (last.san.includes("#")) playGameSound("checkmate");
    else if (last.san.includes("+")) playGameSound("check");
    else if (last.san.startsWith("O-O")) playGameSound("castle");
    else if (last.san.includes("=")) playGameSound("promote");
    else if (last.san.includes("x")) playGameSound("capture");
    else playGameSound("move");
  }, [moves, myColor]);

  // Terminal cue + hand control back to the lobby. Aborted games are a
  // reset, not a result — no win/lose sound for those.
  useEffect(() => {
    if (!game || game.status !== "finished" || finishedRef.current) return;
    finishedRef.current = true;
    if (game.result === "draw") playGameSound("draw");
    else if (game.result === "aborted") {
      /* replacement board arrives via realtime */
    } else if (game.winner_id === userId) playGameSound("victory");
    else playGameSound("defeat");
    onChanged();
  }, [game?.status, game?.result, game?.winner_id, userId, onChanged, game]);

  // ---- Clocks ----------------------------------------------------------
  const activeTurn = optimistic ? (game?.turn === "w" ? "b" : "w") : game?.turn;
  const realLastMoveAt = game?.last_move_at ? new Date(game.last_move_at).getTime() : null;
  const currentMoveAt = optimistic ? optimistic.at : realLastMoveAt;
  const whiteMs = game?.white_time_ms ?? 0;
  const blackMs = game?.black_time_ms ?? 0;
  const myMs = myColor === "b" ? blackMs : whiteMs;
  const oppMs = myColor === "b" ? whiteMs : blackMs;
  const oppColor: "w" | "b" = orientation === "w" ? "b" : "w";

  // Opponent flag-fall → claim the win once (server re-validates).
  if (game?.status === "active" && myColor && !timeoutClaimedRef.current) {
    const isOppTurn = game.turn !== myColor;
    const oppLeft =
      (myColor === "w" ? blackMs : whiteMs) -
      (isOppTurn && realLastMoveAt ? Math.max(0, Date.now() - realLastMoveAt) : 0);
    if (isOppTurn && oppLeft <= 0) {
      timeoutClaimedRef.current = true;
      claimTimeout(gameId).catch(() => {
        timeoutClaimedRef.current = false;
      });
    }
  }

  // ---- Board derivation ------------------------------------------------
  const board: BoardCell[][] = useMemo(
    () =>
      chess
        .board()
        .map((row) =>
          row.map((p) => (p ? { square: p.square, type: p.type, color: p.color } : null)),
        ),
    [chess],
  );
  const lastMove = useMemo(
    () =>
      optimistic
        ? { from: optimistic.from, to: optimistic.to }
        : moves.length
          ? {
              from: moves[moves.length - 1].uci.slice(0, 2),
              to: moves[moves.length - 1].uci.slice(2, 4),
            }
          : null,
    [optimistic, moves],
  );
  const checkSquare = useMemo(
    () =>
      chess.inCheck()
        ? (chess
            .board()
            .flat()
            .find((p) => p && p.type === "k" && p.color === chess.turn())?.square ?? null)
        : null,
    [chess],
  );
  const endState = useMemo(() => {
    if (game?.status !== "finished" || game.result === "aborted") return null;
    const result =
      game.result === "white" || game.result === "black"
        ? (game.result as "white" | "black")
        : ("draw" as const);
    return { result, reason: game.end_reason?.replace(/_/g, " ") ?? "Finished" };
  }, [game?.status, game?.result, game?.end_reason]);

  // Capture bonus earned in THIS game, per player (Box 5's live match points).
  const gameCaptures = useMemo(
    () => captures.filter((c) => c.game_id === gameId),
    [captures, gameId],
  );
  const myMatchPoints = useMemo(
    () => gameCaptures.filter((c) => c.user_id === userId).reduce((s, c) => s + c.bonus, 0),
    [gameCaptures, userId],
  );
  const oppMatchPoints = useMemo(
    () => gameCaptures.filter((c) => c.user_id !== userId).reduce((s, c) => s + c.bonus, 0),
    [gameCaptures, userId],
  );

  // ---- Move handling ----------------------------------------------------
  const commitMove = useCallback(
    async (from: string, to: string, promo?: "q" | "r" | "b" | "n") => {
      if (!game || !myColor || submittingRef.current) return;
      submittingRef.current = true;
      setSelected(null);
      setTargets([]);
      let expectedFen: string | null = null;
      try {
        const c = new Chess();
        c.load(activeFen!);
        const mv = c.move({ from, to, promotion: promo });
        if (mv) {
          expectedFen = c.fen();
          setOptimistic({ fen: expectedFen, from, to, at: Date.now() });
          buzz();
          soundForChessMove(mv, c);
        }
      } catch {
        /* let the server judge */
      }
      try {
        const result = await submitMove({ gameId, from, to, promotion: promo });
        if (!result.ok) {
          setOptimistic(null);
          toast.error("You ran out of time.");
        } else if (expectedFen) {
          // The server accepted the move — Realtime should update `game`
          // shortly. If that specific UPDATE event is dropped, `optimistic`
          // never clears and this player can't move again (isMyTurn
          // requires !optimistic). Fall back to a direct re-fetch if
          // reconciliation hasn't happened after a few seconds.
          if (reconcileFallbackRef.current) clearTimeout(reconcileFallbackRef.current);
          const fenToMatch = expectedFen;
          reconcileFallbackRef.current = setTimeout(async () => {
            reconcileFallbackRef.current = null;
            if (optimisticRef.current?.from !== from || optimisticRef.current?.to !== to) return;
            if (gameRef.current?.fen === fenToMatch) return;
            const { data: g } = await supabase
              .from("games")
              .select("*")
              .eq("id", gameId)
              .maybeSingle();
            if (g) setGame(g as GameRow);
          }, 3500);
        }
      } catch (err) {
        setOptimistic(null);
        toast.error(err instanceof Error ? err.message : "Move failed — try again.");
      } finally {
        submittingRef.current = false;
      }
    },
    [game, myColor, activeFen, gameId],
  );

  const handleSquare = useCallback(
    async (sq: string) => {
      if (!isMyTurn || promotion || submittingRef.current) return;
      const square = sq as Square;
      if (selected) {
        const m = chess
          .moves({ square: selected as Square, verbose: true })
          .find((mv) => mv.to === square);
        if (m) {
          if (m.piece === "p" && (m.to[1] === "8" || m.to[1] === "1")) {
            if (settings.auto_queen) await commitMove(selected, square, "q");
            else setPromotion({ from: selected, to: square });
          } else {
            await commitMove(selected, square, undefined);
          }
          return;
        }
      }
      const piece = chess.get(square);
      if (piece && piece.color === game?.turn && piece.color === myColor) {
        setSelected(sq);
        setTargets(chess.moves({ square, verbose: true }).map((mv) => mv.to));
      } else {
        setSelected(null);
        setTargets([]);
      }
    },
    [isMyTurn, promotion, selected, chess, settings.auto_queen, game?.turn, myColor, commitMove],
  );

  // ---- Actions -----------------------------------------------------------
  async function doResign() {
    setBusy(true);
    try {
      await resignGame(gameId);
      setConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resign failed.");
    }
    setBusy(false);
  }

  async function doAbort() {
    setBusy(true);
    try {
      const replacement = await abortGame(gameId);
      setConfirm(null);
      toast.info(replacement ? "Game aborted — a fresh board is ready." : "Game aborted.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Abort failed.");
    }
    setBusy(false);
  }

  async function doDraw() {
    setBusy(true);
    try {
      const res = await respondDraw(gameId);
      setConfirm(null);
      if (res === "offered") toast.info("Draw offer sent to opponent.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Draw action failed.");
    }
    setBusy(false);
  }

  async function doDeclineDraw() {
    try {
      await declineDraw(gameId);
      toast.info("Draw offer declined.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not decline.");
    }
  }

  async function doClaimNoShow() {
    setBusy(true);
    try {
      await claimNoShow(matchId);
      toast.success("No-show win claimed — you advance!");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not claim yet");
    }
    setBusy(false);
  }

  if (!game) {
    return (
      <div className="grid aspect-square w-full max-w-[560px] place-items-center rounded-2xl border border-white/10 bg-white/[0.02]">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  const oppName = (myColor === "b" ? game.white_username : game.black_username) ?? "Opponent";
  const myName = (myColor === "b" ? game.black_username : game.white_username) ?? "You";
  const drawFromMe = game.draw_offered_by === userId;
  const drawFromOpp = !!game.draw_offered_by && game.draw_offered_by !== userId;
  const canAbort = game.status === "active" && (game.moves_count ?? 0) <= 1;
  const gameAgeMs = Date.now() + offsetMs - new Date(game.created_at).getTime();
  const canClaimNoShow =
    game.status === "active" &&
    gameAgeMs > 95_000 &&
    (myColor === "w" ? (game.moves_count ?? 0) === 1 : (game.moves_count ?? 0) === 0);

  return (
    <div className="flex w-full max-w-[560px] flex-col gap-3">
      {/* Box 11 — opponent */}
      <PlayerPanel
        entry={oppEntry}
        fallbackName={oppName}
        clockMs={oppMs}
        lastMoveAt={activeTurn === oppColor ? currentMoveAt : null}
        active={game.status === "active" && activeTurn === oppColor}
        matchPoints={oppMatchPoints}
        board={board}
        color={oppColor}
        extra={friendSlot}
      />

      {/* Reconnect countdown when the opponent drops mid-game */}
      {oppAway && game.status === "active" && (
        <ReconnectBanner
          name={oppName}
          clockMs={oppMs}
          ticking={activeTurn === oppColor}
          lastMoveAt={activeTurn === oppColor ? currentMoveAt : null}
        />
      )}

      {/* Box 7 — the board, always in the player's saved theme */}
      <InteractiveBoard
        board={board}
        orientation={orientation}
        selected={selected}
        targets={targets}
        lastMove={lastMove}
        checkSquare={checkSquare}
        onSquare={handleSquare}
        disabled={!isMyTurn || !!promotion || submittingRef.current}
        endState={endState}
      />

      {promotion && (
        <div className="flex justify-center">
          <PromotionPicker
            color={myColor!}
            onCancel={() => setPromotion(null)}
            onPick={(p) => {
              const { from, to } = promotion;
              setPromotion(null);
              void commitMove(from, to, p);
            }}
          />
        </div>
      )}

      {/* Box 10 — incoming draw request */}
      {drawFromOpp && game.status === "active" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 text-sm text-gold">
            <Handshake className="h-4 w-4" /> {oppName} offers a draw (+2 each)
          </div>
          <div className="flex gap-2">
            <GoldButton onClick={() => void doDraw()} className="px-3 py-1.5 text-xs">
              Accept
            </GoldButton>
            <GhostButton onClick={() => void doDeclineDraw()} className="px-3 py-1.5 text-xs">
              Decline
            </GhostButton>
          </div>
        </div>
      )}

      {/* Boxes 8/9/10 — controls */}
      {game.status === "active" && myColor && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <GhostButton
            onClick={() => (drawFromOpp ? void doDraw() : setConfirm("draw"))}
            disabled={drawFromMe}
            className="px-4 py-2 text-xs"
          >
            <Handshake className="h-3.5 w-3.5" />
            {drawFromMe ? "Draw Offered" : drawFromOpp ? "Accept Draw" : "Offer Draw"}
          </GhostButton>
          {canAbort && (
            <GhostButton onClick={() => setConfirm("abort")} className="px-4 py-2 text-xs">
              <OctagonX className="h-3.5 w-3.5" /> Abort
            </GhostButton>
          )}
          <button
            onClick={() => setConfirm("resign")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-400 transition hover:bg-rose-500/20"
          >
            <Flag className="h-3.5 w-3.5" /> Resign
          </button>
          {canClaimNoShow && (
            <button
              onClick={() => void doClaimNoShow()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              <Flag className="h-3.5 w-3.5" /> Claim no-show win
            </button>
          )}
        </div>
      )}

      {/* Move list */}
      <MoveList moves={moves} />

      {/* Box 6 — me */}
      <PlayerPanel
        entry={meEntry}
        fallbackName={myName}
        clockMs={myMs}
        lastMoveAt={activeTurn === orientation ? currentMoveAt : null}
        active={game.status === "active" && activeTurn === orientation}
        me
        connected={connected}
        matchPoints={myMatchPoints}
        board={board}
        color={orientation}
      />

      {/* Confirmation dialogs (chess.com-style yes/no) */}
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              {confirm === "resign"
                ? "Resign this game?"
                : confirm === "abort"
                  ? "Abort this game?"
                  : "Offer a draw?"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "resign" &&
                "Resigning ends the game immediately — your opponent advances and you take the −5."}
              {confirm === "abort" &&
                "Aborting resets this match with a fresh board. You can only do this once per match, and only before the second move."}
              {confirm === "draw" &&
                "If your opponent accepts, the game ends and you both score +2. In knockout rounds the player with more clock time advances."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <GhostButton onClick={() => setConfirm(null)} disabled={busy}>
              No
            </GhostButton>
            <GoldButton
              onClick={() =>
                confirm === "resign"
                  ? void doResign()
                  : confirm === "abort"
                    ? void doAbort()
                    : void doDraw()
              }
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes"}
            </GoldButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
