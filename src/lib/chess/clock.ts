// =====================================================================
// CHESS CLOCK — drift-free, wall-clock anchored
// ---------------------------------------------------------------------
// The clocks in local play and the bot game each ran their own
// `setInterval(… , 1000)` that did `t => t - 1`. That design cannot keep
// time:
//
//   * setInterval drifts — it guarantees "at least" 1000 ms, never
//     exactly 1000, so the error accumulates over a long game;
//   * background tabs are throttled to ≥1 s (often far worse), so a
//     backgrounded game silently gains time;
//   * the tick fired a side effect (ending the game) from inside a state
//     updater, which React may invoke twice;
//   * nothing survived a refresh, because the remaining time existed
//     only as a counter, not as a deadline.
//
// This module keeps *banked* time plus the timestamp the running side's
// turn began. Remaining time is always recomputed from wall-clock, so it
// cannot drift, cannot be lost to throttling, and is trivially
// restorable after a refresh or reconnect: persist the state, reload it,
// and the elapsed wall-clock is accounted for automatically.
//
// Rendering reads `remainingMs`; it never writes. That separation is
// what stops a repaint from ever changing the time.
// =====================================================================

export type ClockColor = "w" | "b";

export type ClockState = {
  /** Time banked by White, excluding any turn currently in progress. */
  whiteMs: number;
  blackMs: number;
  /** Whose clock is counting, or null when the clock is stopped. */
  running: ClockColor | null;
  /** Epoch ms at which the running side's turn began. */
  since: number;
  /** Fischer increment added to a side when it completes a move. */
  incrementMs: number;
  /**
   * US-style simple delay: the first `delayMs` of every turn is free.
   * Bronstein delay yields the same remaining time at move completion,
   * so this covers both conventions for practical purposes.
   */
  delayMs: number;
  /**
   * A "no timer" game. This is fixed at creation rather than inferred
   * from the current time, because an inferred test ("both banks are
   * empty") is also true of a game where someone has just flagged.
   */
  untimed: boolean;
};

export type ClockConfig = {
  /** Starting time per side. 0 means "no clock" — see `isUntimed`. */
  initialMs: number;
  incrementMs?: number;
  delayMs?: number;
};

export function createClock({ initialMs, incrementMs = 0, delayMs = 0 }: ClockConfig): ClockState {
  return {
    whiteMs: Math.max(0, initialMs),
    blackMs: Math.max(0, initialMs),
    running: null,
    since: 0,
    incrementMs: Math.max(0, incrementMs),
    delayMs: Math.max(0, delayMs),
    untimed: initialMs <= 0,
  };
}

/** A clock with no initial time is a "no timer" game — never flags. */
export function isUntimed(state: ClockState): boolean {
  return state.untimed;
}

function banked(state: ClockState, color: ClockColor): number {
  return color === "w" ? state.whiteMs : state.blackMs;
}

function withBanked(state: ClockState, color: ClockColor, ms: number): ClockState {
  return color === "w" ? { ...state, whiteMs: ms } : { ...state, blackMs: ms };
}

/**
 * Time left for `color` at instant `now`. Pure: calling it never mutates
 * the clock, so it is safe to call from render at any frequency.
 */
export function remainingMs(state: ClockState, color: ClockColor, now: number): number {
  const base = banked(state, color);
  if (state.running !== color) return Math.max(0, base);
  const elapsed = Math.max(0, now - state.since);
  // The delay is consumed before any time is deducted.
  const charged = Math.max(0, elapsed - state.delayMs);
  return Math.max(0, base - charged);
}

/** Hand the move to `color` and start their clock at `now`. */
export function startTurn(state: ClockState, color: ClockColor, now: number): ClockState {
  const settled = state.running && state.running !== color ? stop(state, now) : state;
  return { ...settled, running: color, since: now };
}

/**
 * The running side completed a move at `now`: bank what they have left,
 * add their increment, and pass the clock to the other side.
 */
