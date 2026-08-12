// =====================================================================
// SOCKET.IO SERVER — the live gameplay transport
// ---------------------------------------------------------------------
// Attaches to the same http.Server that serves the app (see
// server/index.mjs), on its own path, so there is one process, one
// port, one origin and no CORS.
//
// Authentication is unchanged: the handshake carries the same Supabase
// access token an HTTP request would, verified through the same cached
// verifier the move server-function uses.
//
// Authority model:
//   * a client emit is a request, answered by an ack;
//   * the resulting *fact* is broadcast to the game room;
//   * the emitter gets both (the ack for its own optimistic
//     reconciliation, the broadcast because it is in the room).
// =====================================================================
import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";

import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
// The framework-free verifier — importing the middleware module instead
// would drag the whole TanStack Start server core into this bundle.
import { resolveUserId } from "@/lib/auth/verifyToken.server";
import {
  MAX_CHAT_LENGTH,
  SOCKET_PATH,
  rooms,
  type ChatPayload,
  type ClientToServerEvents,
  type GameStateSnapshot,
  type RejectCode,
  type ServerToClientEvents,
} from "../protocol";
import type { LiveGame } from "./LiveGame";
import {
  acquire,
  armFlagTimer,
  attach,
  detach,
  isOnline,
  peek,
  setTerminalListener,
  startRegistry,
} from "./registry";
import { finalize } from "./persistence";
import {
  getPresenceForUserIds,
  onSocketConnected,
  onSocketDisconnected,
} from "./presenceTracker";

type SocketData = { userId: string | null };
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

/**
 * Spectator broadcast delay, in seconds, by time class. Live boards are
 * private to their players; everyone else watches a held-back feed, which
 * is what stops a spectator screen being used as an engine feed for the
 * player. This preserves the behaviour the database view previously
 * enforced, now applied at the transport.
 */
const SPECTATOR_DELAY_SECONDS: Record<string, number> = {
  bullet: 15,
  blitz: 20,
  rapid: 30,
  classical: 60,
};

function spectatorDelayMs(game: LiveGame): number {
  if (game.status === "finished") return 0; // nothing left to leak
  const seconds = SPECTATOR_DELAY_SECONDS[inferTimeClass(game)] ?? 20;
  return seconds * 1000;
}

function inferTimeClass(game: LiveGame): string {
  const total = game.initialSeconds;
  if (total <= 120) return "bullet";
  if (total <= 600) return "blitz";
  if (total <= 1800) return "rapid";
  return "classical";
}

function fail(code: RejectCode, message: string) {
  return { ok: false as const, code, message };
}

let io: AppServer | null = null;
const rematchOffers = new Map<string, string>();
const acceptedRematches = new Map<string, { newGameId: string; expiresAt: number }>();

function snapshotFor(game: LiveGame, viewerId: string | null): GameStateSnapshot {
  const isPlayer = !!game.seatOf(viewerId);
  const delayMs = isPlayer ? 0 : spectatorDelayMs(game);
  const cutoff = Date.now() - delayMs;
  // A spectator's snapshot stops at the last move old enough to show.
  const moves = delayMs === 0 ? game.moves : game.moves.filter((m) => m.at <= cutoff);

  const offeredBy = rematchOffers.get(game.gameId);
  const accepted = acceptedRematches.get(game.gameId);
  const validAccepted = accepted && accepted.expiresAt > Date.now() ? accepted.newGameId : null;

  return {
    gameId: game.gameId,
    status: game.status,
    result: game.result,
    endReason: game.endReason,
    winnerId: game.winnerId,
    // Spectators see the position as of their last visible move, so the
    // board and the move list can never disagree.
    fen:
      moves.length === game.moves.length
        ? game.fen
        : (moves[moves.length - 1]?.fenAfter ?? game.fen),
    turn: game.turn,
    moves,
    clock: game.clockSnapshot(),
    white: game.white,
    black: game.black,
    drawOfferedBy: game.drawOfferedBy,
    chat: game.chat,
    isRated: game.isRated,
    timeControl: game.timeControl,
    moveDeadlineAt: game.moveDeadlineAt,
    moveDeadlineSeconds: game.getMoveDeadlineSeconds(),
    delaySeconds: delayMs / 1000,
    serverTime: Date.now(),
    rematchOffer: offeredBy ? { offeredBy } : null,
    rematchNewGameId: validAccepted,
  };
}

export function getIo(): AppServer | null {
  return io;
}

