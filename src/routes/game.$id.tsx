import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Chess, type Square } from "chess.js";
import { toast } from "sonner";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import { CapturedPieces } from "@/components/site/CapturedPieces";
import { SeasonShield } from "@/components/ranking/SeasonShield";
import { ClockTime } from "@/components/site/ClockTime";
import { useClockAudio } from "@/hooks/useClockAudio";
import { useChessClock } from "@/hooks/useChessClock";
import {
  createClock,
  press,
  restoreClock,
  formatMoveDuration,
  type ClockState,
} from "@/lib/chess/clock";
import { PromotionPicker } from "@/components/site/PromotionPicker";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { UserAvatar } from "@/components/site/UserAvatar";
import { GameEndModal } from "@/components/site/GameEndModal";
import { ConfirmModal } from "@/components/site/ConfirmModal";
import { formatEndReason, normalizeResult, resultSentence } from "@/lib/chess/result";
import { positionKey, terminalStateOf } from "@/lib/chess/rules";
import { useLiveGame } from "@/realtime/client/useLiveGame";
import { START_FEN } from "@/lib/chess/validation";
import { MoveDeadlineIndicator } from "@/components/site/MoveDeadlineIndicator";
import { ConnectionIndicator } from "@/components/site/ConnectionIndicator";
import { FriendButton } from "@/components/friends/FriendButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGameSettings } from "@/hooks/useGameSettings";
import { getSenderDisplayName } from "@/lib/api/chatClient";
import { playGameSound, soundForChessMove } from "@/lib/audio/sounds";
import { buzz } from "@/lib/haptics";
// Only matchmaking remains an HTTP RPC — joining a seat is a Supabase
// transaction, not a live-gameplay action. Moves, resignation, draw
// offers, chat and timeouts all travel over the socket now.
import { joinGame } from "@/lib/api/gameClient";
import { fetchSpectatorDefault } from "@/lib/api/spectatorClient";
import { SpectatorVisibilityControl } from "@/components/spectator/SpectatorVisibilityControl";
import type { SpectatorVisibility } from "@/lib/spectator/types";
import { useAntiCheatMonitor } from "@/lib/anticheat/useAntiCheatMonitor";
import { detectOpening } from "@/lib/chess/openings";
import {
  Flag,
  Handshake,
  Copy,
  Eye,
  Send,
  Crown,
  Swords,
  Play,
  LineChart,
  RotateCcw,
  Download,
  History,
  MessageSquare,
  Info,
  Users,
  BookOpen,
  ArrowLeft,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { noindexSeo } from "@/lib/seo";

import { RequireAuth } from "@/components/auth/RequireAuth";

export const Route = createFileRoute("/game/$id")({
  head: () => noindexSeo("Live Chess Game — ChessOx", "A live online chess game on ChessOx."),
  component: () => (
    <RequireAuth>
      <LiveGame />
    </RequireAuth>
  ),
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
  moves_count: number;
  white_time_ms: number;
  black_time_ms: number;
  last_move_at: string | null;
  host_id: string | null;
  winner_id: string | null;
  draw_offered_by: string | null;
  end_reason: string | null;
  is_rated: boolean;
  time_class: "bullet" | "blitz" | "rapid" | "classical";
  white_spectator_pref?: SpectatorVisibility | null;
  black_spectator_pref?: SpectatorVisibility | null;
};

type MoveRow = { ply: number; san: string; uci: string; fen_after: string; took_ms?: number };
type ChatRow = { id: number; username: string; user_id: string; body: string; created_at: string };

type RoomLookupClient = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        c: string,
        v: string,
      ) => { maybeSingle: () => Promise<{ data: { id: string; host_id: string } | null }> };
    };
  };
};

