// =====================================================================
// GAME RESULT — the single interpretation of `games.result`
// ---------------------------------------------------------------------
// `games.result` is the Postgres enum `game_result`, which has FIVE
// members, not two:
//
//     'white' | 'black' | 'draw' | 'ongoing' | 'aborted'
//
// and its column DEFAULT is 'ongoing' (NOT NULL). Every surface that
// rendered a winner used to ask `result === "white" ? "White" : "Black"`,
// which silently reports **Black Wins** for 'draw', 'ongoing' AND
// 'aborted'. That binary ternary is the root cause of "only Black Win
// appears": any finished game that did not end with an explicit White
// victory fell into the else-branch.
//
// Every result-bearing surface now goes through this module, so a new
// enum member can never again be misreported as a Black win. `decide()`
// is total over `string` — unknown input degrades to "ongoing" rather
// than to a wrong winner.
// =====================================================================

/** Mirrors the Postgres `game_result` enum exactly. */
export type GameResult = "white" | "black" | "draw" | "ongoing" | "aborted";

/** A result that actually named a winner. */
export type DecisiveResult = "white" | "black";

const RESULTS: ReadonlySet<string> = new Set<GameResult>([
  "white",
  "black",
  "draw",
  "ongoing",
  "aborted",
]);

/**
 * Coerce anything the DB/network hands us into a known result.
 * Unknown values become "ongoing" — the only safe default, because it
 * claims no winner. Never guess a winner from unrecognised input.
 */
export function normalizeResult(raw: string | null | undefined): GameResult {
  if (typeof raw !== "string") return "ongoing";
  const v = raw.trim().toLowerCase();
  return (RESULTS.has(v) ? v : "ongoing") as GameResult;
}

export function isDecisive(result: GameResult): result is DecisiveResult {
  return result === "white" || result === "black";
}

/** True once the result represents a settled game (incl. draws/aborts). */
export function isConcluded(result: GameResult): boolean {
  return result !== "ongoing";
}

/** The winning side's colour, or null when nobody won. */
export function winnerColor(result: GameResult): "w" | "b" | null {
  if (result === "white") return "w";
  if (result === "black") return "b";
  return null;
}

/**
 * The result from one player's point of view.
 * "none" = no verdict for this player (game unfinished, aborted, or the
 * viewer is a spectator with no seat).
 */
export function outcomeFor(
  result: GameResult,
  myColor: "w" | "b" | null | undefined,
): "win" | "loss" | "draw" | "none" {
  if (result === "draw") return "draw";
  if (!myColor || !isDecisive(result)) return "none";
  return winnerColor(result) === myColor ? "win" : "loss";
}

/** PGN Result tag (PGN §9.10). */
export function resultToPgnTag(result: GameResult): "1-0" | "0-1" | "1/2-1/2" | "*" {
  if (result === "white") return "1-0";
  if (result === "black") return "0-1";
  if (result === "draw") return "1/2-1/2";
  return "*";
}

/** Inverse of `resultToPgnTag`, for PGN import. */
export function resultFromPgnTag(tag: string): GameResult {
  if (tag === "1-0") return "white";
  if (tag === "0-1") return "black";
  if (tag === "1/2-1/2") return "draw";
  return "ongoing";
}

// ── End reasons ──────────────────────────────────────────────────────
// Written by makeMove (game.functions.ts), the resign/draw/timeout RPCs,
// the tournament + global clock sweeps, and the abort paths. Several
// spellings exist for the same concept across those writers, so the map
// is deliberately permissive rather than exhaustive-by-type.

const END_REASONS: Record<string, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  resignation: "Resignation",
  resigned: "Resignation",
  timeout: "On time",
  white_won_on_time: "On time",
  black_won_on_time: "On time",
  agreement: "By agreement",
  repetition: "Threefold repetition",
  threefold: "Threefold repetition",
  fivefold: "Fivefold repetition",
  insufficient: "Insufficient material",
  insufficient_material: "Insufficient material",
  "fifty-move": "Fifty-move rule",
  fifty_move: "Fifty-move rule",
  "seventy-five-move": "Seventy-five-move rule",
  dead_position: "Dead position",
  no_show: "No show",
  aborted: "Aborted",
  tournament_cancelled: "Tournament cancelled",
  abandoned: "Abandoned",
};

/** Human-readable end reason, e.g. "black_won_on_time" → "On time". */
export function formatEndReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const key = reason.trim().toLowerCase();
  if (END_REASONS[key]) return END_REASONS[key];
  // Unknown reason: de-snake it rather than dropping information.
  const spaced = key.replace(/[_-]+/g, " ").trim();
  if (!spaced) return null;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The headline shown on end-of-game overlays and modals.
 * Note "Draw", "Game Aborted" and "In Progress" are first-class outcomes
 * here — they are NOT folded into a win for either side.
 */
export function resultHeadline(result: GameResult): string {
  switch (result) {
    case "white":
      return "White Wins";
    case "black":
      return "Black Wins";
    case "draw":
      return "Draw";
    case "aborted":
      return "Game Aborted";
    case "ongoing":
      return "In Progress";
  }
}

/**
 * Player-relative headline ("You Won" / "You Lost"), falling back to the
 * neutral headline for spectators and non-decisive results.
 */
export function personalHeadline(
  result: GameResult,
  myColor: "w" | "b" | null | undefined,
): string {
  switch (outcomeFor(result, myColor)) {
    case "win":
      return "You Won";
    case "loss":
      return "You Lost";
    case "draw":
      return "Draw";
    default:
      return resultHeadline(result);
  }
}

/** "White Wins by checkmate" / "Draw by agreement" / "Game Aborted". */
export function resultSentence(result: GameResult, endReason: string | null | undefined): string {
  const head = resultHeadline(result);
  const reason = formatEndReason(endReason);
  if (!reason) return head;
  if (result === "aborted" || result === "ongoing") return `${head} — ${reason}`;
  // "On time" / "By agreement" already read as prepositional phrases.
  if (reason.startsWith("On ") || reason.startsWith("By "))
    return `${head} ${reason.toLowerCase()}`;
  return `${head} by ${reason.toLowerCase()}`;
}
