import { describe, expect, it } from "vitest";

import type { AnalyzedMove } from "./types";
import {
  buildGameReview,
  buildPhaseSummaries,
  findCriticalMoments,
  materialBalanceFromFen,
  phaseBoundaries,
} from "./review";

/** Minimal synthetic move for report-shaping tests. */
function move(overrides: Partial<AnalyzedMove> & { ply: number }): AnalyzedMove {
  const color = overrides.ply % 2 === 1 ? "w" : "b";
  return {
    san: "e4",
    uci: "e2e4",
    color,
    fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    evalBefore: { cpWhite: 0, mateIn: null, depth: 12 },
    evalAfter: { cpWhite: 0, mateIn: null, depth: 12 },
    bestUci: "e2e4",
    bestSan: "e4",
    bestLineSan: ["e4"],
    secondCpWhite: null,
    cpl: 0,
    accuracy: 100,
    classification: "best",
    legalMoveCount: 20,
    isBook: false,
    sacrifice: false,
    ...overrides,
  };
}

describe("materialBalanceFromFen", () => {
  it("is zero at the start", () => {
    expect(materialBalanceFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(
      0,
    );
  });

  it("counts an extra queen for white", () => {
    expect(materialBalanceFromFen("4k3/8/8/8/8/8/8/Q3K3 w - - 0 1")).toBe(9);
  });

  it("counts a black minor-piece edge", () => {
    expect(materialBalanceFromFen("4k3/8/2n5/8/8/8/8/4K3 w - - 0 1")).toBe(-3);
  });
});

describe("phaseBoundaries", () => {
  it("uses book plies for the opening and material for the endgame", () => {
    const kingPawnFen = "8/8/4k3/8/4P3/4K3/8/8 b - - 0 40";
    const moves = [
      ...Array.from({ length: 20 }, (_, i) => move({ ply: i + 1 })),
      move({ ply: 21, fenAfter: kingPawnFen }),
      move({ ply: 22, fenAfter: kingPawnFen }),
    ];
    const { openingEnd, endgameStart } = phaseBoundaries(moves, 12);
    expect(openingEnd).toBe(12);
    expect(endgameStart).toBe(21);
  });

  it("clamps the opening for unbook'd short games", () => {
    const moves = Array.from({ length: 6 }, (_, i) => move({ ply: i + 1 }));
    const { openingEnd, endgameStart } = phaseBoundaries(moves, 0);
    expect(openingEnd).toBe(6);
    expect(endgameStart).toBeNull();
  });
});

describe("buildPhaseSummaries", () => {
  it("splits accuracy per side and phase", () => {
    const moves = [
      move({ ply: 1, accuracy: 90 }),
      move({ ply: 2, accuracy: 70 }),
      ...Array.from({ length: 10 }, (_, i) => move({ ply: i + 3, accuracy: 80 })),
    ];
    const phases = buildPhaseSummaries(moves, 2);
    expect(phases[0].phase).toBe("opening");
    expect(phases[0].accuracyWhite).not.toBeNull();
    expect(phases.some((p) => p.phase === "middlegame")).toBe(true);
    for (const p of phases) expect(p.comment.length).toBeGreaterThan(0);
  });
});

describe("findCriticalMoments", () => {
  it("collects blunders, brilliancies and missed chances in game order", () => {
    const moves = [
      move({ ply: 1, classification: "brilliant" }),
      move({
        ply: 2,
        classification: "blunder",
        evalBefore: { cpWhite: 0, mateIn: null, depth: 12 },
        evalAfter: { cpWhite: 450, mateIn: null, depth: 12 },
      }),
      move({ ply: 3, classification: "missedWin", bestSan: "Qh5" }),
      move({ ply: 4, classification: "good" }),
    ];
    const moments = findCriticalMoments(moves);
    expect(moments.map((m) => m.ply)).toEqual([1, 2, 3]);
    expect(moments[0].kind).toBe("brilliancy");
    expect(moments[1].kind === "blunder" || moments[1].kind === "turning-point").toBe(true);
    expect(moments[2].kind).toBe("missed-chance");
    expect(moments[2].description).toContain("Qh5");
  });
});

describe("buildGameReview", () => {
  it("aggregates accuracy, acpl, counts and series", () => {
    const moves = [
      move({ ply: 1, accuracy: 95, cpl: 10, classification: "excellent" }),
      move({ ply: 2, accuracy: 60, cpl: 150, classification: "mistake" }),
      move({ ply: 3, accuracy: 100, cpl: 0, classification: "best" }),
      move({ ply: 4, accuracy: 30, cpl: 400, classification: "blunder" }),
    ];
    const review = buildGameReview(moves, { depth: 14, openingName: "Test", openingEco: "A00" });

    expect(review.accuracyWhite).not.toBeNull();
    expect(review.accuracyBlack).not.toBeNull();
    expect(review.accuracyWhite!).toBeGreaterThan(review.accuracyBlack!);
    expect(review.acplWhite).toBe(5);
    expect(review.acplBlack).toBe(275);
    expect(review.classCountsWhite.excellent).toBe(1);
    expect(review.classCountsBlack.blunder).toBe(1);
    // Series carry one entry per position (start + one per move).
    expect(review.evals).toHaveLength(5);
    expect(review.winProbabilities).toHaveLength(5);
    expect(review.materialBalance).toHaveLength(5);
    expect(review.openingName).toBe("Test");
    expect(review.depth).toBe(14);
  });

  it("handles an empty game", () => {
    const review = buildGameReview([], { depth: 14 });
    expect(review.accuracyWhite).toBeNull();
    expect(review.evals).toEqual([]);
    expect(review.phases).toEqual([]);
    expect(review.criticalMoments).toEqual([]);
  });
});