function LiveGame() {
  const { id } = useParams({ from: "/game/$id" });
  const navigate = useNavigate();
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

  // UI Tabs & Replay states
  const [activeTab, setActiveTab] = useState<"moves" | "chat" | "info" | "spectators" | "opening">(
    "moves",
  );
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [isPlayingReplay, setIsPlayingReplay] = useState(false);
  const [replaySpeed] = useState<number>(1);

  // Mobile Bottom Sheet states
  const [mobileSheet, setMobileSheet] = useState<"none" | "options" | "chat_moves">("none");
  const [mobileSheetTab, setMobileSheetTab] = useState<"chat" | "moves">("chat");

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const movesScrollRef = useRef<HTMLDivElement>(null);
  const horizontalMoveScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (horizontalMoveScrollRef.current) {
      horizontalMoveScrollRef.current.scrollLeft = horizontalMoveScrollRef.current.scrollWidth;
    }
  }, [moves.length]);

  const [whiteProfile, setWhiteProfile] = useState<{
    id?: string;
    username?: string;
    display_name?: string | null;
    full_name?: string | null;
    premium_active?: boolean;
    premium_expires_at?: string | null;
    avatar_url?: string | null;
  } | null>(null);
  const [blackProfile, setBlackProfile] = useState<{
    id?: string;
    username?: string;
    display_name?: string | null;
    full_name?: string | null;
    premium_active?: boolean;
    premium_expires_at?: string | null;
    avatar_url?: string | null;
  } | null>(null);

  const [showEndModal, setShowEndModal] = useState(false);
  const [hasShownEndModal, setHasShownEndModal] = useState(false);
  const [showResignModal, setShowResignModal] = useState(false);
  const [showDrawModal, setShowDrawModal] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomHostId, setRoomHostId] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [myVisibility, setMyVisibility] = useState<SpectatorVisibility>("public");

  const submittingRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const myColorRef = useRef<"w" | "b" | null>(null);
  const soundedPlyRef = useRef(0);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // ── Live transport ──────────────────────────────────────────────────
  // The single source of live truth. Opponent moves, clock handovers,
  // draw offers, chat and the final result all arrive here over the
  // socket — no postgres_changes subscription and no database read is
  // involved in rendering a move.
  const live = useLiveGame(id);

  const finishedRef = useRef(false);
  useEffect(() => {
    if (!game || game.status !== "finished" || finishedRef.current) return;
    finishedRef.current = true;
    if (game.result === "draw") playGameSound("draw");
    else if (user && game.winner_id === user.id) playGameSound("victory");
    else if (user && game.winner_id) playGameSound("defeat");
  }, [game?.status, game?.result, game?.winner_id, user?.id]);

  useEffect(() => {
    if (game && game.status === "finished" && !hasShownEndModal) {
      setShowEndModal(true);
      setHasShownEndModal(true);
    }
  }, [game?.status, hasShownEndModal, game]);

  useEffect(() => {
    if (live.rematchNewGameId) {
      toast.success("Rematch accepted! Starting new game...");
      void navigate({ to: "/game/$id", params: { id: live.rematchNewGameId } });
    }
  }, [live.rematchNewGameId, navigate]);

  useEffect(() => {
    if (!user?.id) return;
    void fetchSpectatorDefault(user.id).then(setMyVisibility);
  }, [user?.id]);

  useEffect(() => {
    if (!game || !user?.id) return;
    const pref =
      game.white_id === user.id
        ? game.white_spectator_pref
        : game.black_id === user.id
          ? game.black_spectator_pref
          : null;
    if (pref) setMyVisibility(pref);
  }, [
    game?.white_id,
    game?.black_id,
    game?.white_spectator_pref,
    game?.black_spectator_pref,
    user?.id,
    game,
  ]);

  // ── Socket snapshot -> the shapes this screen already renders ───────
  // The board, move list, clocks and chat below are unchanged; they are
  // simply fed from the authoritative socket snapshot instead of from a
  // `games` row plus three postgres_changes subscriptions.
  useEffect(() => {
    const snap = live.snapshot;
    if (!snap) return;

    setGame(
      (prev) =>
        ({
          // Fields the socket owns, every one of them server-authoritative.
          ...(prev ?? ({} as GameRow)),
          id: snap.gameId,
          fen: snap.fen,
          turn: snap.turn,
          status: snap.status,
          result: snap.result,
          end_reason: snap.endReason,
          winner_id: snap.winnerId,
          moves_count: snap.moves.length,
          draw_offered_by: snap.drawOfferedBy,
          white_id: snap.white.userId,
          black_id: snap.black.userId,
          white_username: snap.white.username,
          black_username: snap.black.username,
          white_rating: snap.white.rating,
          black_rating: snap.black.rating,
          white_time_ms: snap.clock.whiteMs,
          black_time_ms: snap.clock.blackMs,
          last_move_at: new Date(snap.clock.since).toISOString(),
          // Only the untimed/timed distinction is read off this column; the
          // clock itself is built from `snap.clock` in the `clock` memo, not
          // reconstructed from row fields.
          initial_seconds: snap.clock.untimed ? 0 : 1,
          increment_seconds: Math.round(snap.clock.incrementMs / 1000),
          is_rated: snap.isRated,
          time_control: snap.timeControl,
        }) as GameRow,
    );

    setMoves(
      snap.moves.map((m, idx, arr) => {
        let tookMs = m.tookMs;
        if ((!tookMs || tookMs === 0) && m.at && idx > 0) {
          const prevAt = arr[idx - 1].at;
          if (prevAt && m.at > prevAt) {
            tookMs = m.at - prevAt;
          }
        }
        return {
          ply: m.ply,
          san: m.san,
          uci: m.uci,
          fen_after: m.fenAfter,
          took_ms: tookMs,
        };
      }),
    );

    setChat(
      snap.chat.map((c) => ({
        id: Number.isFinite(Number(c.id)) ? Number(c.id) : c.at,
        username: c.username,
        user_id: c.userId,
        body: c.body,
        created_at: new Date(c.at).toISOString(),
      })),
    );
  }, [live.snapshot]);

  // A viewer with no seat in a game still in progress keeps the existing
  // behaviour: the live board is for its two players, everyone else is
  // sent to the delayed broadcast.
  useEffect(() => {
    const snap = live.snapshot;
    if (!snap || !live.ready) return;
    const seated = !!user && (snap.white.userId === user.id || snap.black.userId === user.id);
    setUnreadable(!seated && snap.status === "active");
  }, [live.snapshot, live.ready, user]);

  // Non-gameplay metadata: the room this game belongs to and the two
  // players' avatars/premium badges. Read once from Supabase — these
  // never change mid-game and are not part of the live path.
  useEffect(() => {
    let active = true;
    const roomClient = supabase as unknown as RoomLookupClient;
    void roomClient
      .from("public_rooms")
      .select("id, host_id")
      .eq("game_id", id)
      .maybeSingle()
      .then(({ data: room }) => {
        if (!active || !room) return;
        setRoomId(room.id);
        setRoomHostId(room.host_id);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const whiteId = live.snapshot?.white.userId ?? null;
  const blackId = live.snapshot?.black.userId ?? null;
  useEffect(() => {
    const pids = [whiteId, blackId].filter(Boolean) as string[];
    if (pids.length === 0) return;
    let active = true;
    void supabase
      .from("profiles")
      .select(
        "id, username, display_name, full_name, premium_active, premium_expires_at, avatar_url",
      )
      .in("id", pids)
      .then(({ data: profs }) => {
        if (!active || !profs) return;
        const w = profs.find((p) => p.id === whiteId);
        const b = profs.find((p) => p.id === blackId);
        if (w) setWhiteProfile(w);
        if (b) setBlackProfile(b);
      });
    return () => {
      active = false;
    };
  }, [whiteId, blackId]);

  // Move audio for anything that arrived over the socket. Our own move
  // already sounded at commit time, so this only fires for the opponent
  // (and for every move, when watching).
  useEffect(() => {
    const last = moves[moves.length - 1];
    if (!last || last.ply <= soundedPlyRef.current) return;
    soundedPlyRef.current = last.ply;
    const moverColor: "w" | "b" = last.ply % 2 === 1 ? "w" : "b";
    if (myColorRef.current && myColorRef.current === moverColor) return;
    if (last.san.includes("#")) playGameSound("checkmate");
    else if (last.san.includes("+")) playGameSound("check");
    else if (last.san.startsWith("O-O")) playGameSound("castle");
    else if (last.san.includes("=")) playGameSound("promote");
    else if (last.san.includes("x")) playGameSound("capture");
    else playGameSound("move");
  }, [moves]);

  // Chat arriving from the opponent over the socket.
  const chatCountRef = useRef(0);
  useEffect(() => {
    if (chat.length > chatCountRef.current) {
      const last = chat[chat.length - 1];
      if (chatCountRef.current > 0 && last && last.user_id !== userIdRef.current) {
        playGameSound("notify");
      }
    }
    chatCountRef.current = chat.length;
  }, [chat]);

  // Surface a refused action (illegal move, not your turn, out of time).
  useEffect(() => {
    if (live.error) toast.error(live.error);
  }, [live.error]);

  const myColor: "w" | "b" | null = useMemo(() => {
    if (!game || !user) return null;
    if (game.white_id === user.id) return "w";
    if (game.black_id === user.id) return "b";
    return null;
  }, [game, user]);

  useEffect(() => {
    myColorRef.current = myColor;
  }, [myColor]);

  // The one unconfirmed move this client applied locally. It is owned by
  // the transport (`useLiveGame`), which clears it the moment the
  // server's own broadcast of the same ply arrives, or on a refusal.
  //
  // The terminal verdict is derived here rather than stored: mate and
  // stalemate are visible in the position alone, which covers what the
  // overlay needs during the few milliseconds before the server's
  // authoritative `game:end` lands and supersedes it.
  const pending = useMemo(() => {
    const p = live.pending;
    if (!p) return null;
    let terminal: { result: "white" | "black" | "draw"; reason: string } | null = null;
    try {
      const term = terminalStateOf(new Chess(p.fen));
      if (term && term.result !== "ongoing") {
        terminal = {
          result: term.result as "white" | "black" | "draw",
          reason: formatEndReason(term.reason) ?? "",
        };
      }
    } catch {
      /* unparseable optimistic position — let the server settle it */
    }
    return { ...p, terminal };
  }, [live.pending]);

  useAntiCheatMonitor({
    gameId: id,
    status: game?.status,
    myColor,
    userId: user?.id,
    movesCount: moves.length,
  });

  const activeTurn = useMemo(() => {
    if (pending) return pending.fen.split(" ")[1] as "w" | "b";
    if (live.snapshot) return live.snapshot.fen.split(" ")[1] as "w" | "b";
    return (game?.turn as "w" | "b") ?? "w";
  }, [pending, live.snapshot, game?.turn]);

  const displayFen = useMemo(() => {
    if (pending) return pending.fen;
    if (live.snapshot) return live.snapshot.fen;
    if (!game) return START_FEN;
    return game.fen;
  }, [pending, live.snapshot, game]);

  const chess = useMemo(() => {
    try {
      return new Chess(displayFen);
    } catch {
      return new Chess();
    }
  }, [displayFen]);

  const liveBoard = useMemo(() => {
    const b = chess.board();
    const result: BoardCell[][] = [];
    for (let r = 0; r < 8; r++) {
      const row: BoardCell[] = [];
      for (let f = 0; f < 8; f++) {
        const sq = b[r][f];
        if (sq) {
          row.push({
            square: sq.square as Square,
            type: sq.type,
            color: sq.color,
          });
        } else {
          row.push(null);
        }
      }
      result.push(row);
    }
    return result;
  }, [chess]);

  // ViewPly historical board rendering
  const displayBoard = useMemo(() => {
    if (viewPly === null || moves.length === 0) return liveBoard;
    try {
      const c = new Chess();
      const targetPly = Math.min(viewPly, moves.length);
      for (let i = 0; i < targetPly; i++) {
        c.move(moves[i].san);
      }
      const b = c.board();
      const result: BoardCell[][] = [];
      for (let r = 0; r < 8; r++) {
        const row: BoardCell[] = [];
        for (let f = 0; f < 8; f++) {
          const sq = b[r][f];
          if (sq) {
            row.push({
              square: sq.square as Square,
              type: sq.type,
              color: sq.color,
            });
          } else {
            row.push(null);
          }
        }
        result.push(row);
      }
      return result;
    } catch {
      return liveBoard;
    }
  }, [viewPly, moves, liveBoard]);

  const board = displayBoard;

  const lastMove = useMemo(() => {
    if (viewPly !== null && viewPly > 0) {
      const allMoves = live.snapshot?.moves ?? moves;
      if (viewPly <= allMoves.length) {
        const targetMove = allMoves[viewPly - 1];
        if (targetMove && targetMove.uci) {
          return { from: targetMove.uci.slice(0, 2), to: targetMove.uci.slice(2, 4) };
        }
      }
    }
    if (pending) return { from: pending.from, to: pending.to };
    const snapMoves = live.snapshot?.moves ?? [];
    if (snapMoves.length > 0) {
      const last = snapMoves[snapMoves.length - 1];
      if (last.uci) return { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) };
    }
    if (moves.length === 0) return null;
    const last = moves[moves.length - 1];
    if (!last.uci) return null;
    return { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) };
  }, [pending, live.snapshot, moves, viewPly]);

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    const turnColor = chess.turn();
    const boardState = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = boardState[r][c];
        if (sq && sq.type === "k" && sq.color === turnColor) {
          return sq.square;
        }
      }
    }
    return null;
  }, [chess]);

  const orientation = useMemo(() => {
    if (flipped) return myColor === "b" ? "w" : "b";
    return myColor === "b" ? "b" : "w";
  }, [flipped, myColor]);

  const isMyTurn = useMemo(() => {
    if (!game || !myColor || game.status !== "active") return false;
    return activeTurn === myColor;
  }, [game, myColor, activeTurn]);

  const endState = useMemo(() => {
    if (pending?.terminal) return pending.terminal;
    if (game?.status !== "finished" || !game.result) return null;
    const res = normalizeResult(game.result);
    return { result: res, reason: formatEndReason(game.end_reason) };
  }, [pending, game?.status, game?.result, game?.end_reason]);

  // The server's clock, taken straight from the snapshot rather than
  // rebuilt from row columns. `ClockSnapshot` is already a ClockState:
  // banked milliseconds per side plus the instant the running side's turn
  // began, all stamped by the server. `remainingMs` subtracts the elapsed
  // time exactly once at render.
  //
  // An unconfirmed local move hands the clock over immediately, so the
  // opponent's time starts running in the same frame the piece lands
  // instead of a round trip later; the server's next snapshot overwrites
  // it with the authoritative numbers.
  const clock: ClockState = useMemo(() => {
    const snap = live.snapshot;
    if (!snap) return createClock({ initialMs: 300000 });
    const server: ClockState = {
      whiteMs: snap.clock.whiteMs,
      blackMs: snap.clock.blackMs,
      running: snap.clock.running,
      since: snap.clock.since,
      incrementMs: snap.clock.incrementMs,
      delayMs: 0,
      untimed: snap.clock.untimed,
    };
    if (!pending || server.untimed || !server.running) return server;
    return press(restoreClock(server, pending.at), pending.at);
  }, [live.snapshot, pending]);

  // Flag falls are settled server-side by a per-game timer that fires at
  // the exact instant a clock expires (realtime/server/registry.ts), so
  // there is nothing for the client to claim. The old `claim_timeout`
  // RPC could only fire while someone had the tab open — a game whose
  // loser simply closed the browser never ended.

  // Replay Auto-Playback timer
  useEffect(() => {
    if (!isPlayingReplay) return;
    const interval = setInterval(() => {
      setViewPly((current) => {
        const next = (current ?? 0) + 1;
        if (next > moves.length) {
          setIsPlayingReplay(false);
          return null;
        }
        return next;
      });
    }, 1000 / replaySpeed);
    return () => clearInterval(interval);
  }, [isPlayingReplay, moves.length, replaySpeed]);

  // Auto-scroll chat & moves
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chat]);

  useEffect(() => {
    if (movesScrollRef.current && viewPly === null) {
      movesScrollRef.current.scrollTop = movesScrollRef.current.scrollHeight;
    }
  }, [moves.length, viewPly]);

  const commitMove = useCallback(
    async (from: string, to: string, promo?: "q" | "r" | "b" | "n") => {
      if (!game || !myColor || submittingRef.current) return;

      // Play the cue and the haptic from the local position immediately —
      // this is the frame the player sees. `live.move` applies the same
      // move optimistically and emits it; the opponent's board is updated
      // from the server's broadcast of it, with no database in between.
      try {
        const localChess = new Chess(pending?.fen ?? game.fen);
        const res = localChess.move({ from, to, promotion: promo });
        if (!res) throw new Error("Illegal move");
        soundForChessMove(res, localChess);
        buzz(12);
        soundedPlyRef.current = Math.max(soundedPlyRef.current, moves.length + 1);
      } catch {
        toast.error("Illegal move.");
        return;
      }

      submittingRef.current = true;
      setSelected(null);
      setTargets([]);

      try {
        await live.move(from, to, promo);
      } catch {
        // `live.move` has already reverted the optimistic board and
        // surfaced the reason; nothing to add here.
      } finally {
        submittingRef.current = false;
      }
    },
    [game, myColor, pending?.fen, moves.length, live],
  );

  const handleSquare = useCallback(
    (sq: string) => {
      if (viewPly !== null) {
        setViewPly(null);
      }
      if (!isMyTurn || promotion) return;
      const square = sq as Square;

      if (selected) {
        if (selected === square) {
          setSelected(null);
          setTargets([]);
          return;
        }

        const isTarget = targets.includes(square);
        if (isTarget) {
          const piece = chess.get(selected as Square);
          const targetRank = square[1];
          const isPawnPromotion = piece?.type === "p" && (targetRank === "8" || targetRank === "1");

          if (isPawnPromotion) {
            if (settings.auto_queen) {
              void commitMove(selected, square, "q");
            } else {
              setPromotion({ from: selected, to: square });
            }
            return;
          }

          void commitMove(selected, square, undefined);
          return;
        }
      }

      const piece = chess.get(square);
      if (piece && piece.color === activeTurn && piece.color === myColor) {
        setSelected(sq);
        setTargets(chess.moves({ square, verbose: true }).map((mv) => mv.to));
      } else {
        setSelected(null);
        setTargets([]);
      }
    },
    [
      viewPly,
      isMyTurn,
      promotion,
      selected,
      chess,
      settings.auto_queen,
      activeTurn,
      myColor,
      commitMove,
      targets,
    ],
  );

  async function joinAsOpponent() {
    if (!user || !game || game.status !== "waiting") return;
    if (game.white_id === user.id || game.black_id === user.id) return;
    setJoining(true);
    try {
      await joinGame(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join the game.");
    } finally {
      setJoining(false);
    }
  }

  async function executeResign() {
    if (!game || !myColor || game.status !== "active") return;
    try {
      await live.resign();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resign failed.");
    }
  }

  function handleResignClick() {
    if (!game || !myColor || game.status !== "active") return;
    if (settings.confirm_resign) {
      setShowResignModal(true);
    } else {
      void executeResign();
    }
  }

  async function executeDrawOffer() {
    if (!game || !myColor || game.status !== "active") return;
    try {
      const res = await live.offerOrAcceptDraw();
      if (res === "offered") toast.info("Draw offer sent to opponent.");
      if (res === "declined") toast.error("Draw request declined.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Draw action failed.");
    }
  }

  async function executeDeclineDraw() {
    if (!game || !myColor || game.status !== "active") return;
    try {
      await live.declineDraw();
      toast.info("Draw offer declined.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not decline draw.");
    }
  }

  function handleDrawClick() {
    if (!game || !myColor || game.status !== "active") return;
    if (settings.confirm_draw_offer && !game.draw_offered_by) {
      setShowDrawModal(true);
    } else {
      void executeDrawOffer();
    }
  }

  const rematchStatus = useMemo(() => {
    if (!live.rematchOffer) return "none";
    if (live.rematchOffer.offeredBy === user?.id) return "offered";
    return "incoming";
  }, [live.rematchOffer, user?.id]);

  const handleRematchOffer = useCallback(async () => {
    if (!user?.id) {
      toast.info("Please sign in to offer a rematch!");
      return;
    }
    try {
      const res = await live.offerRematch();
      if (res.status === "accepted" && res.newGameId) {
        toast.success("Rematch accepted! Starting new game...");
        void navigate({ to: "/game/$id", params: { id: res.newGameId } });
      } else {
        toast.info("Rematch offer sent to opponent!");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rematch request failed.");
    }
  }, [user?.id, live, navigate]);

  async function sendChat() {
    if (!chatInput.trim() || !user) return;
    const body = chatInput.trim().slice(0, 500);
    setChatInput("");
    try {
      // Chat rides the same socket and is held in the live game, then
      // flushed to `game_chat` when the game is persisted at the end.
      await live.sendChat(body);
    } catch (err) {
      setChatInput(body);
      toast.error(err instanceof Error ? err.message : "Message failed to send.");
    }
  }

  function sendQuickEmoji(emo: string) {
    if (!user) return;
    setChatInput((prev) => prev + emo);
  }

  function downloadPGN() {
    if (!game) return;
    const pgnContent =
      game.pgn ||
      moves.map((m, i) => `${i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ""}${m.san}`).join(" ");
    const blob = new Blob([pgnContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `game-${id}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("PGN downloaded!");
  }

  function copyPGN() {
    const pgnContent =
      game?.pgn ||
      moves.map((m, i) => `${i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ""}${m.san}`).join(" ");
    if (!pgnContent) return;
    navigator.clipboard.writeText(pgnContent);
    toast.success("PGN copied to clipboard!");
  }

  if (!game && unreadable)
    return (
      <PageShell title="Watch this game" compact>
        <Card className="mx-auto max-w-lg p-10 text-center">
          <Eye className="mx-auto mb-4 h-8 w-8 text-gold/70" aria-hidden />
          <p className="text-sm text-muted-foreground">
            You are not playing in this game. Live boards are private to their two players — the
            broadcast is available on the spectator feed, a short delay behind the players.
          </p>
          <Link to="/watch/$id" params={{ id }} className="mt-6 inline-block">
            <GoldButton>Watch the broadcast</GoldButton>
          </Link>
        </Card>
      </PageShell>
    );

  if (!game)
    return (
      <PageShell title="Loading throne…">
        <div className="flex h-64 items-center justify-center text-sm text-gold/80">
          Loading live game...
        </div>
      </PageShell>
    );

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/game/${id}` : "";

  const topColor: "w" | "b" = orientation === "w" ? "b" : "w";
  const bottomColor: "w" | "b" = orientation === "w" ? "w" : "b";

  const topPlayer = {
    name:
      topColor === "w" ? (game.white_username ?? "White") : (game.black_username ?? "Awaiting…"),
    rating: topColor === "w" ? game.white_rating : game.black_rating,
    color: topColor,
    p_active: topColor === "w" ? whiteProfile?.premium_active : blackProfile?.premium_active,
    p_exp: topColor === "w" ? whiteProfile?.premium_expires_at : blackProfile?.premium_expires_at,
    avatar: topColor === "w" ? whiteProfile?.avatar_url : blackProfile?.avatar_url,
    isMe: myColor === topColor,
    id: topColor === "w" ? game.white_id : game.black_id,
  };

  const bottomPlayer = {
    name:
      bottomColor === "w" ? (game.white_username ?? "White") : (game.black_username ?? "Awaiting…"),
    rating: bottomColor === "w" ? game.white_rating : game.black_rating,
    color: bottomColor,
    p_active: bottomColor === "w" ? whiteProfile?.premium_active : blackProfile?.premium_active,
    p_exp:
      bottomColor === "w" ? whiteProfile?.premium_expires_at : blackProfile?.premium_expires_at,
    avatar: bottomColor === "w" ? whiteProfile?.avatar_url : blackProfile?.avatar_url,
    isMe: myColor === bottomColor,
    id: bottomColor === "w" ? game.white_id : game.black_id,
  };

  const isWaiting = game.status === "waiting";
  const isFinished = game.status === "finished";
  const canJoin =
    isWaiting && !!user && (!game.white_id || !game.black_id) && game.host_id !== user.id;
  const isHostWaiting = isWaiting && user?.id === game.host_id;
  const drawFromMe = game.draw_offered_by === user?.id;
  const drawFromOpponent = game.draw_offered_by && game.draw_offered_by !== user?.id;

  const currentOpening = detectOpening(moves.map((m) => m.san));

  return (
    <PageShell compact>
      <ConfirmModal
        isOpen={showResignModal}
        onClose={() => setShowResignModal(false)}
        onConfirm={executeResign}
        title="Resign Game?"
        description="Are you sure you want to resign this game? This will count as a defeat."
        confirmText="Yes, Resign"
        cancelText="Cancel"
        icon={<Flag className="h-6 w-6 text-red-400" />}
        variant="danger"
      />

      <ConfirmModal
        isOpen={showDrawModal}
        onClose={() => setShowDrawModal(false)}
        onConfirm={executeDrawOffer}
        title="Offer Draw?"
        description="Send a draw offer to your opponent?"
        confirmText="Offer Draw"
        cancelText="Cancel"
        icon={<Handshake className="h-6 w-6 text-gold" />}
        variant="gold"
      />

      {/* Top Floating Rematch Notification Banner inside site */}
      {live.rematchOffer && game?.status === "finished" && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-[#0C0E12]/95 border border-gold/40 px-5 py-2.5 shadow-2xl shadow-gold/20 backdrop-blur-md animate-in slide-in-from-top-4 duration-300">
          <Swords className="h-4 w-4 text-gold animate-pulse" />
          <span className="text-xs font-semibold text-foreground">
            {live.rematchOffer.offeredBy === user?.id
              ? "Rematch offer sent to opponent..."
              : "Opponent requested a rematch!"}
          </span>
          {live.rematchOffer.offeredBy !== user?.id ? (
            <div className="flex items-center gap-2">
              <GoldButton onClick={handleRematchOffer} className="h-7 px-3 text-xs">
                Accept
              </GoldButton>
              <GhostButton
                onClick={() => live.declineRematch()}
                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground border-white/10"
              >
                Decline
              </GhostButton>
            </div>
          ) : (
            <span className="text-[10px] text-gold/80 italic animate-pulse">Waiting...</span>
          )}
        </div>
      )}

      {/* Top Floating Draw Offer Notification Banner inside site */}
      {game?.status === "active" && (drawFromOpponent || drawFromMe) && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-[#0C0E12]/95 border border-gold/40 px-5 py-2.5 shadow-2xl shadow-gold/20 backdrop-blur-md animate-in slide-in-from-top-4 duration-300 max-w-[95vw]">
          <Handshake className="h-4 w-4 text-gold animate-pulse shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">
            {drawFromOpponent ? "Opponent offered a draw!" : "Draw offer sent to opponent..."}
          </span>
          {drawFromOpponent ? (
            <div className="flex items-center gap-2 shrink-0">
              <GoldButton
                onClick={executeDrawOffer}
                className="h-7 px-3 text-xs bg-gradient-to-r from-gold to-amber-500 text-black font-bold"
              >
                Accept
              </GoldButton>
              <GhostButton
                onClick={executeDeclineDraw}
                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground border-white/10"
              >
                Decline
              </GhostButton>
            </div>
          ) : (
            <span className="text-[10px] text-gold/80 italic animate-pulse shrink-0">
              Waiting...
            </span>
          )}
        </div>
      )}

      {showEndModal && game.status === "finished" && (
        <GameEndModal
          result={game.result}
          reason={game.end_reason}
          myColor={myColor}
          gameId={id}
          roomId={roomId ?? undefined}
          roomHostId={roomHostId ?? undefined}
          currentUserId={user?.id}
          onClose={() => setShowEndModal(false)}
          onRematch={handleRematchOffer}
          rematchStatus={rematchStatus}
        />
      )}

      {/* =================================================== */}
      {/* MOBILE LAYOUT (< lg screens)                       */}
      {/* =================================================== */}
      <div className="flex lg:hidden flex-col h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#0B0D10] text-foreground select-none fixed inset-0 z-10 touch-none overscroll-none">
        {/* 1. FIXED TOP HEADER */}
        <header className="flex-shrink-0 h-11 bg-black/90 backdrop-blur-md border-b border-gold/20 px-3 flex items-center justify-between z-20">
          <button
            onClick={() => void navigate({ to: "/play" })}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-gold transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Play</span>
          </button>
          {/* Connection state lives in the header strip so it never covers
              the board. Degraded states take the slot outright, because a
              lost connection matters more than the wordmark. */}
          {live.connection === "live" || live.connection === "connecting" ? (
            <div className="flex items-center gap-1.5">
              <Crown className="h-4 w-4 text-gold" />
              <span className="font-display font-bold text-sm tracking-wider text-gradient-gold">
                ChessOX
              </span>
              <ConnectionIndicator
                connection={live.connection}
                onRejoin={() => void live.rejoin()}
                compact
              />
            </div>
          ) : (
            <ConnectionIndicator connection={live.connection} onRejoin={() => void live.rejoin()} />
          )}
          <div className="flex justify-end shrink-0">
            {user?.id && (
              <SpectatorVisibilityControl
                scope="game"
                gameId={id}
                value={myVisibility}
                onChange={setMyVisibility}
                mode="dropdown"
              />
            )}
          </div>
        </header>

        {/* 2. HORIZONTAL MOVE HISTORY BAR */}
        <div
          ref={horizontalMoveScrollRef}
          className="flex-shrink-0 h-9 bg-black/60 border-b border-white/10 px-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none text-xs"
        >
          {moves.length === 0 ? (
            <span className="text-[11px] text-muted-foreground/60 italic">1. game start...</span>
          ) : (
            moves.map((m, idx) => {
              if (idx % 2 !== 0) return null;
              const moveNum = Math.floor(idx / 2) + 1;
              const wMove = m;
              const bMove = moves[idx + 1];
              const isWActive = viewPly !== null ? viewPly === idx + 1 : idx === moves.length - 1;
              const isBActive =
                viewPly !== null ? viewPly === idx + 2 : bMove && idx + 1 === moves.length - 1;

              return (
                <div key={idx} className="inline-flex items-center gap-1 shrink-0">
                  <span className="text-[11px] text-gold/70 font-mono font-medium">{moveNum}.</span>
                  <button
                    onClick={() => setViewPly(idx + 1)}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                      isWActive
                        ? "bg-gold text-[#0B0D10] font-bold shadow-sm shadow-gold/40"
                        : "bg-white/5 text-foreground hover:bg-white/15"
                    }`}
                  >
                    {wMove.san}
                  </button>
                  {bMove && (
                    <button
                      onClick={() => setViewPly(idx + 2)}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                        isBActive
                          ? "bg-gold text-[#0B0D10] font-bold shadow-sm shadow-gold/40"
                          : "bg-white/5 text-foreground hover:bg-white/15"
                      }`}
                    >
                      {bMove.san}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* MAIN GAME CONTAINER (OPPONENT PROFILE + BOARD + PLAYER PROFILE) */}
        <div className="flex-1 flex flex-col justify-center items-center px-1 py-0.5 overflow-hidden min-h-0 w-full">
          {/* 3. OPPONENT PROFILE */}
          <div className="w-full max-w-[min(100vw-8px,calc(100dvh-220px))] flex-shrink-0">
            <PlayerCard
              name={topPlayer.name}
              rating={topPlayer.rating}
              clock={clock}
              color={topPlayer.color}
              showClock={!clock.untimed}
              p_active={topPlayer.p_active}
              p_exp={topPlayer.p_exp}
              avatar={topPlayer.avatar}
              active={!isWaiting && activeTurn === topPlayer.color}
              board={liveBoard}
              player={topPlayer.color}
              friendUserId={topPlayer.isMe ? null : topPlayer.id}
              moveDeadlineAt={live.snapshot?.moveDeadlineAt}
              moveDeadlineSeconds={live.snapshot?.moveDeadlineSeconds}
              isGameActive={game.status === "active"}
            />
          </div>

          {/* 4. CHESS BOARD */}
          <div className="w-full max-w-[min(100vw-8px,calc(100dvh-220px))] aspect-square relative flex items-center justify-center flex-shrink-0 my-0.5">
            <InteractiveBoard
              board={displayBoard}
              orientation={orientation}
              selected={selected}
              targets={targets}
              lastMove={lastMove}
              checkSquare={checkSquare}
              onSquare={handleSquare}
              disabled={!isMyTurn || !!promotion || submittingRef.current}
              endState={
                viewPly !== null
                  ? null
                  : (endState as { result: "white" | "black" | "draw"; reason: string } | null)
              }
            />

            {/* Promotion Picker */}
            {promotion && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
          </div>

          {/* 5. PLAYER PROFILE */}
          <div className="w-full max-w-[min(100vw-8px,calc(100dvh-220px))] flex-shrink-0">
            <PlayerCard
              name={bottomPlayer.name}
              rating={bottomPlayer.rating}
              clock={clock}
              color={bottomPlayer.color}
              showClock={!clock.untimed}
              p_active={bottomPlayer.p_active}
              p_exp={bottomPlayer.p_exp}
              avatar={bottomPlayer.avatar}
              active={!isWaiting && activeTurn === bottomPlayer.color}
              board={liveBoard}
              player={bottomPlayer.color}
              me={bottomPlayer.isMe}
              friendUserId={bottomPlayer.isMe ? null : bottomPlayer.id}
              moveDeadlineAt={live.snapshot?.moveDeadlineAt}
              moveDeadlineSeconds={live.snapshot?.moveDeadlineSeconds}
              isGameActive={game.status === "active"}
            />
          </div>
        </div>

        {/* 6. BOTTOM NAVIGATION (4 BUTTONS) */}
        <nav className="flex-shrink-0 h-14 bg-black/95 backdrop-blur-md border-t border-white/10 grid grid-cols-4 items-center justify-items-center px-1 z-20">
          {/* Button 1: Options */}
          <button
            onClick={() => setMobileSheet(mobileSheet === "options" ? "none" : "options")}
            className={`w-full h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
              mobileSheet === "options"
                ? "text-gold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Options</span>
          </button>

          {/* Button 2: Chat / Moves */}
          <button
            onClick={() => setMobileSheet(mobileSheet === "chat_moves" ? "none" : "chat_moves")}
            className={`w-full h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
              mobileSheet === "chat_moves"
                ? "text-gold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Chat</span>
          </button>

          {/* Button 3: Back (Replay Previous Move) */}
          <button
            onClick={() => setViewPly((prev) => Math.max(0, (prev ?? moves.length) - 1))}
            disabled={moves.length === 0 || viewPly === 0}
            className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Back</span>
          </button>

          {/* Button 4: Forward (Replay Next Move) */}
          <button
            onClick={() =>
              setViewPly((prev) => {
                if (prev === null) return null;
                const next = prev + 1;
                return next >= moves.length ? null : next;
              })
            }
            disabled={viewPly === null || viewPly >= moves.length}
            className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
            <span>Forward</span>
          </button>
        </nav>

        {/* BOTTOM SHEETS */}
        {mobileSheet !== "none" && (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setMobileSheet("none")}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            />

            {/* Sheet Container */}
            <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t border-gold/30 bg-black/95 p-4 shadow-2xl shadow-gold/20 max-h-[75vh] flex flex-col animate-in slide-in-from-bottom duration-300">
              {/* Drag handle */}
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-3 shrink-0" />

              {/* OPTIONS BOTTOM SHEET */}
              {mobileSheet === "options" && (
                <div className="flex flex-col space-y-3 overflow-y-auto max-h-[60vh] pb-2">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="font-display font-bold text-base text-gold flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4" /> Game Options
                    </span>
                    <button
                      onClick={() => setMobileSheet("none")}
                      className="p-1 rounded-full bg-white/5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Actions Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Draw Offer / Accept / Decline */}
                    {drawFromOpponent ? (
                      <div className="col-span-2 flex items-center justify-between gap-2 p-2.5 rounded-xl border border-gold/40 bg-gold/10">
                        <div className="flex items-center gap-2 text-xs font-semibold text-gold">
                          <Handshake className="h-4 w-4 shrink-0" />
                          <span>Draw Offered by Opponent</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <GoldButton
                            onClick={() => {
                              setMobileSheet("none");
                              void executeDrawOffer();
                            }}
                            className="h-7 px-3 text-xs bg-gradient-to-r from-gold to-amber-500 text-black font-bold"
                          >
                            Accept
                          </GoldButton>
                          <GhostButton
                            onClick={() => {
                              setMobileSheet("none");
                              void executeDeclineDraw();
                            }}
                            className="h-7 px-2.5 text-xs border border-white/10 text-muted-foreground hover:text-foreground"
                          >
                            Decline
                          </GhostButton>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setMobileSheet("none");
                          handleDrawClick();
                        }}
                        disabled={!myColor || drawFromMe || game?.status !== "active"}
                        className="flex items-center gap-2 p-3 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-foreground hover:border-gold/30 hover:bg-gold/10 disabled:opacity-40 transition-all"
                      >
                        <Handshake className="h-4 w-4 text-gold" />
                        <span>{drawFromMe ? "Draw Offered" : "Offer Draw"}</span>
                      </button>
                    )}

                    {/* Resign */}
                    <button
                      onClick={() => {
                        setMobileSheet("none");
                        handleResignClick();
                      }}
                      disabled={game?.status !== "active"}
                      className="flex items-center gap-2 p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 transition-all"
                    >
                      <Flag className="h-4 w-4 text-rose-400" />
                      <span>Resign</span>
                    </button>
                  </div>

                  {/* Game Details Info */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2 text-xs">
                    <div className="font-semibold text-gold flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5" /> Game Information
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-muted-foreground text-[11px]">
                      <div>
                        Opening:{" "}
                        <span className="text-foreground font-medium">
                          {currentOpening?.name ?? "Standard"}
                        </span>
                      </div>
                      <div>
                        Format:{" "}
                        <span className="text-foreground font-medium uppercase">
                          {game?.time_class ?? "Blitz"}
                        </span>
                      </div>
                      <div>
                        Rated:{" "}
                        <span className="text-foreground font-medium">
                          {game?.is_rated ? "Yes" : "Casual"}
                        </span>
                      </div>
                      <div>
                        ID:{" "}
                        <span className="text-foreground font-medium font-mono text-[10px]">
                          {id.slice(0, 8)}...
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Export PGN */}
                  <button
                    onClick={() => {
                      copyPGN();
                      setMobileSheet("none");
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/10"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy PGN
                  </button>
                </div>
              )}

              {/* CHAT / MOVES BOTTOM SHEET */}
              {mobileSheet === "chat_moves" && (
                <div className="flex flex-col h-[55vh] max-h-[500px]">
                  {/* Two Tab Navigation Header */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2 shrink-0">
                    <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl">
                      <button
                        onClick={() => setMobileSheetTab("chat")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          mobileSheetTab === "chat"
                            ? "bg-gold text-[#0B0D10] font-bold shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Chat
                      </button>
                      <button
                        onClick={() => setMobileSheetTab("moves")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          mobileSheetTab === "moves"
                            ? "bg-gold text-[#0B0D10] font-bold shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <History className="h-3.5 w-3.5" /> Moves ({moves.length})
                      </button>
                    </div>
                    <button
                      onClick={() => setMobileSheet("none")}
                      className="p-1 rounded-full bg-white/5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* TAB 1: CHAT */}
                  {mobileSheetTab === "chat" && (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex-1 overflow-y-auto space-y-2 p-2 rounded-xl bg-black/40 border border-white/5 scrollbar-thin">
                        {chat.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground/60 text-xs italic">
                            No chat messages yet. Say hello!
                          </div>
                        ) : (
                          chat.map((msg, idx) => {
                            const isMe = msg.user_id === user?.id;
                            const profile =
                              msg.user_id === whiteId
                                ? whiteProfile
                                : msg.user_id === blackId
                                  ? blackProfile
                                  : null;
                            const displayName = getSenderDisplayName(
                              profile ?? { username: msg.username },
                            );
                            const avatarUrl = profile?.avatar_url;
                            const isGrouped =
                              idx > 0 &&
                              chat[idx - 1].user_id === msg.user_id &&
                              new Date(msg.created_at).getTime() -
                                new Date(chat[idx - 1].created_at).getTime() <
                                300000;
                            const timeStr = msg.created_at
                              ? new Date(msg.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "";
                            return (
                              <div
                                key={msg.id}
                                className={`flex max-w-[85%] gap-2 ${
                                  isMe ? "ml-auto flex-row-reverse" : ""
                                }`}
                              >
                                {!isGrouped ? (
                                  <UserAvatar
                                    displayName={displayName}
                                    avatarUrl={avatarUrl}
                                    size="xs"
                                    className="shrink-0 mt-0.5"
                                  />
                                ) : (
                                  <div className="w-7 shrink-0" />
                                )}
                                <div
                                  className={`group flex flex-col ${
                                    isMe ? "items-end" : "items-start"
                                  }`}
                                >
                                  {!isGrouped && (
                                    <div className="mb-0.5 flex items-baseline gap-1.5 px-1">
                                      <span className="text-[11px] font-semibold text-foreground">
                                        {displayName}
                                      </span>
                                      {timeStr && (
                                        <span className="text-[9px] text-muted-foreground">
                                          {timeStr}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <div
                                    className={`rounded-2xl px-3 py-1.5 text-xs break-words ${
                                      isMe
                                        ? "bg-gradient-to-r from-amber-500 to-gold text-[#0B0D10] font-medium"
                                        : "bg-white/10 text-foreground border border-white/10"
                                    }`}
                                  >
                                    {msg.body}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Quick Emojis & Input */}
                      <div className="mt-2 pt-2 border-t border-white/10 space-y-2 shrink-0">
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
                          {["👍", "👏", "🤝", "🔥", "GG", "Good luck!"].map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                setChatInput(emoji);
                                void sendChat();
                              }}
                              className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-xs text-foreground hover:bg-gold/20 hover:border-gold/40 transition-colors shrink-0"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void sendChat();
                          }}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value.slice(0, 200))}
                            placeholder="Type a message..."
                            maxLength={200}
                            className="flex-1 bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-gold/50"
                          />
                          <button
                            type="submit"
                            disabled={!chatInput.trim()}
                            className="p-2 rounded-xl bg-gold text-[#0B0D10] font-bold disabled:opacity-40"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: MOVES */}
                  {mobileSheetTab === "moves" && (
                    <div className="flex-1 flex flex-col min-h-0 space-y-2">
                      <div className="flex items-center justify-between border-b border-white/10 pb-1.5 shrink-0 text-xs">
                        <span className="font-semibold text-gold truncate">
                          {currentOpening?.name ?? "Standard Opening"}
                        </span>
                        <button
                          onClick={copyPGN}
                          className="text-[10px] text-muted-foreground hover:text-gold border border-white/10 px-2 py-0.5 rounded"
                        >
                          <Copy className="h-3 w-3 inline mr-1" /> PGN
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-2.5 rounded-xl bg-black/40 border border-white/5 scrollbar-thin">
                        {moves.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground/60 text-xs italic">
                            No moves played yet.
                          </div>
                        ) : (
                          <div className="grid grid-cols-[28px_1fr_1fr] gap-x-2 gap-y-1 text-xs">
                            {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                              const wPly = i * 2 + 1;
                              const bPly = i * 2 + 2;
                              const wMove = moves[i * 2];
                              const bMove = moves[i * 2 + 1];
                              const isWActive = viewPly === wPly;
                              const isBActive = viewPly === bPly;
                              return (
                                <div className="contents" key={i}>
                                  <div className="text-muted-foreground/60 py-1 font-mono text-[11px] font-semibold">
                                    {i + 1}.
                                  </div>
                                  <button
                                    onClick={() => setViewPly(wPly)}
                                    className={`text-left px-2 py-1 rounded font-mono font-medium transition-all ${
                                      isWActive
                                        ? "bg-gold text-[#0B0D10] font-bold shadow-sm"
                                        : "bg-white/5 text-foreground hover:bg-white/15"
                                    }`}
                                  >
                                    {wMove?.san ?? ""}
                                  </button>
                                  <button
                                    onClick={() => bMove && setViewPly(bPly)}
                                    disabled={!bMove}
                                    className={`text-left px-2 py-1 rounded font-mono font-medium transition-all ${
                                      isBActive
                                        ? "bg-gold text-[#0B0D10] font-bold shadow-sm"
                                        : bMove
                                          ? "bg-white/5 text-foreground hover:bg-white/15"
                                          : "opacity-0 cursor-default"
                                    }`}
                                  >
                                    {bMove?.san ?? ""}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Responsive Grid: Left Column (Player Cards + Board), Right Column (History, Tabs, Actions) */}
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-12 gap-4 items-center justify-center max-h-full overflow-hidden h-full">
        {/* =================================================== */}
        {/* LEFT COLUMN: PLAYER CARDS & CHESS BOARD             */}
        {/* =================================================== */}
        <div className="lg:col-span-7 xl:col-span-7 flex flex-col items-center justify-center w-full h-full">
          {/* Top: Opponent Profile Card */}
          <div className="w-full max-w-[480px] xl:max-w-[510px] mb-1.5">
            <PlayerCard
              name={topPlayer.name}
              rating={topPlayer.rating}
              clock={clock}
              color={topPlayer.color}
              showClock={!clock.untimed}
              p_active={topPlayer.p_active}
              p_exp={topPlayer.p_exp}
              avatar={topPlayer.avatar}
              active={!isWaiting && activeTurn === topPlayer.color}
              board={liveBoard}
              player={topPlayer.color}
              friendUserId={topPlayer.isMe ? null : topPlayer.id}
              moveDeadlineAt={live.snapshot?.moveDeadlineAt}
              moveDeadlineSeconds={live.snapshot?.moveDeadlineSeconds}
              isGameActive={game.status === "active"}
            />
          </div>

          <div className="w-full max-w-[480px] xl:max-w-[510px] mx-auto relative flex flex-col items-center justify-center">
            <InteractiveBoard
              board={displayBoard}
              orientation={orientation}
              selected={selected}
              targets={targets}
              lastMove={lastMove}
              checkSquare={checkSquare}
              onSquare={handleSquare}
              disabled={!isMyTurn || !!promotion || submittingRef.current}
              endState={
                viewPly !== null
                  ? null
                  : (endState as { result: "white" | "black" | "draw"; reason: string } | null)
              }
            />

            {/* Promotion Picker */}
            {promotion && (
              <div className="mt-2 flex justify-center z-30">
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
          </div>

          {/* Bottom: Current Player Profile Card */}
          <div className="w-full max-w-[480px] xl:max-w-[510px] mt-1.5">
            <PlayerCard
              name={bottomPlayer.name}
              rating={bottomPlayer.rating}
              clock={clock}
              color={bottomPlayer.color}
              showClock={!clock.untimed}
              p_active={bottomPlayer.p_active}
              p_exp={bottomPlayer.p_exp}
              avatar={bottomPlayer.avatar}
              active={!isWaiting && activeTurn === bottomPlayer.color}
              board={liveBoard}
              player={bottomPlayer.color}
              me={bottomPlayer.isMe}
              friendUserId={bottomPlayer.isMe ? null : bottomPlayer.id}
            />
          </div>
        </div>

        {/* =================================================== */}
        {/* RIGHT COLUMN: TAB HEADER, MAIN PANEL & TOOLS BOX   */}
        {/* =================================================== */}
        <div className="lg:col-span-5 xl:col-span-5 flex flex-col justify-between space-y-2 h-full">
          {/* Live connection state — a single line above the panel, so it
              is always visible without taking space from the board. */}
          <div className="flex items-center justify-end flex-shrink-0 px-1">
            <ConnectionIndicator connection={live.connection} onRejoin={() => void live.rejoin()} />
          </div>

          {/* Top Tab Navigation Bar (Boxes 2, 3, 4, 5, 6) */}
          <div className="grid grid-cols-5 gap-1 p-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl flex-shrink-0">
            {(["moves", "chat", "info", "spectators", "opening"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold capitalize transition-all flex items-center justify-center gap-1 ${
                  activeTab === t
                    ? "bg-gold text-[#0B0D10] shadow-sm shadow-gold/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {t === "moves" ? (
                  <History className="h-3 w-3" />
                ) : t === "chat" ? (
                  <MessageSquare className="h-3 w-3" />
                ) : t === "info" ? (
                  <Info className="h-3 w-3" />
                ) : t === "spectators" ? (
                  <Users className="h-3 w-3" />
                ) : (
                  <BookOpen className="h-3 w-3" />
                )}
                <span className="truncate">
                  {t === "moves"
                    ? "Moves"
                    : t === "info"
                      ? "Info"
                      : t === "spectators"
                        ? "Spec"
                        : t === "opening"
                          ? "Book"
                          : "Chat"}
                </span>
              </button>
            ))}
          </div>

          {/* Main Content Display Box (Box 1) - Fixed Height */}
          <Card className="p-3 bg-black/40 backdrop-blur-md border-white/10 flex-1 min-h-[320px] max-h-[440px] flex flex-col overflow-hidden justify-between">
            {/* Active Tab Content */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {activeTab === "moves" && (
                <div className="flex flex-col h-full space-y-2">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5 flex-shrink-0">
                    <span className="font-display text-xs font-semibold tracking-wide text-gold flex items-center gap-1">
                      <History className="h-3 w-3" /> {currentOpening?.name ?? "Standard Opening"}
                    </span>
                    <button
                      onClick={copyPGN}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-gold transition-colors px-1.5 py-0.5 rounded border border-white/10 hover:border-gold/30"
                      title="Export / Copy PGN"
                    >
                      <Copy className="h-3 w-3" /> PGN
                    </button>
                  </div>

                  {/* Inner Dark Styled Move Box (Reference Image 2 style) */}
                  <div
                    ref={movesScrollRef}
                    className="flex-1 rounded-xl bg-black/30 border border-white/5 p-2.5 overflow-y-auto space-y-1 scrollbar-thin"
                  >
                    {moves.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground/60 text-xs italic">
                        No moves played yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-[28px_1fr_1fr] gap-x-2 gap-y-1 text-xs">
                        {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                          const wPly = i * 2 + 1;
                          const bPly = i * 2 + 2;
                          const wMove = moves[i * 2];
                          const bMove = moves[i * 2 + 1];
                          const isWActive = viewPly === wPly;
                          const isBActive = viewPly === bPly;
                          const wTime = formatMoveDuration(wMove?.took_ms);
                          const bTime = formatMoveDuration(bMove?.took_ms);
                          return (
                            <div className="contents" key={i}>
                              <div className="text-muted-foreground/60 py-1 font-mono text-[11px] font-semibold">
                                {i + 1}.
                              </div>
                              <button
                                onClick={() => setViewPly(wPly)}
                                className={`text-left px-2 py-1 rounded font-mono font-medium transition-all flex items-center justify-between gap-1 ${
                                  isWActive
                                    ? "bg-gold text-[#0B0D10] font-bold shadow-sm shadow-gold/30"
                                    : "bg-white/5 text-foreground hover:bg-white/15"
                                }`}
                              >
                                <span className="truncate">{wMove?.san ?? ""}</span>
                                {wTime ? (
                                  <span
                                    className={`text-[10px] font-normal font-mono shrink-0 ${
                                      isWActive ? "text-[#0B0D10]/80" : "text-muted-foreground/50"
                                    }`}
                                  >
                                    {wTime}
                                  </span>
                                ) : null}
                              </button>
                              <button
                                onClick={() => bMove && setViewPly(bPly)}
                                disabled={!bMove}
                                className={`text-left px-2 py-1 rounded font-mono font-medium transition-all flex items-center justify-between gap-1 ${
                                  isBActive
                                    ? "bg-gold text-[#0B0D10] font-bold shadow-sm shadow-gold/30"
                                    : bMove
                                      ? "bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/15"
                                      : "opacity-0 cursor-default"
                                }`}
                              >
                                <span className="truncate">{bMove?.san ?? ""}</span>
                                {bTime ? (
                                  <span
                                    className={`text-[10px] font-normal font-mono shrink-0 ${
                                      isBActive ? "text-[#0B0D10]/80" : "text-muted-foreground/50"
                                    }`}
                                  >
                                    {bTime}
                                  </span>
                                ) : null}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "chat" && (
                <div className="flex flex-col h-full space-y-2">
                  <div className="font-display text-xs font-semibold tracking-wide text-gold border-b border-white/10 pb-1.5 flex-shrink-0 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Live Game Chat
                    </span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {chat.length} messages
                    </span>
                  </div>

                  <div
                    ref={chatScrollRef}
                    className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs scrollbar-thin"
                  >
                    {chat.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground/60 text-xs italic">
                        No chat messages yet. Say hello!
                      </div>
                    ) : (
                      chat.map((msg, idx) => {
                        const isMe = msg.user_id === user?.id;
                        const profile =
                          msg.user_id === whiteId
                            ? whiteProfile
                            : msg.user_id === blackId
                              ? blackProfile
                              : null;
                        const displayName = getSenderDisplayName(
                          profile ?? { username: msg.username },
                        );
                        const avatarUrl = profile?.avatar_url;
                        const isGrouped =
                          idx > 0 &&
                          chat[idx - 1].user_id === msg.user_id &&
                          new Date(msg.created_at).getTime() -
                            new Date(chat[idx - 1].created_at).getTime() <
                            300000;
                        const timeStr = msg.created_at
                          ? new Date(msg.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "";
                        return (
                          <div
                            key={msg.id}
                            className={`flex max-w-[85%] gap-2 ${
                              isMe ? "ml-auto flex-row-reverse" : ""
                            }`}
                          >
                            {!isGrouped ? (
                              <UserAvatar
                                displayName={displayName}
                                avatarUrl={avatarUrl}
                                size="xs"
                                className="shrink-0 mt-0.5"
                              />
                            ) : (
                              <div className="w-7 shrink-0" />
                            )}
                            <div
                              className={`group flex flex-col ${
                                isMe ? "items-end" : "items-start"
                              }`}
                            >
                              {!isGrouped && (
                                <div className="mb-0.5 flex items-baseline gap-1.5 px-1">
                                  <span className="text-[11px] font-semibold text-foreground">
                                    {displayName}
                                  </span>
                                  {timeStr && (
                                    <span className="text-[9px] text-muted-foreground">
                                      {timeStr}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div
                                className={`rounded-xl px-3 py-1.5 max-w-[85%] break-words ${
                                  isMe
                                    ? "bg-gold text-[#0B0D10] font-medium"
                                    : "bg-white/10 text-foreground border border-white/10"
                                }`}
                              >
                                {msg.body}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Chat Input & Quick Emojis */}
                  <div className="space-y-1.5 pt-1.5 border-t border-white/10 flex-shrink-0">
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
                      {["👍", "👏", "🤝", "🔥", "GG", "Good luck!"].map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            setChatInput(emoji);
                            void sendChat();
                          }}
                          className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[11px] text-foreground hover:bg-gold/20 hover:border-gold/40 transition-colors shrink-0"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void sendChat();
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value.slice(0, 200))}
                        placeholder="Type a message..."
                        maxLength={200}
                        className="flex-1 bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-gold/50"
                      />
                      <button
                        type="submit"
                        disabled={!chatInput.trim()}
                        className="p-1.5 rounded-lg bg-gold text-[#0B0D10] font-bold disabled:opacity-40"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {activeTab === "spectators" && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-gold font-semibold text-sm">
                    <Eye className="h-4 w-4" /> Live Spectators
                  </div>
                  {myColor && (
                    <SpectatorVisibilityControl
                      scope="game"
                      gameId={id}
                      value={myVisibility}
                      onChange={setMyVisibility}
                    />
                  )}
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Visibility Mode</span>
                      <span className="font-semibold text-emerald-400 capitalize">
                        {myVisibility}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Spectator Access</span>
                      <span className="text-foreground font-medium">Read Only</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "info" && (
                <div className="space-y-1.5 text-xs">
                  <div className="font-semibold text-gold text-sm border-b border-white/10 pb-1">
                    Match Details
                  </div>
                  <div className="flex justify-between border-b border-white/5 py-1">
                    <span className="text-muted-foreground">Game ID</span>
                    <span className="font-mono text-foreground font-semibold">
                      {id.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 py-1">
                    <span className="text-muted-foreground">Time Control</span>
                    <span className="text-foreground">{game.time_control}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 py-1">
                    <span className="text-muted-foreground">Rated Match</span>
                    <span className="text-foreground">{game.is_rated ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 py-1">
                    <span className="text-muted-foreground">Total Plies</span>
                    <span className="text-foreground">{game.moves_count}</span>
                  </div>
                </div>
              )}

              {activeTab === "opening" && (
                <div className="space-y-2 text-xs">
                  <div className="font-semibold text-gold text-sm border-b border-white/10 pb-1">
                    Chess Opening Book
                  </div>
                  <div className="font-semibold text-foreground text-sm">
                    {currentOpening?.name ?? "Standard Opening"}
                  </div>
                  {currentOpening?.eco && (
                    <div className="text-muted-foreground">
                      ECO Code:{" "}
                      <span className="font-mono text-gold font-semibold">
                        {currentOpening.eco}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Bottom Card: Live Actions, Replay Navigation & Board Tools (Box 7) */}
          <Card className="p-2.5 bg-black/40 backdrop-blur-md border-white/10 space-y-2">
            {/* Live Game Action Buttons */}
            {!isWaiting && !isFinished && myColor && (
              <div className="flex justify-center gap-1.5 pb-1.5 border-b border-white/10">
                <GhostButton
                  onClick={handleDrawClick}
                  disabled={drawFromMe || game.status !== "active"}
                  className="text-xs h-7 px-2 flex-1 border-white/10"
                >
                  <Handshake className="h-3.5 w-3.5 mr-1" />
                  {drawFromMe ? "Draw Offered" : "Offer Draw"}
                </GhostButton>
                <GoldButton
                  onClick={handleResignClick}
                  className="bg-destructive hover:bg-destructive/90 text-foreground text-xs h-7 px-2 flex-1"
                >
                  <Flag className="h-3.5 w-3.5 mr-1" /> Resign
                </GoldButton>
              </div>
            )}

            {drawFromOpponent && !isFinished && (
              <div className="rounded-lg border border-gold/40 bg-gold/10 p-1.5 text-xs text-center space-y-1">
                <div className="flex items-center justify-center gap-1 font-display text-gold">
                  <Handshake className="h-3.5 w-3.5" /> Draw Offered
                </div>
                <div className="flex justify-center gap-2 pt-0.5">
                  <GoldButton onClick={executeDrawOffer} className="h-6 px-2.5 text-xs">
                    Accept
                  </GoldButton>
                  <GhostButton
                    onClick={executeDeclineDraw}
                    className="h-6 px-2.5 text-xs border-white/10"
                  >
                    Decline
                  </GhostButton>
                </div>
              </div>
            )}

            {isHostWaiting && (
              <div className="space-y-1 pb-1.5 border-b border-white/10 text-center">
                <div className="text-[10px] uppercase tracking-wider text-gold/80 font-semibold">
                  Awaiting Opponent
                </div>
                <div className="flex gap-1">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 rounded border border-gold/30 bg-white/[0.02] px-2 py-0.5 font-mono text-[10px]"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl);
                      toast.success("Link copied!");
                    }}
                    className="grid h-6 w-6 place-items-center rounded gradient-gold text-[#0B0D10]"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {canJoin && (
              <div className="pb-1.5 border-b border-white/10 text-center">
                <GoldButton
                  onClick={joinAsOpponent}
                  disabled={joining}
                  className="w-full h-7 text-xs"
                >
                  <Swords className="h-3.5 w-3.5 mr-1" /> Enter Arena
                </GoldButton>
              </div>
            )}

            {isFinished && (
              <div className="py-1 border-b border-white/10 text-center space-y-1">
                <div className="font-display text-xs text-gradient-gold">
                  {resultSentence(normalizeResult(game.result), game.end_reason)}
                </div>
              </div>
            )}

            {/* Replay Controls (Moved into Box 7) */}
            <div className="flex items-center justify-between gap-1">
              <button
                onClick={() => setViewPly(0)}
                disabled={moves.length === 0}
                className="flex-1 py-1 rounded bg-white/5 hover:bg-white/15 text-xs font-mono disabled:opacity-40 transition-colors"
                title="First Move"
              >
                ⏮
              </button>
              <button
                onClick={() => setViewPly((prev) => Math.max(0, (prev ?? moves.length) - 1))}
                disabled={moves.length === 0}
                className="flex-1 py-1 rounded bg-white/5 hover:bg-white/15 text-xs font-mono disabled:opacity-40 transition-colors"
                title="Previous Move"
              >
                ◀
              </button>
              <button
                onClick={() => setViewPly(null)}
                className={`flex-1 py-1 rounded text-xs font-bold transition-all ${
                  viewPly === null
                    ? "bg-gold text-[#0B0D10] shadow-sm shadow-gold/30"
                    : "bg-white/10 text-gold hover:bg-white/20"
                }`}
                title="Live Position"
              >
                Live
              </button>
              <button
                onClick={() =>
                  setViewPly((prev) =>
                    prev === null ? null : prev + 1 >= moves.length ? null : prev + 1,
                  )
                }
                disabled={moves.length === 0 || viewPly === null}
                className="flex-1 py-1 rounded bg-white/5 hover:bg-white/15 text-xs font-mono disabled:opacity-40 transition-colors"
                title="Next Move"
              >
                ▶
              </button>
              <button
                onClick={() => setViewPly(null)}
                disabled={moves.length === 0}
                className="flex-1 py-1 rounded bg-white/5 hover:bg-white/15 text-xs font-mono disabled:opacity-40 transition-colors"
                title="Last Move"
              >
                ⏭
              </button>
            </div>

            {/* Quick Board Tools */}
            <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-white/10 text-xs">
              <button
                onClick={() => setFlipped((f) => !f)}
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-white/10 text-muted-foreground hover:text-gold hover:border-gold/40 transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> Flip
              </button>
              <button
                onClick={downloadPGN}
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-white/10 text-muted-foreground hover:text-gold hover:border-gold/40 transition-colors"
              >
                <Download className="h-3 w-3" /> PGN
              </button>
              <Link to="/analysis" search={{ gameId: id }} className="flex-1">
                <button className="w-full flex items-center justify-center gap-1 py-1 rounded border border-gold/30 bg-gold/10 text-gold hover:bg-gold/20 transition-colors">
                  <LineChart className="h-3 w-3" /> Analyze
                </button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function PlayerCard({
  userId,
  name,
  rating,
  clock,
  color,
  showClock,
  p_active,
  p_exp,
  avatar,
  active,
  me,
  board,
  player,
  friendUserId,
  moveDeadlineAt,
  moveDeadlineSeconds,
  isGameActive,
}: {
  userId?: string | null;
  name: string;
  rating: number | null;
  clock: ClockState;
  color: "w" | "b";
  showClock: boolean;
  p_active?: boolean;
  p_exp?: string | null;
  avatar?: string | null;
  active?: boolean;
  me?: boolean;
  board: BoardCell[][];
  player: "w" | "b";
  friendUserId?: string | null;
  moveDeadlineAt?: number | null;
  moveDeadlineSeconds?: number | null;
  isGameActive?: boolean;
}) {
  const { settings } = useGameSettings();
  const display = useChessClock(clock, { showTenths: settings.show_tenths });
  const currentMs = color === "w" ? display.whiteMs : display.blackMs;
  useClockAudio(Math.ceil(currentMs / 1000), !!active && !!me && showClock);

  return (
    <div className="py-1.5 px-1 transition-all duration-300 w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <UserAvatar userId={userId ?? friendUserId} avatarUrl={avatar} displayName={name} size="md" />
          <div className="min-w-0 flex flex-col justify-center gap-0.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap text-sm font-semibold text-foreground">
              <SeasonShield sp={rating ?? 0} size="xs" variant="icon" />
              <span className="truncate">{name}</span>
              <SeasonShield sp={rating ?? 0} size="xs" variant="chip" tierOnly />
              <PremiumBadge premiumActive={p_active} premiumExpiresAt={p_exp} />
              {friendUserId && <FriendButton targetUserId={friendUserId} targetName={name} />}
              <span className="text-xs font-normal text-muted-foreground font-mono">
                {rating ? `${rating} SP` : "—"}
              </span>
              {me && (
                <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold border border-gold/30">
                  You
                </span>
              )}
            </div>
            {/* Captured Pieces ALWAYS on its own line below player/opponent name & rating */}
            <div className="flex items-center mt-0.5">
              <CapturedPieces board={board} player={player} className="flex items-center" />
            </div>
          </div>
        </div>

        {/* Digital Clock Readout & Per-Move Response Deadline */}
        {showClock && (
          <div className="flex items-center gap-2 shrink-0">
            {active && isGameActive && (
              <MoveDeadlineIndicator
                moveDeadlineAt={moveDeadlineAt ?? null}
                moveDeadlineSeconds={moveDeadlineSeconds ?? null}
                isActiveTurn={!!active}
                isGameActive={!!isGameActive}
              />
            )}
            <div
              className={`rounded-lg px-3 py-1 font-sans text-sm font-bold tracking-wide tabular-nums transition-all flex-shrink-0 ${
                active
                  ? "bg-gold text-[#0B0D10] shadow-md shadow-gold/30 scale-105"
                  : "bg-white/10 text-foreground/90 border border-white/15"
              }`}
            >
              <ClockTime ms={currentMs} active={!!active} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
