// =====================================================================
// Win probability & accuracy math
// ---------------------------------------------------------------------
// Converts engine centipawn evaluations into human-meaningful numbers:
//
//   winProbability(cp)        — expected score for White, 0..100
//   moveAccuracy(before,after)— quality of one move, 0..100
//   gameAccuracy(accuracies)  — per-side game accuracy
//
// The sigmoid coefficient and the accuracy curve follow the widely
// published lichess model so numbers are comparable with what players
// see elsewhere, while remaining a pure local computation.
// =====================================================================
import { MATE_CP } from "@/lib/engine/uci";

const WIN_K = 0.00368208;

/** Expected score for White (0–100) from a White-perspective centipawn eval. */
export function winProbability(cpWhite: number): number {
  const cp = Math.max(-1500, Math.min(1500, cpWhite));
  // Mate sentinels sit far outside the clamp — send them to the rails.
  if (cpWhite >= MATE_CP / 2) return 100;
  if (cpWhite <= -MATE_CP / 2) return 0;
  return 50 + 50 * (2 / (1 + Math.exp(-WIN_K * cp)) - 1);
}

/**
 * Accuracy of a single move (0–100) from the mover's win probability
 * before and after the move. A move that keeps or improves the win
 * probability scores 100.
 */
export function moveAccuracy(winBeforePct: number, winAfterPct: number): number {
  if (winAfterPct >= winBeforePct) return 100;
  const delta = winBeforePct - winAfterPct;
  const raw = 103.1668 * Math.exp(-0.04354 * delta) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Game accuracy for one side: the mean of a simple average and a
 * harmonic average of the per-move accuracies. The harmonic term makes
 * single large errors cost more than many tiny ones — matching how the
 * result actually feels.
 */
export function gameAccuracy(accuracies: number[]): number | null {
  if (accuracies.length === 0) return null;
  const mean = accuracies.reduce((s, v) => s + v, 0) / accuracies.length;
  const harmonic = accuracies.length / accuracies.reduce((s, v) => s + 1 / Math.max(1, v), 0);
  return Math.round(((mean + harmonic) / 2) * 10) / 10;
}
