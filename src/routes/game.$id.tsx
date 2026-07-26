import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Chess, type Square } from "chess.js";
import { toast } from "sonner";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import { CapturedPieces } from "@/components/site/CapturedPieces";
import { PromotionPicker } from "@/components/site/PromotionPicker";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { UserAvatar } from "@/components/site/UserAvatar";
import { GameEndModal, type GameEndResult } from "@/components/site/GameEndModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGameSettings } from "@/hooks/useGameSettings";
import { playGameSound, soundForChessMove } from "@/lib/audio/sounds";
import { buzz } from "@/lib/haptics";
import { submitMove, joinGame, resignGame, respondDraw, claimTimeout } from "@/lib/api/gameClient";
import {
  Flag,
  Handshake,
  Copy,
  Send,
  Crown,
  MessageCircle,
  Swords,
  Play,
  LineChart,
  RotateCcw,
} from "lucide-react";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/game/$id")({
  head: () => noindexSeo("Live Chess Game — ChessOx", "A live online chess game on ChessOx."),
  component: LiveGame,
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
  fen: string;
  turn: string;
  status: string;
  result: string;
  time_control: string;
  initial_seconds: number;
  increment_seconds: number;
  white_time_ms: number;
  black_time_ms: number;
  last_move_at: string | null;
  host_id: string | null;
  winner_id: string | null;
  draw_offered_by: string | null;
  end_reason: string | null;
  is_rated: boolean;
  time_class: "bullet" | "blitz" | "rapid" | "classical";
};

type MoveRow = { ply: number; san: string; uci: string; fen_after: string };
type ChatRow = { id: number; username: string; user_id: string; body: string; created_at: string };

