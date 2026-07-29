import { describe, expect, it } from "vitest";

import { MATE_CP } from "@/lib/engine/uci";

import { classifyMove, isSacrifice, isTacticalMove, type ClassifyInput } from "./classify";

const base: ClassifyInput = {
  color: "w",
  cpBeforeWhite: 0,
  cpAfterWhite: 0,
  secondCpWhite: null,
  isBest: false,
  legalMoveCount: 30,
  isBook: false,
  sacrifice: false,
  bestIsTactical: false,
  hadMateBefore: false,
  hasMateAfter: false,
};

describe("classifyMove", () => {
  it("book and forced take precedence", () => {
    expect(classifyMove({ ...base, isBook: true, isBest: true })).toBe("book");
    expect(classifyMove({ ...base, legalMoveCount: 1, cpAfterWhite: -300 })).toBe("forced");
  });

  it("labels the engine's first choice best", () => {
    expect(classifyMove({ ...base, isBest: true })).toBe("best");
  });

  it("promotes a sound sacrifice to brilliant", () => {
    expect(
      classifyMove({ ...base, isBest: true, sacrifice: true, cpBeforeWhite: 80, cpAfterWhite: 60 }),
    ).toBe("brilliant");
    // Already crushing → just best, no fireworks needed.
    expect(
      classifyMove({
        ...base,
        isBest: true,
        sacrifice: true,
        cpBeforeWhite: 900,
        cpAfterWhite: 850,
      }),
    ).toBe("best");
  });

  it("labels the only move that holds great", () => {
    expect(
      classifyMove({
        ...base,
        isBest: true,
        cpBeforeWhite: 20,
        cpAfterWhite: 0,
        secondCpWhite: -250,
      }),
    ).toBe("great");
  });

  it("grades by win-probability drop", () => {
    // ~2% drop → excellent, growing drops → worse labels.
    expect(classifyMove({ ...base, cpBeforeWhite: 20, cpAfterWhite: 0 })).toBe("excellent");
    expect(classifyMove({ ...base, cpBeforeWhite: 60, cpAfterWhite: 0 })).toBe("good");
    expect(classifyMove({ ...base, cpBeforeWhite: 120, cpAfterWhite: -10 })).toBe("inaccuracy");
    expect(classifyMove({ ...base, cpBeforeWhite: 250, cpAfterWhite: -30 })).toBe("mistake");
    expect(classifyMove({ ...base, cpBeforeWhite: 400, cpAfterWhite: -400 })).toBe("blunder");
  });

  it("is lenient inside a completely winning position", () => {
    // +8 → +5 is a 300cp loss but barely moves the win probability —
    // it must not grade below "good".
    expect(["excellent", "good"]).toContain(
      classifyMove({ ...base, cpBeforeWhite: 800, cpAfterWhite: 500 }),
    );
  });

  it("detects the missed-mate family", () => {
    expect(
      classifyMove({
        ...base,
        cpBeforeWhite: MATE_CP - 4,
        cpAfterWhite: 50,
        hadMateBefore: true,
        hasMateAfter: false,
      }),
    ).toBe("missedMate");
    // Mate gone but still totally winning → missed win.
    expect(
      classifyMove({
        ...base,
        cpBeforeWhite: MATE_CP - 4,
        cpAfterWhite: 600,
        hadMateBefore: true,
        hasMateAfter: false,
      }),
    ).toBe("missedWin");
  });

  it("detects a missed win from a dominating eval", () => {
    expect(classifyMove({ ...base, cpBeforeWhite: 700, cpAfterWhite: 20 })).toBe("missedWin");
  });

  it("detects a thrown draw", () => {
    expect(classifyMove({ ...base, cpBeforeWhite: 10, cpAfterWhite: -300 })).toBe("missedDraw");
  });

  it("detects a missed tactic", () => {
    expect(
      classifyMove({ ...base, cpBeforeWhite: 250, cpAfterWhite: 40, bestIsTactical: true }),
    ).toBe("missedTactic");
  });

  it("respects the mover's perspective for black", () => {
    // Black improves its position: cpWhite drops.
    expect(classifyMove({ ...base, color: "b", cpBeforeWhite: -700, cpAfterWhite: -20 })).toBe(
      "missedWin",
    );
    expect(classifyMove({ ...base, color: "b", cpBeforeWhite: -20, cpAfterWhite: 0 })).toBe(
      "excellent",
    );
  });

  it("labels speculative sacrifices interesting/dubious", () => {
    expect(classifyMove({ ...base, sacrifice: true, cpBeforeWhite: 30, cpAfterWhite: -70 })).toBe(
      "interesting",
    );
    expect(classifyMove({ ...base, sacrifice: true, cpBeforeWhite: 120, cpAfterWhite: -140 })).toBe(
      "dubious",
    );
  });
});

describe("isSacrifice", () => {
  it("flags the Greek gift", () => {
    // Standard Greek-gift shell: Bd3xh7+ gives up a bishop for a pawn.
    const fen = "rnbq1rk1/ppp1bppp/4pn2/3p4/2PP4/3B1N2/PP2PPPP/RNBQK2R w KQ - 0 1";
    expect(isSacrifice(fen, "d3h7")).toBe(true);
  });

  it("does not flag a normal capture or a pawn push", () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(isSacrifice(start, "e2e4")).toBe(false);
    // Recapturing an equal piece is a trade, not a sacrifice.
    const trade = "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 1";
    expect(isSacrifice(trade, "c3d5")).toBe(false);
  });
});

describe("isTacticalMove", () => {
  const italian = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4";

  it("recognises captures and checks", () => {
    expect(isTacticalMove(italian, "f3e5")).toBe(true); // capture
    expect(isTacticalMove(italian, "c4f7")).toBe(true); // check
    expect(isTacticalMove(italian, "d2d3")).toBe(false); // quiet
    expect(isTacticalMove(italian, null)).toBe(false);
  });
});
