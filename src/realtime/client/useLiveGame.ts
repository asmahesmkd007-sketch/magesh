// =====================================================================
// useLiveGame — the board's connection to the authoritative server
// ---------------------------------------------------------------------
// Replaces the three postgres_changes subscriptions (games UPDATE,
// game_moves INSERT, game_chat INSERT) plus the initial Supabase reads
// with one socket room.
//
// What it guarantees to the component:
//
//   * `snapshot` is always a complete, self-consistent view — it is
//     never partially applied, so the board can render straight from it;
//   * an optimistic move shows instantly and is reconciled by the
//     server's own broadcast, or reverted by its refusal;
//   * a reconnect (tab wake, network change, server redeploy) re-joins
//     the room and replaces local state with a fresh snapshot — the same
//     code path as the first load, so there is no separate "recovery"
//     mode to get wrong;
//   * a detected ply gap triggers a resync rather than silent divergence.
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

import type {
  ChatPayload,
  ClockSnapshot,
  GameStateSnapshot,
  MovePayload,
  Promotion,
} from "../protocol";
import { ensureConnected, getSocket, request, syncClock } from "./socket";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

/** A move applied locally but not yet confirmed by the server. */
export type PendingMove = {
  fen: string;
  from: string;
  to: string;
  /** Server-aligned instant the move was played, for the clock handover. */
  at: number;
  ply: number;
};

export type LiveGameApi = {
  snapshot: GameStateSnapshot | null;
  pending: PendingMove | null;
  connection: ConnectionState;
  /** True once a snapshot has arrived; the board can render. */
  ready: boolean;
  error: string | null;
  /** Position with the optimistic move applied, if any. */
  activeFen: string | null;
  move: (from: string, to: string, promotion?: Promotion) => Promise<void>;
  resign: () => Promise<void>;
  offerOrAcceptDraw: () => Promise<"offered" | "accepted" | "declined">;
  declineDraw: () => Promise<void>;
  sendChat: (body: string) => Promise<void>;
  resync: () => Promise<void>;
  rematchOffer: { offeredBy: string } | null;
  rematchNewGameId: string | null;
  offerRematch: () => Promise<{ status: "offered" | "accepted"; newGameId?: string }>;
  declineRematch: () => void;
};

