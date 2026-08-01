// =====================================================================
// PEER MOVE RELAY — the low-latency half of the live board
// ---------------------------------------------------------------------
// A move used to reach the opponent's screen only after the whole write
// path had completed:
//
//   mover → app server → auth → Supabase reads → INSERT + UPDATE
//         → Postgres WAL → Realtime → opponent
//
// Every one of those hops is on the opponent's critical path, and the two
// slowest (the write itself and the WAL→Realtime decode) happen *after*
// the mover already knows the move. Meanwhile both players are already
// sitting on an open Realtime socket for the same channel — the one that
// carries the postgres_changes events — with nothing else to do.
//
// So the mover also relays the move directly over that existing channel
// the instant it is played. The opponent renders it *provisionally* and
// the authoritative row, arriving a moment later on the same socket,
// replaces it. Nothing new is deployed: same process, same connection,
// same channel topic.
//
// SECURITY. A broadcast is client-sent and therefore untrusted, so a
// relayed move is never allowed to *decide* anything — it cannot end a
// game, move a rating, or bank a clock. `acceptLiveMove` re-derives the
// position from the receiver's own authoritative FEN and drops anything
// that does not fit exactly:
//
//   * the game must be active, and the sender must be the seated player
//     whose turn it actually is;
//   * the move must be the very next ply, played from the exact position
//     the receiver holds;
//   * the move must be legal, and the position it produces must match
//     what the sender claimed.
//
// The worst a forged payload can achieve is showing its own author's
// opponent a legal position for the few tens of milliseconds until the
// server's row overwrites it — the same reconciliation that already
// backstops the mover's own optimistic board.
// =====================================================================
import { Chess, type Move } from "chess.js";

export const LIVE_MOVE_EVENT = "live-move";

export type Promotion = "q" | "r" | "b" | "n";

/** What the mover puts on the wire. Purely a hint — see the header. */
export type LiveMovePayload = {
  /** The ply number this move produces (1-based). */
  ply: number;
  from: string;
  to: string;
  promotion?: Promotion;
  /** The position it was played from — the receiver's sync check. */
  fenBefore: string;
  /** The position it produces — cross-checked against a local replay. */
  fenAfter: string;
  /** The mover's commit instant, used only to hand the clock over locally. */
  at: number;
  /** The mover's user id. */
  by: string;
};

/**
 * The bit of a Supabase RealtimeChannel this module needs. Kept structural
 * so the relay stays testable without a live socket.
 */
export type LiveMoveSender = {
  send: (args: { type: "broadcast"; event: string; payload: LiveMovePayload }) => unknown;
};

/**
 * Relay a move to the other side of the board.
 *
 * Deliberately fire-and-forget: the channel is configured with `ack:false`
 * so this resolves immediately, and awaiting it would put the very latency
 * back on the move path that the relay exists to remove. A relay that
 * fails to send costs nothing — the authoritative row still arrives.
 */
export function sendLiveMove(
  channel: LiveMoveSender | null | undefined,
  payload: LiveMovePayload,
): void {
  if (!channel) return;
  try {
    void channel.send({ type: "broadcast", event: LIVE_MOVE_EVENT, payload });
  } catch {
    /* best-effort by design */
  }
}

/** The receiver's authoritative view of the game, as it stands right now. */
export type LiveMoveContext = {
  status: string | null | undefined;
  /** The authoritative FEN — never a provisional/optimistic one. */
  fen: string | null | undefined;
  /** `games.moves_count` for that FEN. */
  movesCount: number | null | undefined;
  whiteId: string | null | undefined;
  blackId: string | null | undefined;
  /** Used to drop our own echo; broadcast `self` is off, but never rely on it. */
  viewerId: string | null | undefined;
};

/** A relayed move that survived validation, re-derived locally. */
export type AcceptedLiveMove = {
  ply: number;
  from: string;
  to: string;
  /** Recomputed here — the sender's claimed FEN is only ever compared, never used. */
  fen: string;
  san: string;
  at: number;
  move: Move;
  /** The resulting position, for terminal detection by the caller. */
  chess: Chess;
};

const SQUARE = /^[a-h][1-8]$/;
const PROMOTIONS: readonly string[] = ["q", "r", "b", "n"];

/**
 * How far back a relayed commit timestamp may sit before we ignore it and
 * use our own clock instead. A peer that claims its move was played long
 * ago would otherwise deduct that time from its own clock locally — a
 * cosmetic lie until the server's row lands, but a pointless one to allow.
 */
const MAX_RELAY_AGE_MS = 10_000;

export function acceptLiveMove(
  raw: unknown,
  ctx: LiveMoveContext,
  now: number = Date.now(),
): AcceptedLiveMove | null {
  const p = raw as Partial<LiveMovePayload> | null | undefined;
  if (!p || typeof p !== "object") return null;
  if (typeof p.from !== "string" || !SQUARE.test(p.from)) return null;
  if (typeof p.to !== "string" || !SQUARE.test(p.to)) return null;
  if (p.promotion !== undefined && !PROMOTIONS.includes(p.promotion)) return null;
  if (typeof p.ply !== "number" || !Number.isInteger(p.ply)) return null;
  if (typeof p.by !== "string" || p.by.length === 0) return null;
  if (typeof p.fenBefore !== "string" || typeof p.fenAfter !== "string") return null;

  if (ctx.status !== "active" || !ctx.fen) return null;
  if (ctx.viewerId && p.by === ctx.viewerId) return null;

  // Exactly the next ply, played from exactly the position we hold.
  // Anything else is stale, ahead of us, or forged — in every one of those
  // cases the authoritative row is the right thing to wait for.
  if (p.ply !== (ctx.movesCount ?? 0) + 1) return null;
  if (p.fenBefore !== ctx.fen) return null;

  const chess = new Chess();
  try {
    chess.load(ctx.fen);
  } catch {
    return null;
  }

  // The sender must be the seated player whose turn it is. Reading the
  // side to move off the position (rather than off a `turn` column that
  // could lag it) means these two can never disagree.
  const seated = chess.turn() === "w" ? ctx.whiteId : ctx.blackId;
  if (!seated || seated !== p.by) return null;

  let move: Move | null = null;
  try {
    move = chess.move({ from: p.from, to: p.to, promotion: p.promotion });
  } catch {
    return null;
  }
  if (!move) return null;

  // Trust our own replay, not their FEN; a mismatch means a tampered
  // payload or a peer on a different build, and either way we drop it.
  const fen = chess.fen();
  if (fen !== p.fenAfter) return null;

  const at =
    typeof p.at === "number" && Number.isFinite(p.at)
      ? Math.min(Math.max(p.at, now - MAX_RELAY_AGE_MS), now)
      : now;

  return { ply: p.ply, from: p.from, to: p.to, fen, san: move.san, at, move, chess };
}
