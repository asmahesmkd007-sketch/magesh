// =====================================================================
// FIDE TERMINAL-STATE DETECTION — one authority for "is this game over?"
// ---------------------------------------------------------------------
// Every board surface (live game, local pass-and-play, bot, tournament
// arena) and the server move handler previously ran its own chain of
// chess.js checks. They disagreed, and two of them were wrong:
//
//   * `chess.isDraw()` is a catch-all — it is true for stalemate,
//     insufficient material, threefold repetition AND the fifty-move
//     rule. Code that fell through to it and labelled the result
//     "fifty-move" mislabelled the other three.
//
//   * `chess.isThreefoldRepetition()` only counts positions that this
//     Chess *instance* has seen. A `new Chess(fen)` built from a stored
//     FEN — which is exactly what the server move handler does — has no
//     position history, so repetition could never be detected at all.
//     `priorPositionKeys` exists to close that gap: callers that hold
//     the earlier positions (e.g. from `game_moves.fen_after`) pass them
//     in and get correct repetition counting on a FEN-only instance.
//
// chess.js 1.4 has no fivefold / seventy-five-move predicate, so both
// are derived here from the repetition count and the halfmove clock.
// =====================================================================
import { Chess } from "chess.js";

import type { DecisiveResult, GameResult } from "./result";

export type DrawReason =
  | "stalemate"
  | "insufficient"
  | "repetition"
  | "fivefold"
  | "fifty-move"
  | "seventy-five-move";

export type EndReason = "checkmate" | DrawReason;

export type TerminalState = {
  result: GameResult;
  reason: EndReason;
  /**
   * FIDE 9.6 / 5.2: true when the game ends by itself. Threefold (9.2)
   * and the fifty-move rule (9.3) are *claimable* under FIDE, but this
   * app auto-settles them the way online platforms do; `automatic` still
   * records which kind of rule fired so a claim-based UI can be layered
   * on later without re-deriving it.
   */
  automatic: boolean;
};

/**
 * The repetition identity of a position: piece placement, side to move,
 * castling rights and the en-passant square (FEN fields 1–4). Halfmove
 * and fullmove counters are deliberately excluded — they always differ
 * between repetitions.
 */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/**
 * Every position this instance has occupied, oldest first, including the
 * position it started from and the one it is in now.
 */
export function positionKeysOf(chess: Chess): string[] {
  const history = chess.history({ verbose: true });
  if (history.length === 0) return [positionKey(chess.fen())];
  const keys = [positionKey(history[0].before)];
  for (const move of history) keys.push(positionKey(move.after));
  return keys;
}

/**
 * How many times the current position has occurred (1 = first time).
 * `priorPositionKeys` covers positions that happened before this
 * instance's own history — required when the instance was built from a
 * bare FEN and therefore remembers nothing.
 */
export function repetitionCount(chess: Chess, priorPositionKeys: readonly string[] = []): number {
  const current = positionKey(chess.fen());
  let count = 0;
  for (const key of priorPositionKeys) if (key === current) count++;
  for (const key of positionKeysOf(chess)) if (key === current) count++;
  return count;
}

/** The halfmove clock (FEN field 5) — plies since the last pawn move or capture. */
export function halfmoveClock(chess: Chess): number {
  const parsed = Number(chess.fen().split(" ")[4]);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Decide whether the position is terminal, and why.
 *
 * Order matters: the most specific rule wins, and mate is checked before
 * every draw rule so a mating move that also happens to complete the
 * fifty-move count is scored as mate, not as a draw.
 */
export function terminalStateOf(
  chess: Chess,
  priorPositionKeys: readonly string[] = [],
): TerminalState | null {
  if (chess.isCheckmate()) {
    // The side to move is the one that got mated.
    const winner: DecisiveResult = chess.turn() === "w" ? "black" : "white";
    return { result: winner, reason: "checkmate", automatic: true };
  }
  if (chess.isStalemate()) {
    return { result: "draw", reason: "stalemate", automatic: true };
  }
  // FIDE 5.2.2 dead position — chess.js covers the material-only cases
  // (K v K, K+B v K, K+N v K, K+B v K+B on one colour complex).
  if (chess.isInsufficientMaterial()) {
    return { result: "draw", reason: "insufficient", automatic: true };
  }

  const halfmoves = halfmoveClock(chess);
  // FIDE 9.6.2 — 75 moves by each side with no capture or pawn move ends
  // the game immediately, with no claim required.
  if (halfmoves >= 150) {
    return { result: "draw", reason: "seventy-five-move", automatic: true };
  }

  const repetitions = repetitionCount(chess, priorPositionKeys);
  // FIDE 9.6.1 — fivefold occurrence ends the game immediately.
  if (repetitions >= 5) {
    return { result: "draw", reason: "fivefold", automatic: true };
  }
  // FIDE 9.2 — threefold is claimable; auto-settled here, as on every
  // major online platform.
  if (repetitions >= 3) {
    return { result: "draw", reason: "repetition", automatic: false };
  }
  // FIDE 9.3 — fifty-move rule, likewise claimable and auto-settled.
  if (halfmoves >= 100) {
    return { result: "draw", reason: "fifty-move", automatic: false };
  }
  return null;
}

/**
 * True when the position is drawn but only because a claimable rule
 * fired — useful for offering "Claim draw" instead of ending outright.
 */
export function claimableDraw(
  chess: Chess,
  priorPositionKeys: readonly string[] = [],
): DrawReason | null {
  const terminal = terminalStateOf(chess, priorPositionKeys);
  if (!terminal || terminal.automatic || terminal.reason === "checkmate") return null;
  return terminal.reason;
}

/**
 * FIDE 6.9 — when a player's flag falls, the opponent only wins if they
 * could still checkmate "by any possible series of legal moves". With
 * bare king, or king and a single minor piece, they cannot force mate
 * against a lone king, so the game is drawn instead of lost on time.
 *
 * This is the same "helpmate is impossible" test used by online
 * platforms: a lone king, or a king with one knight or one bishop and no
 * other material on the board, cannot mate. A king with two knights can
 * mate in principle (helpmate exists), so it counts as mating material.
 */
export function hasMatingMaterial(chess: Chess, color: "w" | "b"): boolean {
  let pawns = 0;
  let knights = 0;
  let bishops = 0;
  let majors = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== color) continue;
      if (cell.type === "p") pawns++;
      else if (cell.type === "n") knights++;
      else if (cell.type === "b") bishops++;
      else if (cell.type === "r" || cell.type === "q") majors++;
    }
  }
  if (pawns > 0 || majors > 0) return true;
  // Two bishops, or bishop + knight, or two knights can all mate.
  return bishops + knights >= 2;
}

/** The square of the king that is currently in check, or null. */
export function checkedKingSquare(chess: Chess): string | null {
  if (!chess.inCheck()) return null;
  const turn = chess.turn();
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type === "k" && cell.color === turn) return cell.square;
    }
  }
  return null;
}
