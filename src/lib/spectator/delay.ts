// =====================================================================
// SPECTATOR BROADCAST DELAY — presentation side
// ---------------------------------------------------------------------
// THE DELAY IS NOT IMPLEMENTED HERE. It is implemented in the database
// (schema.sql SECTION 104): live games are unreadable to non-players,
// and get_spectator_game() only ever returns plies older than the
// cutoff. Nothing in this file can shorten, lengthen or bypass it.
//
// What lives here is the vocabulary the UI needs to *explain* the delay
// to a viewer — the bands, their labels, and the copy for the badge —
// plus the same band selection the SQL does, so a live match card can
// say "25s delay" before anyone has opened the feed.
//
// Keep BANDS in step with public.spectator_config's CHECK constraints.
// =====================================================================
import type { SpectatorGame, TimeClass } from "./types";

export type DelayBand = "casual" | "ranked" | "final";

/**
 * Permitted range per band, straight from the product spec. The server's
 * spectator_config row must sit inside these; its CHECK constraints
 * enforce exactly these numbers.
 */
export const DELAY_BANDS: Record<DelayBand, { min: number; max: number; label: string }> = {
  casual: { min: 0, max: 5, label: "Casual" },
  ranked: { min: 20, max: 30, label: "Ranked" },
  final: { min: 30, max: 60, label: "Tournament final" },
};

/**
 * Defaults matching the shipped spectator_config row. Used only for
 * pre-feed estimates (browse cards); once a feed is open its payload
 * carries the authoritative `delay_seconds`.
 */
export const DEFAULT_DELAY_SECONDS: Record<DelayBand, number> = {
  casual: 3,
  ranked: 25,
  final: 45,
};

/** Which band a match falls into — mirrors public.spectator_delay_seconds(). */
export function bandFor(input: { isRated: boolean; isTournamentFinal?: boolean }): DelayBand {
  if (input.isTournamentFinal) return "final";
  return input.isRated ? "ranked" : "casual";
}

/** Best pre-feed estimate of a match's delay, in seconds. */
export function estimateDelaySeconds(input: {
  isRated: boolean;
  isTournamentFinal?: boolean;
}): number {
  return DEFAULT_DELAY_SECONDS[bandFor(input)];
}

/** "25s" / "1:05" / "live" — the number on the delay badge. */
export function formatDelay(seconds: number): string {
  if (seconds <= 0) return "live";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * The sentence shown under the board. Spectators are told plainly that
 * they are behind and why — a viewer who thinks the feed is real time
 * will read a slow update as a bug, and one who does not know the delay
 * exists cannot understand why the result appears late.
 */
export function delayExplanation(game: Pick<SpectatorGame, "delay_seconds" | "is_player">): string {
  if (game.is_player) return "You are playing this game — your board is live.";
  if (game.delay_seconds <= 0) return "This game has finished. The full move list is available.";
  return (
    `Broadcast is delayed by ${formatDelay(game.delay_seconds)} to protect the players ` +
    `from engine assistance and coaching.`
  );
}

/**
 * How far behind the live position this viewer is, as a short status.
 * `moves_behind` is the count of plies the server is deliberately
 * withholding, so a non-zero value means the players are ahead of you.
 */
export function behindLabel(movesBehind: number): string | null {
  if (movesBehind <= 0) return null;
  return movesBehind === 1 ? "1 move behind" : `${movesBehind} moves behind`;
}

/** Human label for a time class, used on cards and filters. */
export const TIME_CLASS_LABEL: Record<TimeClass, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
  correspondence: "Correspondence",
};
