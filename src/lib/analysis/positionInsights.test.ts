import { describe, expect, it } from "vitest";

import { analyzePositionInsights } from "./positionInsights";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("analyzePositionInsights", () => {
  it("reads the starting position sensibly", () => {
    const ins = analyzePositionInsights(START);
    expect(ins.white.materialPawns).toBeCloseTo(39.4, 1);
    expect(ins.black.materialPawns).toBeCloseTo(39.4, 1);
    expect(ins.white.mobility).toBe(20);
    expect(ins.black.mobility).toBe(20);
    expect(ins.white.pawns.islands).toBe(1);
    expect(ins.white.pawns.passed).toEqual([]);
    expect(ins.white.pawns.isolated).toEqual([]);
    expect(ins.white.developed).toBe(0);
    expect(ins.white.castled).toBe(false);
    expect(ins.white.kingSafety.rating).toBe("safe");
    expect(ins.threats).toEqual([]);
    expect(ins.sideToMove).toBe("w");
  });

  it("detects passed, isolated and doubled pawns", () => {
    // White: a-pawn isolated+passed, doubled c-pawns; Black: lone h-pawn.
    const fen = "4k3/7p/8/8/2P5/2P5/P7/4K3 w - - 0 1";
    const ins = analyzePositionInsights(fen);
    expect(ins.white.pawns.passed).toContain("a2");
    expect(ins.white.pawns.isolated).toContain("a2");
    expect(ins.white.pawns.doubled).toEqual(expect.arrayContaining(["c3", "c4"]));
    expect(ins.white.pawns.islands).toBe(2);
    expect(ins.black.pawns.passed).toContain("h7");
  });

  it("flags an exposed king", () => {
    // Black king stripped of pawn cover with heavy pieces bearing down.
    const fen = "6k1/8/8/8/8/8/5PPP/3QR1K1 w - - 0 1";
    const ins = analyzePositionInsights(fen);
    expect(ins.black.kingSafety.shieldPawns).toBe(0);
    expect(["wary", "exposed"]).toContain(ins.black.kingSafety.rating);
    expect(ins.white.kingSafety.rating).toBe("safe");
  });

  it("spots hanging material as a threat", () => {
    // White to move; the black queen on d5 is capturable by the c4 pawn.
    const fen = "rnb1kbnr/ppp1pppp/8/3q4/2P5/8/PP1PPPPP/RNBQKBNR w KQkq - 0 3";
    const ins = analyzePositionInsights(fen);
    expect(ins.threats.some((t) => t.san === "cxd5")).toBe(true);
  });

  it("reports mate-in-one as the top idea", () => {
    // Back-rank: Re8#.
    const fen = "6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1";
    const ins = analyzePositionInsights(fen);
    expect(ins.threats[0]?.description).toContain("checkmate");
  });

  it("tracks development and castling", () => {
    // Italian after short castles.
    const fen = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4";
    const ins = analyzePositionInsights(fen);
    expect(ins.white.castled).toBe(true);
    expect(ins.white.developed).toBeGreaterThanOrEqual(2);
    expect(ins.black.castled).toBe(false);
  });
});
