// =====================================================================
// OPENING LABEL — what the broadcast calls the game
// ---------------------------------------------------------------------
// The ECO book and the longest-prefix matching already exist in
// lib/chess/openings.ts, which is what history, profiles and engine
// review use. This module is a thin adapter over it, not a second book:
// it only decides WHICH name to show on a live broadcast.
//
// Precedence: the name post-game analysis stored on `games.opening`
// wins when it exists, because it was computed over the whole game;
// otherwise the book is consulted live against the plies the delayed
// feed has released.
// =====================================================================
import { detectOpening } from "@/lib/chess/openings";

/**
 * The opening name for a live match, or null when neither the stored
 * value nor the book can name it — better to show nothing than a wrong
 * name on a broadcast.
 */
export function openingLabel(
  stored: string | null | undefined,
  sanMoves: readonly string[],
): string | null {
  if (stored && stored.trim()) return stored.trim();
  if (sanMoves.length === 0) return null;
  const found = detectOpening([...sanMoves]);
  return found ? found.name : null;
}