export function press(state: ClockState, now: number): ClockState {
  const mover = state.running;
  if (!mover) return state;
  const left = remainingMs(state, mover, now);
  // A side that has already flagged gets no increment — the flag stands.
  const next = left <= 0 ? 0 : left + state.incrementMs;
  const banked = withBanked(state, mover, next);
  const opponent: ClockColor = mover === "w" ? "b" : "w";
  return { ...banked, running: opponent, since: now };
}

/** Freeze the clock, banking whatever the running side has left. */
export function stop(state: ClockState, now: number): ClockState {
  if (!state.running) return state;
  const left = remainingMs(state, state.running, now);
  return { ...withBanked(state, state.running, left), running: null, since: now };
}

/**
 * Which side (if any) has run out of time at `now`. Only the side whose
 * clock is running can flag — a stopped clock never falls.
 */
export function flagged(state: ClockState, now: number): ClockColor | null {
  if (!state.running || isUntimed(state)) return null;
  return remainingMs(state, state.running, now) <= 0 ? state.running : null;
}

/**
 * Rehydrate a clock persisted across a refresh or reconnect. The elapsed
 * wall-clock time between `since` and `now` is already accounted for by
 * `remainingMs`, so restoring is just validation — but a clock restored
 * from a clearly bogus timestamp (clock skew, a doctored payload) would
 * otherwise burn the running side's whole bank, so a future `since` is
 * pulled back to `now`.
 */
export function restoreClock(state: ClockState, now: number): ClockState {
  if (!state.running) return state;
  if (state.since > now) return { ...state, since: now };
  return state;
}

/**
 * Adapt a server `games` row into a ClockState.
 *
 * `white_time_ms` / `black_time_ms` are *banked* values, correct as of
 * `last_move_at` — the server has already deducted everything up to that
 * instant. The elapsed time since then must therefore be subtracted
 * exactly once, by `remainingMs`, and never by the caller.
 *
 * Getting that wrong is not hypothetical: the live board used to subtract
 * the elapsed time itself, pass the result down as a "base", and have the
 * player card subtract it a second time — so the side to move watched
 * their clock run at double speed and hit zero at the halfway mark.
 * Funnelling every consumer through this adapter is what makes that
 * mistake unrepresentable.
 */
export function clockFromServer(row: {
  whiteTimeMs: number;
  blackTimeMs: number;
  turn: string;
  lastMoveAt: string | number | null;
  isActive: boolean;
  initialSeconds?: number | null;
  incrementSeconds?: number | null;
}): ClockState {
  const since =
    typeof row.lastMoveAt === "number"
      ? row.lastMoveAt
      : row.lastMoveAt
        ? new Date(row.lastMoveAt).getTime()
        : Date.now();
  return {
    whiteMs: Math.max(0, row.whiteTimeMs),
    blackMs: Math.max(0, row.blackTimeMs),
    running: row.isActive ? (row.turn === "w" ? "w" : "b") : null,
    since: Number.isFinite(since) ? since : Date.now(),
    incrementMs: Math.max(0, (row.incrementSeconds ?? 0) * 1000),
    delayMs: 0,
    untimed: (row.initialSeconds ?? 0) <= 0,
  };
}

/**
 * Milliseconds until the next visible change, for scheduling a repaint.
 * Above the tenths threshold the display only changes each whole second,
 * so there is no reason to repaint more often than that — this is what
 * keeps an idle board off the CPU without making the clock look choppy.
 */
export function msToNextTick(remaining: number, showTenths: boolean): number {
  if (remaining <= 0) return Number.POSITIVE_INFINITY;
  const period = showTenths && remaining < 10_000 ? 100 : 1000;
  const rem = remaining % period;
  return rem === 0 ? period : rem;
}

/**
 * Format milliseconds spent on a single chess move into a compact string
 * (e.g. 0.4s, 3s, 1:12).
 */
export function formatMoveDuration(tookMs?: number | null): string {
  if (tookMs === undefined || tookMs === null || tookMs <= 0) return "";
  const totalSeconds = tookMs / 1000;
  if (totalSeconds < 1) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const roundedSec = Math.round(totalSeconds);
  if (roundedSec < 60) {
    return `${roundedSec}s`;
  }
  const mins = Math.floor(roundedSec / 60);
  const secs = roundedSec % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}