export function attachRealtime(httpServer: HttpServer): AppServer {
  if (io) return io;

  io = new Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>(httpServer, {
    path: SOCKET_PATH,
    // Same origin, so no CORS config is needed or wanted.
    serveClient: false,
    // Chess payloads are tiny; keep the buffer small to bound memory.
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 20_000,
    pingTimeout: 25_000,
    // WebSocket first, long-polling as the fallback for hostile networks.
    transports: ["websocket", "polling"],
    connectionStateRecovery: {
      // Short drops (tunnel, lift, wifi handover) resume the same session
      // and replay missed room events instead of forcing a full resync.
      maxDisconnectionDuration: 60_000,
      skipMiddlewares: false,
    },
  });

  // ── Auth: same token, same verifier as the HTTP side ────────────────
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      if (!token) {
        socket.data.userId = null; // anonymous: spectator-only
        return next();
      }
      socket.data.userId = await resolveUserId(token);
      next();
    } catch {
      // A bad token downgrades to anonymous rather than refusing the
      // connection — spectating must keep working for signed-out users.
      socket.data.userId = null;
      next();
    }
  });

  io.on("connection", (socket) => {
    const appSocket = socket as AppSocket;
    const uid = appSocket.data.userId;
    if (uid && io) {
      onSocketConnected(appSocket, uid, io);
    }
    registerHandlers(appSocket);
  });

  // A game that ends on its own (flag fall with nobody watching) still
  // has to reach whoever is connected.
  setTerminalListener((gameId, terminal) => {
    const game = peek(gameId);
    if (!game) return;
    const payload = {
      gameId,
      terminal,
      clock: game.clockSnapshot(),
      serverTime: Date.now(),
    };
    io?.to(rooms.players(gameId)).emit("game:end", payload);
    scheduleSpectatorEmit(gameId, game, () => {
      io?.to(rooms.spectators(gameId)).emit("game:end", payload);
    });
  });

  startRegistry();
  return io;
}

/**
 * Hold a spectator broadcast back by the delay. Timers are per-emit and
 * unref'd — a pending spectator frame must never keep the process alive
 * or delay a shutdown.
 */
function scheduleSpectatorEmit(gameId: string, game: LiveGame, emit: () => void): void {
  const delay = spectatorDelayMs(game);
  if (delay <= 0) {
    emit();
    return;
  }
  const t = setTimeout(emit, delay);
  t.unref?.();
  void gameId;
}