export function useLiveGame(gameId: string | null): LiveGameApi {
  const [snapshot, setSnapshot] = useState<GameStateSnapshot | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);

  const [rematchOffer, setRematchOffer] = useState<{ offeredBy: string } | null>(null);
  const [rematchNewGameId, setRematchNewGameId] = useState<string | null>(null);

  const snapshotRef = useRef<GameStateSnapshot | null>(null);
  const pendingRef = useRef<PendingMove | null>(null);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // ── Join / rejoin ───────────────────────────────────────────────────
  const join = useCallback(async (id: string) => {
    try {
      const state = await request<"game:join", GameStateSnapshot>("game:join", { gameId: id });
      setSnapshot(state);
      // The snapshot supersedes any optimistic move: it either contains
      // it (accepted) or it doesn't (dropped while we were away).
      setPending(null);
      setRematchOffer(null);
      setRematchNewGameId(null);
      setConnection("live");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the game");
      setConnection("offline");
    }
  }, []);

  useEffect(() => {
    if (!gameId) return;
    setSnapshot(null);
    setPending(null);
    setRematchOffer(null);
    setRematchNewGameId(null);
    const socket = ensureConnected();
    let alive = true;

    const onConnect = () => {
      if (!alive) return;
      setConnection("live");
      // Re-join on every connect, including reconnects: room membership
      // does not survive a new socket id.
      void join(gameId);
      void syncClock();
    };
    const onDisconnect = () => {
      if (alive) setConnection("reconnecting");
    };
    const onError = () => {
      if (alive) setConnection("reconnecting");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);
    // Already connected (second board in the same tab): join immediately.
    if (socket.connected) onConnect();

    return () => {
      alive = false;
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
      socket.emit("game:leave", { gameId });
    };
  }, [gameId, join]);

  // ── Server facts ────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameId) return;
    const socket = getSocket();

    const applyMove = (payload: { gameId: string; move: MovePayload; clock: ClockSnapshot }) => {
      if (payload.gameId !== gameId) return;
      setSnapshot((prev) => {
        if (!prev) return prev;
        // Already applied (our own move echoed back, or a duplicate).
        if (prev.moves.some((m) => m.ply === payload.move.ply)) return prev;
        // A gap means we missed something; ask for the truth instead of
        // stitching an inconsistent move list together.
        if (payload.move.ply !== prev.moves.length + 1) {
          void request<"game:resync", GameStateSnapshot>("game:resync", { gameId })
            .then(setSnapshot)
            .catch(() => {});
          return prev;
        }
        return {
          ...prev,
          moves: [...prev.moves, payload.move],
          fen: payload.move.fenAfter,
          turn: payload.move.fenAfter.split(" ")[1] === "w" ? "w" : "b",
          clock: payload.clock,
          drawOfferedBy: null,
        };
      });
      // Our optimistic copy is now redundant once the real one lands.
      if (pendingRef.current && pendingRef.current.ply <= payload.move.ply) setPending(null);
    };

    const applyEnd = (payload: Parameters<Parameters<typeof socket.on<"game:end">>[1]>[0]) => {
      if (payload.gameId !== gameId) return;
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              status: "finished",
              result: payload.terminal.result,
              endReason: payload.terminal.endReason,
              winnerId: payload.terminal.winnerId,
              clock: payload.clock,
            }
          : prev,
      );
      setPending(null);
    };

    const applyChat = (payload: { gameId: string; message: ChatPayload }) => {
      if (payload.gameId !== gameId) return;
      setSnapshot((prev) =>
        prev && !prev.chat.some((c) => c.id === payload.message.id)
          ? { ...prev, chat: [...prev.chat, payload.message] }
          : prev,
      );
    };

    const applyDrawOffer = (payload: { gameId: string; offeredBy: string | null }) => {
      if (payload.gameId !== gameId) return;
      setSnapshot((prev) => (prev ? { ...prev, drawOfferedBy: payload.offeredBy } : prev));
    };

    const applyRejection = (payload: {
      gameId: string;
      message: string;
      snapshot: GameStateSnapshot | null;
    }) => {
      if (payload.gameId !== gameId) return;
      // Snap back to the server's truth and surface why.
      setPending(null);
      if (payload.snapshot) setSnapshot(payload.snapshot);
      setError(payload.message);
    };

    const applyRematchOffer = (payload: { gameId: string; offeredBy: string }) => {
      if (payload.gameId !== gameId) return;
      setRematchOffer({ offeredBy: payload.offeredBy });
    };

    const applyRematchAccepted = (payload: { gameId: string; newGameId: string }) => {
      if (payload.gameId !== gameId) return;
      setRematchOffer(null);
      setRematchNewGameId(payload.newGameId);
    };

    const applyRematchDeclined = (payload: { gameId: string }) => {
      if (payload.gameId !== gameId) return;
      setRematchOffer(null);
    };

    socket.on("game:move", applyMove);
    socket.on("game:end", applyEnd);
    socket.on("game:chat", applyChat);
    socket.on("game:draw-offer", applyDrawOffer);
    socket.on("game:rejected", applyRejection);
    socket.on("game:rematch-offer", applyRematchOffer);
    socket.on("game:rematch-accepted", applyRematchAccepted);
    socket.on("game:rematch-declined", applyRematchDeclined);
    return () => {
      socket.off("game:move", applyMove);
      socket.off("game:end", applyEnd);
      socket.off("game:chat", applyChat);
      socket.off("game:draw-offer", applyDrawOffer);
      socket.off("game:rejected", applyRejection);
      socket.off("game:rematch-offer", applyRematchOffer);
      socket.off("game:rematch-accepted", applyRematchAccepted);
      socket.off("game:rematch-declined", applyRematchDeclined);
    };
  }, [gameId]);

  // ── Actions ─────────────────────────────────────────────────────────
  const move = useCallback(
    async (from: string, to: string, promotion?: Promotion) => {
      const current = snapshotRef.current;
      if (!gameId || !current) return;

      // Apply locally first so the piece lands in this frame. The move
      // was already validated as legal by the caller's move list, so
      // this cannot fail; the server still re-validates independently.
      const chess = new Chess(current.fen);
      try {
        chess.move({ from, to, promotion });
      } catch {
        return;
      }
      const optimistic: PendingMove = {
        fen: chess.fen(),
        from,
        to,
        at: Date.now(),
        ply: current.moves.length + 1,
      };
      setPending(optimistic);
      setError(null);

      try {
        await request<"game:move", { move: MovePayload; clock: ClockSnapshot }>("game:move", {
          gameId,
          from,
          to,
          promotion,
        });
        // The authoritative broadcast lands in the room listener above and
        // clears `pending`; nothing else to do here.
      } catch (err) {
        setPending(null);
        setError(err instanceof Error ? err.message : "Move failed");
        throw err;
      }
    },
    [gameId],
  );

  const resign = useCallback(async () => {
    if (!gameId) return;
    await request("game:resign", { gameId });
  }, [gameId]);

  const offerOrAcceptDraw = useCallback(async () => {
    if (!gameId) return "declined" as const;
    const res = await request<"game:draw", { state: "offered" | "accepted" | "declined" }>(
      "game:draw",
      { gameId },
    );
    return res.state;
  }, [gameId]);

  const declineDraw = useCallback(async () => {
    if (!gameId) return;
    await request("game:draw-decline", { gameId });
    setSnapshot((prev) => (prev ? { ...prev, drawOfferedBy: null } : prev));
  }, [gameId]);

  const sendChat = useCallback(
    async (body: string) => {
      if (!gameId || !body.trim()) return;
      await request("game:chat", { gameId, body });
    },
    [gameId],
  );

  const offerRematch = useCallback(async () => {
    if (!gameId) return { status: "offered" as const };
    const res = await request<
      "game:rematch-offer",
      { status: "offered" | "accepted"; newGameId?: string }
    >("game:rematch-offer", { gameId });
    if (res.status === "accepted" && res.newGameId) {
      setRematchNewGameId(res.newGameId);
    }
    return res;
  }, [gameId]);

  const declineRematch = useCallback(() => {
    if (!gameId) return;
    const socket = getSocket();
    socket.emit("game:rematch-decline", { gameId });
    setRematchOffer(null);
  }, [gameId]);

  const resync = useCallback(async () => {
    if (!gameId) return;
    const state = await request<"game:resync", GameStateSnapshot>("game:resync", { gameId });
    setSnapshot(state);
    setPending(null);
  }, [gameId]);

  const activeFen = useMemo(
    () => pending?.fen ?? snapshot?.fen ?? null,
    [pending?.fen, snapshot?.fen],
  );

  return {
    snapshot,
    pending,
    connection,
    ready: !!snapshot,
    error,
    activeFen,
    move,
    resign,
    offerOrAcceptDraw,
    declineDraw,
    sendChat,
    resync,
    rematchOffer,
    rematchNewGameId,
    offerRematch,
    declineRematch,
  };
}
