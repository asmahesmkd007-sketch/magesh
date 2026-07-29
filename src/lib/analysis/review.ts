// =====================================================================
// Game review builder
// ---------------------------------------------------------------------
// Turns the analyzer's per-move output into the full review report:
// per-side accuracy & ACPL, classification tallies, phase summaries
// (opening / middlegame / endgame), critical moments, win-probability
// and material series for the charts. Pure functions — no engine, no
// network — so the whole report is unit-testable.
// =====================================================================
import type { Classification } from "@/lib/chess/classification";
import { CLASS_LABEL } from "@/lib/chess/classification";

import { gameAccuracy, winProbability } from "./accuracy";
import type { AnalyzedMove, CriticalMoment, GamePhase, GameReview, PhaseSummary } from "./types";

// ── Material helpers ─────────────────────────────────────────────────
const PIECE_PAWNS: Record<string, number> = { p: 1, n: 3, b: 3.2, r: 5, q: 9 };

/** White − Black material difference in pawns, from a FEN board field. */
export function materialBalanceFromFen(fen: string): number {
  const board = fen.split(" ")[0] ?? "";
  let balance = 0;
  for (const ch of board) {
    const lower = ch.toLowerCase();
    const v = PIECE_PAWNS[lower];
    if (!v) continue;
    balance += ch === lower ? -v : v;
  }
  return Math.round(balance * 10) / 10;
}

/** Total non-pawn, non-king material on the board in centipawns. */
function nonPawnMaterial(fen: string): number {
  const board = fen.split(" ")[0] ?? "";
  let total = 0;
  for (const ch of board) {
    const lower = ch.toLowerCase();
    if (lower === "n" || lower === "b") total += 310;
    else if (lower === "r") total += 500;
    else if (lower === "q") total += 900;
  }
  return total;
}

// ── Phases ───────────────────────────────────────────────────────────

/**
 * Phase boundaries: the opening runs to the last book ply (at least 8
 * plies for unbook'd games, at most 24); the endgame starts when total
 * non-pawn material drops to roughly rook+minor per side.
 */
export function phaseBoundaries(
  moves: AnalyzedMove[],
  bookPlies: number,
): { openingEnd: number; endgameStart: number | null } {
  const lastPly = moves.length > 0 ? moves[moves.length - 1].ply : 0;
  const openingEnd = Math.min(Math.max(bookPlies, 8), 24, lastPly);
  let endgameStart: number | null = null;
  for (const m of moves) {
    if (m.ply <= openingEnd) continue;
    if (nonPawnMaterial(m.fenAfter) <= 1700) {
      endgameStart = m.ply;
      break;
    }
  }
  return { openingEnd, endgameStart };
}

function phaseAccuracy(moves: AnalyzedMove[], color: "w" | "b"): number | null {
  const accs = moves.filter((m) => m.color === color).map((m) => m.accuracy);
  return gameAccuracy(accs);
}

function phaseComment(phase: GamePhase, aw: number | null, ab: number | null): string {
  const fmt = (v: number | null) => (v === null ? null : Math.round(v));
  const w = fmt(aw);
  const b = fmt(ab);
  if (w === null && b === null) return "No moves in this phase.";
  if (w !== null && b !== null) {
    if (Math.abs(w - b) < 3)
      return `Evenly played — both sides around ${Math.round((w + b) / 2)}% accuracy.`;
    const [leader, follower, lw, lb] = w > b ? ["White", "Black", w, b] : ["Black", "White", b, w];
    return `${leader} handled this phase better (${lw}% vs ${follower}'s ${lb}%).`;
  }
  return w !== null
    ? `Only White moved in this phase (${w}%).`
    : `Only Black moved in this phase (${b}%).`;
}

export function buildPhaseSummaries(moves: AnalyzedMove[], bookPlies: number): PhaseSummary[] {
  if (moves.length === 0) return [];
  const { openingEnd, endgameStart } = phaseBoundaries(moves, bookPlies);
  const lastPly = moves[moves.length - 1].ply;

  const ranges: { phase: GamePhase; from: number; to: number }[] = [];
  ranges.push({ phase: "opening", from: 1, to: openingEnd });
  if (endgameStart !== null && endgameStart > openingEnd + 1) {
    ranges.push({ phase: "middlegame", from: openingEnd + 1, to: endgameStart - 1 });
    ranges.push({ phase: "endgame", from: endgameStart, to: lastPly });
  } else if (endgameStart !== null) {
    ranges.push({ phase: "endgame", from: endgameStart, to: lastPly });
  } else if (lastPly > openingEnd) {
    ranges.push({ phase: "middlegame", from: openingEnd + 1, to: lastPly });
  }

  return ranges.map(({ phase, from, to }) => {
    const slice = moves.filter((m) => m.ply >= from && m.ply <= to);
    const aw = phaseAccuracy(slice, "w");
    const ab = phaseAccuracy(slice, "b");
    return {
      phase,
      fromPly: from,
      toPly: to,
      accuracyWhite: aw,
      accuracyBlack: ab,
      comment: phaseComment(phase, aw, ab),
    };
  });
}