function registerHandlers(socket: AppSocket): void {
  const joined = new Set<string>();

  const userId = () => socket.data.userId;

  socket.on("time:sync", (payload, ack) => {
    ack?.({ ok: true, data: { serverTime: Date.now(), clientTime: payload?.clientTime ?? 0 } });
  });

  socket.on("game:join", async ({ gameId }, ack) => {
    try {
      const game = await acquire(gameId);
      if (!game) return ack?.(fail("not_found", "Game not found"));

      const uid = userId();
      const seat = game.seatOf(uid);
      socket.join(seat ? rooms.players(gameId) : rooms.spectators(gameId));
      joined.add(gameId);

      if (seat && uid) {
        attach(gameId, uid);
        socket
          .to(rooms.players(gameId))
          .emit("game:presence", { gameId, userId: uid, online: true });
      }

      // Joining is also the moment to settle a flag that fell while
      // nobody was connected.
      const terminal = game.checkFlag();
      if (terminal) {
        void finalize(game).catch(() => {});
        io?.to(rooms.players(gameId)).emit("game:end", {
          gameId,
          terminal,
          clock: game.clockSnapshot(),
          serverTime: Date.now(),
        });
      }

      ack?.({ ok: true, data: snapshotFor(game, uid) });
    } catch (error) {
      logger.error("game:join failed", { error, gameId });
      ack?.(fail("internal", "Could not join game"));
    }
  });

  socket.on("game:resync", async ({ gameId }, ack) => {
    const game = await acquire(gameId);
    if (!game) return ack?.(fail("not_found", "Game not found"));
    ack?.({ ok: true, data: snapshotFor(game, userId()) });
  });

  socket.on("game:move", async ({ gameId, from, to, promotion }, ack) => {
    const uid = userId();
    if (!uid) return ack?.(fail("not_authenticated", "Sign in to play"));

    // Same bound as the old HTTP handler — a runaway client can't flood
    // the room.
    if (!rateLimit({ key: `rt-move:${uid}`, limit: 10, windowMs: 1000 })) {
      return ack?.(fail("rate_limited", "Too many moves — slow down"));
    }

    const game = await acquire(gameId);
    if (!game) return ack?.(fail("not_found", "Game not found"));
    if (!game.seatOf(uid)) return ack?.(fail("not_a_player", "Not a player in this game"));

    const now = Date.now();
    const outcome = game.applyMove(uid, { from, to, promotion }, now);

    if (!outcome.ok) {
      // Hand back the truth with the refusal so the client can revert its
      // optimistic board in the same tick, with no extra round-trip.
      socket.emit("game:rejected", {
        gameId,
        code: outcome.code,
        message: rejectMessage(outcome.code),
        snapshot: snapshotFor(game, uid),
      });
      if (outcome.terminal) {
        void finalize(game).catch(() => {});
        io?.to(rooms.players(gameId)).emit("game:end", {
          gameId,
          terminal: outcome.terminal,
          clock: game.clockSnapshot(),
          serverTime: now,
        });
      }
      return ack?.(fail(outcome.code, rejectMessage(outcome.code)));
    }

    const clock = game.clockSnapshot();
    const movePayload = {
      gameId,
      move: outcome.move,
      clock,
      moveDeadlineAt: game.moveDeadlineAt,
      serverTime: now,
    };

    // Broadcast before anything else — this is the opponent's latency.
    io?.to(rooms.players(gameId)).emit("game:move", movePayload);
    scheduleSpectatorEmit(gameId, game, () => {
      io?.to(rooms.spectators(gameId)).emit("game:move", movePayload);
    });

    // Re-arm the flag timer for the side that now has to move.
    armFlagTimer(gameId);

    if (outcome.terminal) {
      const endPayload = { gameId, terminal: outcome.terminal, clock, serverTime: now };
      io?.to(rooms.players(gameId)).emit("game:end", endPayload);
      scheduleSpectatorEmit(gameId, game, () => {
        io?.to(rooms.spectators(gameId)).emit("game:end", endPayload);
      });
      // Persist off the move path: the players already have the result.
      void finalize(game).catch(() => {});
    }

    ack?.({ ok: true, data: { move: outcome.move, clock } });
  });

  socket.on("game:resign", async ({ gameId }, ack) => {
    const uid = userId();
    if (!uid) return ack?.(fail("not_authenticated", "Sign in to play"));
    const game = await acquire(gameId);
    if (!game) return ack?.(fail("not_found", "Game not found"));

    const terminal = game.resign(uid);
    if (!terminal) return ack?.(fail("game_not_active", "Game is not active"));

    const payload = { gameId, terminal, clock: game.clockSnapshot(), serverTime: Date.now() };
    io?.to(rooms.players(gameId)).emit("game:end", payload);
    scheduleSpectatorEmit(gameId, game, () => {
      io?.to(rooms.spectators(gameId)).emit("game:end", payload);
    });
    void finalize(game).catch(() => {});
    ack?.({ ok: true, data: terminal });
  });

  socket.on("game:draw", async ({ gameId }, ack) => {
    const uid = userId();
    if (!uid) return ack?.(fail("not_authenticated", "Sign in to play"));
    const game = await acquire(gameId);
    if (!game) return ack?.(fail("not_found", "Game not found"));

    const state = game.respondDraw(uid);
    if (state === "inactive") return ack?.(fail("game_not_active", "Game is not active"));

    if (state === "offered") {
      io?.to(rooms.players(gameId)).emit("game:draw-offer", { gameId, offeredBy: uid });
      return ack?.({ ok: true, data: { state } });
    }

    const terminal = game.terminalPayload()!;
    const payload = { gameId, terminal, clock: game.clockSnapshot(), serverTime: Date.now() };
    io?.to(rooms.players(gameId)).emit("game:end", payload);
    scheduleSpectatorEmit(gameId, game, () => {
      io?.to(rooms.spectators(gameId)).emit("game:end", payload);
    });
    void finalize(game).catch(() => {});
    ack?.({ ok: true, data: { state } });
  });

  socket.on("game:draw-decline", async ({ gameId }, ack) => {
    const uid = userId();
    if (!uid) return ack?.(fail("not_authenticated", "Sign in to play"));
    const game = await acquire(gameId);
    if (!game) return ack?.(fail("not_found", "Game not found"));

    const success = game.declineDraw(uid);
    if (success) {
      io?.to(rooms.players(gameId)).emit("game:draw-offer", { gameId, offeredBy: null });
    }
    ack?.({ ok: true, data: { state: "declined" } });
  });

  socket.on("game:chat", async ({ gameId, body }, ack) => {
    const uid = userId();
    if (!uid) return ack?.(fail("not_authenticated", "Sign in to chat"));
    if (!rateLimit({ key: `rt-chat:${uid}`, limit: 5, windowMs: 5000 })) {
      return ack?.(fail("rate_limited", "Slow down"));
    }
    const game = await acquire(gameId);
    if (!game) return ack?.(fail("not_found", "Game not found"));

    const seat = game.seatOf(uid);
    if (!seat) return ack?.(fail("not_a_player", "Only players can chat here"));

    const clean = String(body ?? "")
      .trim()
      .slice(0, MAX_CHAT_LENGTH);
    if (!clean) return ack?.(fail("internal", "Empty message"));

    const message: ChatPayload = {
      // "mem:" marks a message that exists only in memory so far, which
      // is what finalize() uses to decide what still needs inserting.
      id: `mem:${gameId}:${game.chat.length}`,
      userId: uid,
      username: (seat === "w" ? game.white.username : game.black.username) ?? "Player",
      body: clean,
      at: Date.now(),
    };
    game.addChat(message);
    io?.to(rooms.players(gameId)).emit("game:chat", { gameId, message });
    ack?.({ ok: true, data: message });
  });

  socket.on("game:rematch-offer", async ({ gameId }, ack) => {
    try {
      const uid = userId();
      if (!uid) return ack?.(fail("not_authenticated", "Sign in to offer rematch"));

      const game = await acquire(gameId);
      if (!game) return ack?.(fail("not_found", "Game not found"));
      if (!game.seatOf(uid)) return ack?.(fail("not_a_player", "Not a player in this game"));

      const alreadyAccepted = acceptedRematches.get(gameId);
      if (alreadyAccepted && alreadyAccepted.expiresAt > Date.now()) {
        return ack?.({
          ok: true,
          data: { status: "accepted", newGameId: alreadyAccepted.newGameId },
        });
      }

      const existingOffer = rematchOffers.get(gameId);

      if (existingOffer && existingOffer !== uid) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const newGameId = crypto.randomUUID();
        const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const initSecs = game.initialSeconds || 600;
        const incSecs = Math.max(0, Math.round(game.clockSnapshot().incrementMs / 1000) || 0);
        const { error } = await (supabaseAdmin as any).from("games").insert({
          id: newGameId,
          white_id: game.black.userId,
          black_id: game.white.userId,
          white_username: game.black.username,
          black_username: game.white.username,
          white_rating: game.black.rating,
          black_rating: game.white.rating,
          white_time_ms: initSecs * 1000,
          black_time_ms: initSecs * 1000,
          initial_seconds: initSecs,
          increment_seconds: incSecs,
          time_control: game.timeControl || `${Math.round(initSecs / 60)}+${incSecs}`,
          time_class: inferTimeClass(game),
          is_rated: Boolean(game.isRated),
          status: "active",
          result: "ongoing",
          pgn: "",
          turn: "w",
          fen: startFen,
          last_move_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);

        rematchOffers.delete(gameId);
        acceptedRematches.set(gameId, { newGameId, expiresAt: Date.now() + 5 * 60_000 });

        const payload = { gameId, newGameId };
        io?.to(rooms.players(gameId)).emit("game:rematch-accepted", payload);
        io?.to(rooms.spectators(gameId)).emit("game:rematch-accepted", payload);

        ack?.({ ok: true, data: { status: "accepted", newGameId } });
      } else {
        rematchOffers.set(gameId, uid);
        io?.to(rooms.players(gameId)).emit("game:rematch-offer", { gameId, offeredBy: uid });
        ack?.({ ok: true, data: { status: "offered" } });
      }
    } catch (err) {
      logger.error("Failed to process rematch offer", { err, gameId });
      ack?.(fail("internal", err instanceof Error ? err.message : "Could not start rematch"));
    }
  });

  socket.on("game:rematch-decline", ({ gameId }) => {
    rematchOffers.delete(gameId);
    io?.to(rooms.players(gameId)).emit("game:rematch-declined", { gameId });
  });

  socket.on("presence:subscribe", ({ userIds }, ack) => {
    const presences = getPresenceForUserIds(userIds ?? []);
    ack?.({ ok: true, data: { presences } });
  });

  socket.on("game:leave", ({ gameId }) => {
    leave(gameId);
  });

  socket.on("disconnect", () => {
    for (const gameId of joined) leave(gameId);
    const uid = userId();
    if (uid && io) {
      onSocketDisconnected(socket, uid, io);
    }
  });

  function leave(gameId: string) {
    joined.delete(gameId);
    socket.leave(rooms.players(gameId));
    socket.leave(rooms.spectators(gameId));
    const uid = userId();
    if (!uid) return;
    detach(gameId, uid);
    if (!isOnline(gameId, uid)) {
      socket
        .to(rooms.players(gameId))
        .emit("game:presence", { gameId, userId: uid, online: false });
    }
  }
}

function rejectMessage(code: RejectCode): string {
  switch (code) {
    case "not_your_turn":
      return "Not your turn";
    case "illegal_move":
      return "Illegal move";
    case "game_not_active":
      return "Game is not active";
    case "out_of_time":
      return "You ran out of time";
    case "rate_limited":
      return "Too many moves — slow down";
    case "not_a_player":
      return "Not a player in this game";
    case "not_authenticated":
      return "Sign in to play";
    case "banned":
      return "Account is suspended or banned";
    default:
      return "Something went wrong";
  }
}