function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function LiveGame() {
  const { id } = useParams({ from: "/game/$id" });
  const { user } = useAuth();
  const { settings } = useGameSettings();
  const [game, setGame] = useState<GameRow | null>(null);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [chat, setChat] = useState<ChatRow[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [joining, setJoining] = useState(false);
  const [whiteProfile, setWhiteProfile] = useState<{
    premium_active?: boolean;
    premium_expires_at?: string | null;
    avatar_url?: string | null;
  } | null>(null);
  const [blackProfile, setBlackProfile] = useState<{
    premium_active?: boolean;
    premium_expires_at?: string | null;
    avatar_url?: string | null;
  } | null>(null);
  // Optimistic local move — board updates instantly while the server write/realtime
  // round-trip completes, then is reconciled by the authoritative FEN.
  const [optimistic, setOptimistic] = useState<{
    fen: string;
    from: string;
    to: string;
    at: number;
    isCheckmate: boolean;
  } | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);
  const [hasShownEndModal, setHasShownEndModal] = useState(false);

  // Prevent double-submission of moves
  const submittingRef = useRef(false);
  // Prevent claiming timeout more than once per active game
  const timeoutClaimedRef = useRef(false);

  // Terminal audio cue when the game finishes (fires once per game).
  const finishedRef = useRef(false);
  useEffect(() => {
    if (!game || game.status !== "finished" || finishedRef.current) return;
    finishedRef.current = true;
    if (game.result === "draw") playGameSound("draw");
    else if (user && game.winner_id === user.id) playGameSound("victory");
    else if (user && game.winner_id) playGameSound("defeat");
  }, [game?.status, game?.result, game?.winner_id, user?.id]);

  useEffect(() => {
    if (game?.status === "finished" && !hasShownEndModal) {
      setShowEndModal(true);
      setHasShownEndModal(true);
    }
  }, [game?.status, hasShownEndModal]);

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

  // Reconcile: once the authoritative position arrives, drop the optimistic copy.
  useEffect(() => {
    setOptimistic(null);
  }, [game?.fen]);

  // Initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: g }, { data: m }, { data: c }] = await Promise.all([
        supabase.from("games").select("*").eq("id", id).maybeSingle(),
        supabase.from("game_moves").select("ply,san,uci,fen_after").eq("game_id", id).order("ply"),
        supabase
          .from("game_chat")
          .select("id,user_id,username,body,created_at")
          .eq("game_id", id)
          .order("created_at"),
      ]);
      if (!alive) return;
      setGame(g as GameRow | null);
      setMoves((m ?? []) as MoveRow[]);
      setChat((c ?? []) as ChatRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!game) return;
    const fetchProfiles = async () => {
      const ids = [];
      if (game.white_id) ids.push(game.white_id);
      if (game.black_id) ids.push(game.black_id);
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, premium_active, premium_expires_at, avatar_url")
        .in("id", ids);
      if (data) {
        setWhiteProfile(data.find((d: any) => d.id === game.white_id) || null);
        setBlackProfile(data.find((d: any) => d.id === game.black_id) || null);
      }
    };
    fetchProfiles();
  }, [game?.white_id, game?.black_id]);

  // Realtime — re-fetch move list on re-subscribe to recover any gaps during disconnect
  useEffect(() => {
    const ch = supabase
      .channel(`game:${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${id}` },
        (p) => setGame(p.new as GameRow),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_moves", filter: `game_id=eq.${id}` },
        (p) =>
          setMoves((prev) => {
            const row = p.new as MoveRow;
            if (prev.some((r) => r.ply === row.ply)) return prev;
            return [...prev, row].sort((a, b) => a.ply - b.ply);
          }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_chat", filter: `game_id=eq.${id}` },
        (p) => setChat((prev) => [...prev, p.new as ChatRow]),
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data: m } = await supabase
            .from("game_moves")
            .select("ply,san,uci,fen_after")
            .eq("game_id", id)
            .order("ply");
          if (m) setMoves(m as MoveRow[]);
        }
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id]);

  // Move audio for moves that arrive over realtime — the mover's own move
  // already got its cue from the optimistic local apply above, so this only
  // sounds for the opponent's moves (and every move, for spectators).
  const prevMoveCountRef = useRef(0);
  useEffect(() => {
    if (moves.length <= prevMoveCountRef.current) {
      prevMoveCountRef.current = moves.length;
      return;
    }
    prevMoveCountRef.current = moves.length;
    const last = moves[moves.length - 1];
    if (!last?.san) return;
    const moverColor: "w" | "b" = last.ply % 2 === 1 ? "w" : "b";
    const myColorNow: "w" | "b" | null =
      user && game?.white_id === user.id ? "w" : user && game?.black_id === user.id ? "b" : null;
    if (myColorNow && myColorNow === moverColor) return; // already heard the optimistic cue
    const san = last.san;
    if (san.includes("#")) playGameSound("checkmate");
    else if (san.includes("+")) playGameSound("check");
    else if (san.startsWith("O-O")) playGameSound("castle");
    else if (san.includes("=")) playGameSound("promote");
    else if (san.includes("x")) playGameSound("capture");
    else playGameSound("move");
  }, [moves, user, game?.white_id, game?.black_id]);

  // Clock ticking has been moved to PlayerCard to avoid 250ms re-renders on the main game board

  // Reset timeout claim flag when game status or id changes
  useEffect(() => {
    timeoutClaimedRef.current = false;
  }, [game?.status, id]);

  const myColor: "w" | "b" | null =
    user && game?.white_id === user.id ? "w" : user && game?.black_id === user.id ? "b" : null;
  const baseOrientation = myColor ?? "w";
  const orientation: "w" | "b" = flipped ? (baseOrientation === "w" ? "b" : "w") : baseOrientation;
  const isMyTurn = !!myColor && myColor === game?.turn && game?.status === "active" && !optimistic;

  // Live clock values passed to PlayerCards
  const activeTurn = optimistic ? (game?.turn === "w" ? "b" : "w") : game?.turn;
  const realLastMoveAt = game?.last_move_at ? new Date(game.last_move_at).getTime() : null;
  const currentMoveAt = optimistic ? optimistic.at : realLastMoveAt;

  // The base ms remaining for each player
  const whiteMs =
    (game?.white_time_ms ?? 0) -
    (game?.turn === "w" && optimistic && realLastMoveAt ? optimistic.at - realLastMoveAt : 0);
  const blackMs =
    (game?.black_time_ms ?? 0) -
    (game?.turn === "b" && optimistic && realLastMoveAt ? optimistic.at - realLastMoveAt : 0);

  // Opponent timeout watcher — when it's NOT my turn and the opponent's displayed clock hits 0
  if (game?.status === "active" && myColor && user && !timeoutClaimedRef.current) {
    const isOppTurn = game.turn !== myColor;
    const oppMs = myColor === "w" ? blackMs : whiteMs;
    if (isOppTurn && oppMs <= 0) {
      timeoutClaimedRef.current = true;
      claimTimeout(id).catch(() => {
        timeoutClaimedRef.current = false;
      });
    }
  }

  // Board cells
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
          ? (() => {
              const u = moves[moves.length - 1].uci;
              return { from: u.slice(0, 2), to: u.slice(2, 4) };
            })()
          : null,
    [optimistic, moves],
  );
  const inCheck = chess.inCheck();
  const checkSquare = useMemo(
    () =>
      inCheck
        ? (chess
            .board()
            .flat()
            .find((p) => p && p.type === "k" && p.color === chess.turn())?.square ?? null)
        : null,
    [inCheck, chess],
  );

  const endState = useMemo(() => {
    if (optimistic?.isCheckmate) {
      return { result: game?.turn === "w" ? "white" : "black", reason: "Checkmate" };
    }
    if (game?.status !== "finished") return null;
    let result: "white" | "black" | "draw" = "draw";
    if (game.result === "white" || game.result === "black") {
      result = game.result as "white" | "black";
    }
    return { result, reason: game.end_reason?.replace(/_/g, " ") ?? "Finished" };
  }, [game?.status, game?.result, game?.end_reason, game?.turn, optimistic?.isCheckmate]);

  const handleSquare = useCallback(
    (sq: string) => {
      if (!isMyTurn || promotion || submittingRef.current) return;
      const square = sq as Square;
      if (selected) {
        const moveList = chess.moves({ square: selected as Square, verbose: true });
        const m = moveList.find((mv) => mv.to === square);
        if (m) {
          // Pawn reaches the back rank → promotion required (unless auto-queen).
          if (m.piece === "p" && (m.to[1] === "8" || m.to[1] === "1")) {
            if (settings.auto_queen) {
              commitMove(selected, square, "q");
            } else {
              setPromotion({ from: selected, to: square });
            }
            return;
          }
          commitMove(selected, square, undefined);
          return;
        }
      }
      const piece = chess.get(square);
      if (piece && piece.color === game!.turn && piece.color === myColor) {
        setSelected(sq);
        setTargets(chess.moves({ square, verbose: true }).map((mv) => mv.to));
      } else {
        setSelected(null);
        setTargets([]);
      }
    },
    [isMyTurn, promotion, selected, chess, settings.auto_queen, game, myColor],
  );

  function commitMove(from: string, to: string, promo?: "q" | "r" | "b" | "n") {
    if (!game || !user || !myColor || submittingRef.current) return;
    submittingRef.current = true;
    setSelected(null);
    setTargets([]);
    // Clone the already-loaded `chess` instance (not a fresh FEN reparse) and
    // apply the move synchronously — the caller already validated it's legal
    // via chess.moves(), so this cannot fail. The board updates in this same
    // tick, before the network call below even starts.
    const c = new Chess(chess.fen());
    const mv = c.move({ from, to, promotion: promo });
    setOptimistic({ fen: c.fen(), from, to, at: Date.now(), isCheckmate: c.isCheckmate() });
    buzz();
    soundForChessMove(mv, c);
    if (c.isCheckmate()) {
      setShowEndModal(true);
    }
    // Fire the network request in the background — never block the UI thread
    // or the optimistic render on it.
    void submitMoveInBackground(from, to, promo);
  }

  async function submitMoveInBackground(from: string, to: string, promo?: "q" | "r" | "b" | "n") {
    try {
      const result = await submitMove({ gameId: id, from, to, promotion: promo });
      if (!result.ok) {
        // Server flagged this move as a timeout loss for the mover
        setOptimistic(null);
        toast.error("You ran out of time.");
      }
      // Realtime will update game state from the server's DB write
    } catch (err) {
      setOptimistic(null);
      toast.error(err instanceof Error ? err.message : "Move failed — try again.");
    } finally {
      submittingRef.current = false;
    }
  }

  async function joinAsOpponent() {
    if (!user || !game || game.status !== "waiting") return;
    if (game.white_id === user.id || game.black_id === user.id) return;
    setJoining(true);
    try {
      await joinGame(id);
      // join_game RPC sets status to "active", sets rating, and fires Realtime
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join the game.");
    } finally {
      setJoining(false);
    }
  }

  async function resign() {
    if (!game || !myColor || game.status !== "active") return;
    if (settings.confirm_resign && !confirm("Resign this game?")) return;
    try {
      await resignGame(id);
      // resign_game RPC finishes the game and calls apply_elo_change server-side
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resign failed.");
    }
  }

  async function offerOrAcceptDraw() {
    if (!game || !myColor || game.status !== "active") return;
    // Confirm only when making a fresh offer (not when accepting the opponent's).
    if (settings.confirm_draw_offer && !game.draw_offered_by && !confirm("Offer a draw?")) return;
    try {
      const res = await respondDraw(id);
      if (res === "offered") toast.info("Draw offer sent to opponent.");
      // The RPC's TS union omits "declined", but the server can still return it.
      if ((res as string) === "declined") toast.error("Draw request declined.");
      // "accepted" → respond_draw finishes game + apply_elo_change; Realtime updates UI
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Draw action failed.");
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || !user) return;
    const body = chatInput.trim().slice(0, 500);
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    setChatInput("");
    // game_chat remains client-writable (RLS enforces user_id match; not integrity-critical)
    await supabase.from("game_chat").insert({
      game_id: id,
      user_id: user.id,
      username: profile?.username ?? "User",
      body,
    });
  }

  if (!game)
    return (
      <PageShell title="Loading throne…">
        <div />
      </PageShell>
    );

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/game/${id}` : "";
  const opp =
    myColor === "w"
      ? {
          name: game.black_username ?? "Awaiting…",
          rating: game.black_rating,
          ms: blackMs,
          lastMoveAt: activeTurn === "b" ? currentMoveAt : null,
          p_active: blackProfile?.premium_active,
          p_exp: blackProfile?.premium_expires_at,
          avatar: blackProfile?.avatar_url,
        }
      : {
          name: game.white_username ?? "Awaiting…",
          rating: game.white_rating,
          ms: whiteMs,
          lastMoveAt: activeTurn === "w" ? currentMoveAt : null,
          p_active: whiteProfile?.premium_active,
          p_exp: whiteProfile?.premium_expires_at,
          avatar: whiteProfile?.avatar_url,
        };
  const me = myColor
    ? myColor === "w"
      ? {
          name: game.white_username ?? "You",
          rating: game.white_rating,
          ms: whiteMs,
          lastMoveAt: activeTurn === "w" ? currentMoveAt : null,
          p_active: whiteProfile?.premium_active,
          p_exp: whiteProfile?.premium_expires_at,
          avatar: whiteProfile?.avatar_url,
        }
      : {
          name: game.black_username ?? "You",
          rating: game.black_rating,
          ms: blackMs,
          lastMoveAt: activeTurn === "b" ? currentMoveAt : null,
          p_active: blackProfile?.premium_active,
          p_exp: blackProfile?.premium_expires_at,
          avatar: blackProfile?.avatar_url,
        }
    : {
        name: "Spectator",
        rating: null,
        ms: 0,
        lastMoveAt: null,
        p_active: false,
        p_exp: null,
        avatar: null,
      };

  const isWaiting = game.status === "waiting";
  const isFinished = game.status === "finished";
  const canJoin =
    isWaiting && !!user && (!game.white_id || !game.black_id) && game.host_id !== user.id;
  const isHostWaiting = isWaiting && user?.id === game.host_id;
  const drawFromMe = game.draw_offered_by === user?.id;
  const drawFromOpponent = game.draw_offered_by && game.draw_offered_by !== user?.id;

  return (
    <PageShell>
      {showEndModal && game.status === "finished" && (
        <GameEndModal
          result={game.end_reason?.includes("resign") ? "resigned" : (game.result as GameEndResult)}
          reason={game.end_reason?.replace(/_/g, " ") ?? "Finished"}
          onClose={() => setShowEndModal(false)}
          gameId={id}
        />
      )}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-3">
          <PlayerCard
            name={opp.name}
            rating={opp.rating}
            baseMs={opp.ms}
            lastMoveAt={opp.lastMoveAt}
            p_active={opp.p_active}
            p_exp={opp.p_exp}
            avatar={opp.avatar}
            active={!isWaiting && activeTurn !== myColor}
            board={board}
            player={orientation === "w" ? "b" : "w"}
          />
          <PlayerCard
            name={me.name}
            rating={me.rating}
            baseMs={me.ms}
            lastMoveAt={me.lastMoveAt}
            p_active={me.p_active}
            p_exp={me.p_exp}
            avatar={me.avatar}
            active={!isWaiting && activeTurn === myColor}
            board={board}
            player={orientation}
            me
          />

          {isHostWaiting && (
            <Card className="p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-gold/80">
                Awaiting opponent
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Share this scroll to summon a challenger.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-lg border border-gold/30 bg-white/[0.02] px-2 py-1.5 font-mono text-[11px]"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(shareUrl)}
                  className="grid h-8 w-8 place-items-center rounded-lg gradient-gold text-[#0B0D10]"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          )}

          {canJoin && (
            <Card className="p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-gold/80">
                Accept Challenge
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {game.time_control} · {game.is_rated ? "Rated" : "Casual"}
              </p>
              <div className="mt-3">
                <GoldButton onClick={joinAsOpponent} disabled={joining}>
                  <Swords className="h-4 w-4" /> Enter the Arena
                </GoldButton>
              </div>
            </Card>
          )}

          {!user && isWaiting && (
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Sign in to accept this challenge.</p>
              <div className="mt-3">
                <Link to="/auth">
                  <GoldButton>Sign in</GoldButton>
                </Link>
              </div>
            </Card>
          )}

          {isFinished && (
            <Card className="p-4 text-center">
              <Crown className="mx-auto h-6 w-6 text-gold" />
              <div className="mt-2 font-display text-2xl text-gradient-gold">
                {game.result === "draw"
                  ? "Draw"
                  : `${game.result === "white" ? "White" : "Black"} Wins${
                      game.end_reason ? ` by ${game.end_reason.replace(/_/g, " ")}` : ""
                    }`}
              </div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {game.end_reason}
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link to="/game/$id/review" params={{ id }}>
                  <GoldButton>
                    <Play className="h-4 w-4" /> Replay
                  </GoldButton>
                </Link>
                <Link to="/analysis" search={{ gameId: id }}>
                  <GhostButton>
                    <LineChart className="h-4 w-4" /> Analyze
                  </GhostButton>
                </Link>
                <Link to="/play/friend">
                  <GhostButton>
                    <Swords className="h-4 w-4" /> New Challenge
                  </GhostButton>
                </Link>
              </div>
            </Card>
          )}
        </div>

        <div className="lg:col-span-6">
          <InteractiveBoard
            board={board}
            orientation={orientation}
            selected={selected}
            targets={targets}
            lastMove={lastMove}
            checkSquare={checkSquare}
            onSquare={handleSquare}
            disabled={!isMyTurn || !!promotion || submittingRef.current}
            endState={endState as { result: "white" | "black" | "draw"; reason: string } | null}
          />
          <div className="mt-3 flex justify-center">
            <button
              onClick={() => setFlipped((f) => !f)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-gold"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Flip Board
            </button>
          </div>
          {promotion && (
            <div className="mt-4 flex justify-center">
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
          {drawFromOpponent && !isFinished && (
            <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-gold/30 bg-gold/10 p-4 shadow-lg shadow-gold/5 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 font-display text-lg text-gold">
                <Handshake className="h-5 w-5" /> Draw Request Received
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Your opponent has offered a draw.
              </div>
              <div className="mt-3 flex gap-3">
                <GoldButton onClick={offerOrAcceptDraw}>Accept</GoldButton>
                <GhostButton onClick={offerOrAcceptDraw} className="border border-white/10">
                  Decline
                </GhostButton>
              </div>
            </div>
          )}
          {!isWaiting && !isFinished && myColor && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <GhostButton
                onClick={offerOrAcceptDraw}
                disabled={!!(drawFromMe || drawFromOpponent)}
              >
                <Handshake className="h-4 w-4" />
                {game.draw_offered_by && !drawFromMe
                  ? "Accept Draw"
                  : drawFromMe
                    ? "Draw Offered"
                    : "Offer Draw"}
              </GhostButton>
              <GoldButton onClick={resign} className="bg-destructive text-foreground">
                <Flag className="h-4 w-4" /> Resign
              </GoldButton>
            </div>
          )}
        </div>

        <div className="space-y-4 lg:col-span-3">
          <Card className="p-4">
            <div className="mb-2 font-display">Moves</div>
            <div className="grid max-h-72 grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 overflow-y-auto pr-2 text-sm scrollbar-thin">
              {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => (
                <div className="contents" key={i}>
                  <div className="text-muted-foreground">{i + 1}.</div>
                  <div>{moves[i * 2]?.san ?? ""}</div>
                  <div className="text-muted-foreground">{moves[i * 2 + 1]?.san ?? ""}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <MessageCircle className="h-4 w-4 text-gold" /> Chat
            </div>
            <div className="h-40 space-y-1 overflow-y-auto rounded-lg bg-white/[0.02] p-2 text-xs scrollbar-thin">
              {chat.map((c) => (
                <div key={c.id}>
                  <span className="text-gold">{c.username}:</span> {c.body}
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendChat();
                }}
                placeholder={user ? "Type a message…" : "Sign in to chat"}
                disabled={!user}
                className="flex-1 rounded-full border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
              />
              <button
                onClick={sendChat}
                className="grid h-9 w-9 place-items-center rounded-full gradient-gold text-[#0B0D10]"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function PlayerCard({
  name,
  rating,
  baseMs,
  lastMoveAt,
  p_active,
  p_exp,
  avatar,
  active,
  me,
  board,
  player,
}: {
  name: string;
  rating: number | null;
  baseMs: number;
  lastMoveAt: number | null;
  p_active?: boolean;
  p_exp?: string | null;
  avatar?: string | null;
  active?: boolean;
  me?: boolean;
  board: BoardCell[][];
  player: "w" | "b";
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active || !lastMoveAt) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [active, lastMoveAt]);

  const elapsed = active && lastMoveAt ? Math.max(0, now - lastMoveAt) : 0;
  const currentMs = Math.max(0, baseMs - elapsed);
  return (
    <Card className={`p-4 ${active ? "ring-1 ring-gold/60" : ""}`}>
      <div className="flex items-center gap-3">
        <UserAvatar avatarUrl={avatar} displayName={name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm flex items-center">
            {name}
            <PremiumBadge premiumActive={p_active} premiumExpiresAt={p_exp} />
          </div>
          <div className="text-xs text-muted-foreground">
            {rating ?? "—"} {me ? "· You" : ""}
          </div>
          <CapturedPieces board={board} player={player} className="mt-0.5" />
        </div>
        <div
          className={`rounded-lg px-3 py-1.5 font-mono text-sm tabular-nums ${active ? "bg-gold text-[#0B0D10]" : "bg-white/5"}`}
        >
          {fmtClock(currentMs)}
        </div>
      </div>
    </Card>
  );
}
