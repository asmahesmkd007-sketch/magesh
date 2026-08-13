// =====================================================================
// REJOIN ELIGIBILITY — one place that answers "may this user resume?"
// ---------------------------------------------------------------------
// This module introduces no new lifecycle. It reads the *existing* game
// model and restates it as a single decision:
//
//   * `games.status` is already the lifecycle: waiting | active |
//     finished | aborted (see supabase/schema.sql section 6 and
//     protocol.ts `GameStatus`). Only `active` is a game in progress.
//   * membership is already `white_id` / `black_id`, which is exactly
//     what `LiveGame.seatOf()` checks on the socket before accepting a
//     move. The same rule decides rejoin.
//   * expiry is not a new timer. A game whose clock has already run out
//     is settled by the existing authority — `LiveGame.checkFlag()`,
//     armed by the registry's per-game flag timer — the moment anyone
//     touches it. This module reuses the same pure `clock.ts` functions
//     (`clockFromServer` + `flagged`) to avoid *offering* a rejoin for a
//     game the server will immediately end. It never decides the result;
//     it only declines to advertise a corpse as "in progress".
//
// Being pure and row-shaped keeps the rule testable and keeps the server
// function underneath it a thin query.
// =====================================================================
import { clockFromServer, flagged } from "@/lib/chess/clock";

/** The subset of a `games` row this decision needs. */
export type RejoinGameRow = {
  id: string;
  status: string;
  white_id: string | null;
  black_id: string | null;
  white_username: string | null;
  black_username: string | null;
  white_time_ms: number | null;
  black_time_ms: number | null;
  last_move_at: string | null;
  initial_seconds: number | null;
  increment_seconds: number | null;
  turn: string | null;
  moves_count: number | null;
  time_control: string | null;
  is_rated: boolean | null;
  vs_computer?: boolean | null;
};

export type RejoinRefusal =
  | "not_authenticated"
  | "not_found"
  | "not_a_player"
  | "not_active"
  | "expired";

export type RejoinDecision =
  | { ok: true; gameId: string; color: "w" | "b" }
  | { ok: false; reason: RejoinRefusal };

/**
 * The authoritative rejoin rule.
 *
 * `userId` must come from a verified session — never from the client. The
 * caller is responsible for that; this function assumes the id it is
 * handed is already proven.
 */
export function rejoinDecision(
  row: RejoinGameRow | null | undefined,
  userId: string | null | undefined,
  now: number = Date.now(),
): RejoinDecision {
  if (!userId) return { ok: false, reason: "not_authenticated" };
  if (!row) return { ok: false, reason: "not_found" };

  // Seat check, identical to LiveGame.seatOf().
  const color: "w" | "b" | null =
    row.white_id === userId ? "w" : row.black_id === userId ? "b" : null;
  if (!color) return { ok: false, reason: "not_a_player" };

  // Completed and aborted games are terminal in the existing model and
  // are never resurrected. `waiting` is a seat that was never filled —
  // it is not a match in progress, so it is not a rejoin either.
  if (row.status !== "active") return { ok: false, reason: "not_active" };

  if (hasAlreadyFlagged(row, now)) return { ok: false, reason: "expired" };

  return { ok: true, gameId: row.id, color };
}

/**
 * True when the side to move has already run out of time, according to
 * the same clock module the server and the board both use.
 *
 * This is a *read* of the existing clock rules, not a new timeout policy:
 * the game is still `active` in the database, and it stays that way until
 * `LiveGame.checkFlag()` settles it on the next join or flag timer.
 */
export function hasAlreadyFlagged(row: RejoinGameRow, now: number = Date.now()): boolean {
  const clock = clockFromServer({
    whiteTimeMs: row.white_time_ms ?? 0,
    blackTimeMs: row.black_time_ms ?? 0,
    turn: row.turn ?? "w",
    lastMoveAt: row.last_move_at,
    isActive: row.status === "active",
    initialSeconds: row.initial_seconds,
    incrementSeconds: row.increment_seconds,
  });
  return flagged(clock, now) !== null;
}

/** What the "ongoing game" prompt renders. No new metadata is invented. */
export type RejoinableGame = {
  gameId: string;
  /** The signed-in player's seat. */
  color: "w" | "b";
  whiteUsername: string | null;
  blackUsername: string | null;
  timeControl: string | null;
  isRated: boolean;
  movesCount: number;
  /** Server epoch ms of the last move, for ordering only. */
  lastMoveAt: number | null;
};

export function toRejoinableGame(row: RejoinGameRow, color: "w" | "b"): RejoinableGame {
  return {
    gameId: row.id,
    color,
    whiteUsername: row.white_username,
    blackUsername: row.black_username,
    timeControl: row.time_control,
    isRated: Boolean(row.is_rated),
    movesCount: row.moves_count ?? 0,
    lastMoveAt: row.last_move_at ? new Date(row.last_move_at).getTime() : null,
  };
}

/**
 * Filter a set of rows down to the ones this user may resume, newest
 * activity first. Used by the returning-user lookup.
 */
export function rejoinableGames(
  rows: RejoinGameRow[],
  userId: string | null | undefined,
  now: number = Date.now(),
): RejoinableGame[] {
  const out: RejoinableGame[] = [];
  for (const row of rows) {
    // A game against the engine or a pass-and-play board is only ever
    // written once it is over, so it can never be a live rejoin.
    if (row.vs_computer) continue;
    const decision = rejoinDecision(row, userId, now);
    if (decision.ok) out.push(toRejoinableGame(row, decision.color));
  }
  return out.sort((a, b) => (b.lastMoveAt ?? 0) - (a.lastMoveAt ?? 0));
}