// ── Critical moments ─────────────────────────────────────────────────

const MOMENT_SWING_MIN = 15;

export function findCriticalMoments(moves: AnalyzedMove[]): CriticalMoment[] {
  const out: CriticalMoment[] = [];

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const winBefore = winProbability(m.evalBefore.cpWhite);
    const winAfter = winProbability(m.evalAfter.cpWhite);
    const swing = Math.abs(winAfter - winBefore);
    const side = m.color === "w" ? "White" : "Black";

    if (m.classification === "brilliant" || m.classification === "great") {
      out.push({
        ply: m.ply,
        san: m.san,
        color: m.color,
        swing,
        classification: m.classification,
        kind: "brilliancy",
        description: `${side} found ${m.san} — ${CLASS_LABEL[m.classification].toLowerCase()}.`,
      });
      continue;
    }

    const crossed =
      (winBefore - 50) * (winAfter - 50) < 0 && Math.abs(winAfter - winBefore) >= MOMENT_SWING_MIN;
    const isMissed =
      m.classification === "miss" ||
      m.classification === "missedWin" ||
      m.classification === "missedDraw" ||
      m.classification === "missedTactic" ||
      m.classification === "missedMate";

    if (m.classification === "blunder" && swing >= MOMENT_SWING_MIN) {
      out.push({
        ply: m.ply,
        san: m.san,
        color: m.color,
        swing,
        classification: m.classification,
        kind: crossed ? "turning-point" : "blunder",
        description: crossed
          ? `${m.san} handed over the advantage — the game turned here.`
          : `${m.san} was a blunder${m.bestSan ? ` — ${m.bestSan} kept ${side} in the game` : ""}.`,
      });
    } else if (isMissed) {
      out.push({
        ply: m.ply,
        san: m.san,
        color: m.color,
        swing,
        classification: m.classification,
        kind: "missed-chance",
        description: `${side} missed ${m.bestSan ?? "a stronger continuation"} (${CLASS_LABEL[m.classification].toLowerCase()}).`,
      });
    } else if (crossed && swing >= MOMENT_SWING_MIN) {
      out.push({
        ply: m.ply,
        san: m.san,
        color: m.color,
        swing,
        classification: m.classification,
        kind: "turning-point",
        description: `The evaluation swung ${Math.round(swing)} points around ${m.san}.`,
      });
    }
  }

  // Keep the 10 largest swings, in game order.
  return out
    .sort((a, b) => b.swing - a.swing)
    .slice(0, 10)
    .sort((a, b) => a.ply - b.ply);
}

// ── Full report ──────────────────────────────────────────────────────

export function buildGameReview(
  moves: AnalyzedMove[],
  opts: {
    bookPlies?: number;
    openingName?: string | null;
    openingEco?: string | null;
    depth: number;
  },
): GameReview {
  const bookPlies = opts.bookPlies ?? 0;

  const accW: number[] = [];
  const accB: number[] = [];
  const cplW: number[] = [];
  const cplB: number[] = [];
  const countsW: Partial<Record<Classification, number>> = {};
  const countsB: Partial<Record<Classification, number>> = {};

  for (const m of moves) {
    if (m.color === "w") {
      accW.push(m.accuracy);
      cplW.push(m.cpl);
      countsW[m.classification] = (countsW[m.classification] ?? 0) + 1;
    } else {
      accB.push(m.accuracy);
      cplB.push(m.cpl);
      countsB[m.classification] = (countsB[m.classification] ?? 0) + 1;
    }
  }

  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null;

  // Position series: index 0 = starting position, i = after move i.
  const evals: number[] = [];
  const winProbabilities: number[] = [];
  const materialBalance: number[] = [];
  if (moves.length > 0) {
    evals.push(moves[0].evalBefore.cpWhite);
    winProbabilities.push(winProbability(moves[0].evalBefore.cpWhite));
    materialBalance.push(materialBalanceFromFen(moves[0].fenBefore));
    for (const m of moves) {
      evals.push(m.evalAfter.cpWhite);
      winProbabilities.push(winProbability(m.evalAfter.cpWhite));
      materialBalance.push(materialBalanceFromFen(m.fenAfter));
    }
  }

  return {
    moves,
    accuracyWhite: gameAccuracy(accW),
    accuracyBlack: gameAccuracy(accB),
    acplWhite: avg(cplW),
    acplBlack: avg(cplB),
    classCountsWhite: countsW,
    classCountsBlack: countsB,
    phases: buildPhaseSummaries(moves, bookPlies),
    criticalMoments: findCriticalMoments(moves),
    winProbabilities,
    evals,
    materialBalance,
    openingName: opts.openingName ?? null,
    openingEco: opts.openingEco ?? null,
    depth: opts.depth,
  };
}
