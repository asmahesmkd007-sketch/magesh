// =====================================================================
// Move classification
// ---------------------------------------------------------------------
// Pure decision logic that turns engine evaluations into a human label
// (brilliant … blunder, plus the "missed X" family). Works on win
// probabilities rather than raw centipawns so a +8 → +5 "loss" in a
// totally winning position is not punished like an equal-position slip.
// All inputs are precomputed by the analyzer; this module is pure and
// unit-tested in isolation.
// =====================================================================
import { Chess, type Move } from "chess.js";

import type { Classification } from "@/lib/chess/classification";
import { MATE_CP } from "@/lib/engine/uci";

import { winProbability } from "./accuracy";

export type ClassifyInput = {
  color: "w" | "b";
  /** White-perspective folded cp of best play from the pre-move position. */
  cpBeforeWhite: number;
  /** White-perspective folded cp of the position after the played move. */
  cpAfterWhite: number;
  /** White-perspective cp of the second-best engine line (null if none). */
  secondCpWhite: number | null;
  /** True when the played move equals the engine's first choice. */
  isBest: boolean;
  legalMoveCount: number;
  isBook: boolean;
  /** The played move gives up material without full compensation in sight. */
  sacrifice: boolean;
  /** The engine's best move is a capture or a check (tactic marker). */
  bestIsTactical: boolean;
  /** Mover had a forced mate available before the move. */
  hadMateBefore: boolean;
  /** Mover still has a forced mate after the move. */
  hasMateAfter: boolean;
};

/** Perspective helpers: fold White-cp into the mover's point of view. */
const forMover = (cpWhite: number, color: "w" | "b") => (color === "w" ? cpWhite : -cpWhite);

export function classifyMove(input: ClassifyInput): Classification {
  const {
    color,
    cpBeforeWhite,
    cpAfterWhite,
    secondCpWhite,
    isBest,
    legalMoveCount,
    isBook,
    sacrifice,
    bestIsTactical,
    hadMateBefore,
    hasMateAfter,
  } = input;

  if (isBook) return "book";
  if (legalMoveCount === 1) return "forced";

  const before = forMover(cpBeforeWhite, color);
  const after = forMover(cpAfterWhite, color);
  const winBefore = winProbability(color === "w" ? cpBeforeWhite : -cpBeforeWhite);
  const winAfter = winProbability(color === "w" ? cpAfterWhite : -cpAfterWhite);
  const drop = Math.max(0, winBefore - winAfter);
  const cpl = Math.max(0, before - after);

  // ── Best-move family ────────────────────────────────────────────────
  if (isBest || cpl <= 5) {
    // Brilliant: a sound sacrifice in a position that wasn't already
    // trivially winning, and the mover stays healthy afterwards.
    if (sacrifice && after >= -50 && before < 600) return "brilliant";
    // Great: effectively the only move that holds — the second-best line
    // collapses the position.
    if (secondCpWhite !== null) {
      const second = forMover(secondCpWhite, color);
      if (before - second >= 150 && after > -100 && second < 100) return "great";
    }
    return "best";
  }

  // ── Missed-x family (checked before generic buckets) ────────────────
  if (hadMateBefore && !hasMateAfter) {
    // Forced mate was on the board and is gone.
    return after >= 400 ? "missedWin" : "missedMate";
  }
  if (winBefore >= 85 && winAfter < 55) {
    return "missedWin";
  }
  if (before >= -80 && before <= 80 && after <= -250) {
    // A holdable (drawish) position was thrown into a lost one.
    return "missedDraw";
  }
  if (cpl >= 150 && bestIsTactical && drop >= 10) {
    return "missedTactic";
  }

  // ── Speculative sacrifices ─────────────────────────────────────────
  if (sacrifice && after > -200) {
    if (cpl <= 150) return "interesting";
    if (cpl <= 300) return "dubious";
  }

  // ── Win-probability buckets (lichess-style 10/20/30 thresholds) ────
  if (drop <= 2) return "excellent";
  if (drop <= 10) return "good";
  if (drop <= 20) return "inaccuracy";
  if (drop <= 30) return "mistake";
  return "blunder";
}

// ── Sacrifice detection ──────────────────────────────────────────────

const PIECE_CP: Record<string, number> = { p: 100, n: 300, b: 320, r: 500, q: 900, k: 0 };

/**
 * Heuristic sacrifice detector. A move is a sacrifice when the mover
 * ends the exchange sequence on its target square materially down —
 * either by capturing something cheaper with an expensive piece that
 * can be recaptured, or by leaving the moved piece hanging. Static
 * exchange evaluation on the destination square keeps it honest for
 * the common cases (Bxh7 Greek gifts, exchange sacs, queen offers).
 */
export function isSacrifice(fenBefore: string, moveUci: string): boolean {
  const chess = new Chess(fenBefore);
  let move: Move;
  try {
    move = chess.move({
      from: moveUci.slice(0, 2),
      to: moveUci.slice(2, 4),
      promotion: (moveUci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
    });
  } catch {
    return false;
  }

  const movedValue = PIECE_CP[move.promotion ?? move.piece] ?? 0;
  if (movedValue < 300) return false; // pawn shoves are never "sacrifices"
  const gained = move.captured ? (PIECE_CP[move.captured] ?? 0) : 0;
  if (gained >= movedValue) return false; // favourable or equal trade

  // Cheapest recapture on the destination square.
  const recaptures = chess.moves({ verbose: true }).filter((m) => m.to === move.to && m.captured);
  if (recaptures.length === 0) return false;

  // If every recapture is itself immediately met by a cheaper re-recapture
  // that restores material, it's a trade, not a sac. One ply of SEE is
  // enough for the classifier's purposes: net = gained − moved + defended.
  const cheapest = recaptures.reduce((a, b) =>
    (PIECE_CP[a.piece] ?? 0) <= (PIECE_CP[b.piece] ?? 0) ? a : b,
  );
  chess.move(cheapest);
  const canCounter = chess.moves({ verbose: true }).some((m) => m.to === move.to && m.captured);
  const recovered = canCounter ? (PIECE_CP[cheapest.piece] ?? 0) : 0;

  const net = gained - movedValue + recovered;
  return net <= -200; // down at least two pawns of material
}

/** True when a UCI move from `fen` is a capture or gives check. */
export function isTacticalMove(fen: string, moveUci: string | null): boolean {
  if (!moveUci) return false;
  const chess = new Chess(fen);
  try {
    const m = chess.move({
      from: moveUci.slice(0, 2),
      to: moveUci.slice(2, 4),
      promotion: (moveUci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
    });
    return Boolean(m.captured) || chess.inCheck();
  } catch {
    return false;
  }
}

/** Mate info for the mover from a White-perspective folded cp. */
export function moverHasMate(cpWhite: number, color: "w" | "b"): boolean {
  const cp = color === "w" ? cpWhite : -cpWhite;
  return cp >= MATE_CP / 2;
}
