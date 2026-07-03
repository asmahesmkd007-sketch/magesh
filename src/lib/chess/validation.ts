// =====================================================================
// FEN / PGN VALIDATION
// ---------------------------------------------------------------------
// Standalone guards used before trusting externally-supplied positions or
// game records (PGN import, analysis paste, local/computer game persistence).
// Multiplayer games are already server-validated in game.functions.ts; this
// covers the client-supplied paths and any future import UI. Uses chess.js
// as the single rules authority so validation never drifts from gameplay.
// =====================================================================
import { Chess } from "chess.js";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** True if `fen` is a fully legal position chess.js can load. */
export function isValidFen(fen: string): boolean {
  if (typeof fen !== "string" || fen.trim() === "") return false;
  try {
    // chess.js throws on malformed/illegal FEN in its constructor.
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

/** True if `pgn` parses into a legal game. */
export function isValidPgn(pgn: string): boolean {
  if (typeof pgn !== "string") return false;
  try {
    const c = new Chess();
    c.loadPgn(pgn);
    return true;
  } catch {
    return false;
  }
}

export type LoadedGame = { chess: Chess; fen: string; sans: string[] };

/**
 * Parse a PGN into a Chess instance plus the SAN move list, or return null
 * if the PGN is invalid. Never throws — safe to call on untrusted input.
 */
export function loadPgnSafe(pgn: string): LoadedGame | null {
  if (!isValidPgn(pgn)) return null;
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return null;
  }
  return { chess, fen: chess.fen(), sans: chess.history() };
}
