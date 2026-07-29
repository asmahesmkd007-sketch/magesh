import { describe, expect, it } from "vitest";

import { computeLiveStats, countRepetitions, positionKey, readMaterial } from "./stats";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("readMaterial", () => {
  it("counts a full starting array for both sides", () => {
    const { white, black } = readMaterial(START);
    expect(white.counts).toEqual({ p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 });
    expect(black.counts).toEqual({ p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 });
    // 8 pawns + 2*3 + 2*3 + 2*5 + 9 = 39; kings are worth 0.
    expect(white.points).toBe(39);
    expect(black.points).toBe(39);
  });

  it("scores a side up a queen", () => {
    const fen = "4k3/8/8/8/8/8/8/3QK3 w - - 0 1";
    const { white, black } = readMaterial(fen);
    expect(white.points - black.points).toBe(9);
  });

  it("ignores rank separators and empty-square runs", () => {
    const { white, black } = readMaterial("8/8/8/8/8/8/8/8 w - - 0 1");
    expect(white.points).toBe(0);
    expect(black.points).toBe(0);
  });

  it("counts promoted pieces, not just the original set", () => {
    const fen = "4k3/8/8/8/8/8/8/QQQQK3 w - - 0 1";
    expect(readMaterial(fen).white.counts.q).toBe(4);
  });
});

describe("positionKey", () => {
  it("ignores the clocks so repetitions match across move numbers", () => {
    expect(positionKey("8/8/8/8/8/8/8/8 w - - 0 1")).toBe(
      positionKey("8/8/8/8/8/8/8/8 w - - 7 42"),
    );
  });

  it("separates positions that differ only by side to move", () => {
    expect(positionKey("8/8/8/8/8/8/8/8 w - - 0 1")).not.toBe(
      positionKey("8/8/8/8/8/8/8/8 b - - 0 1"),
    );
  });
});

describe("countRepetitions", () => {
  const mv = (ply: number, fen: string, at = "2026-01-01T00:00:00Z") => ({
    ply,
    fen_after: fen,
    created_at: at,
  });

  it("counts the starting position as its own first occurrence", () => {
    expect(countRepetitions(START, [])).toBe(1);
  });

  it("counts a position shuffled back into twice", () => {
    const pos = "r1bqkbnr/pppppppp/2n5/8/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 4 3";
    expect(countRepetitions(pos, [mv(1, "x"), mv(2, pos), mv(3, "y"), mv(4, pos)])).toBe(2);
  });
});

describe("computeLiveStats", () => {
  it("reads the move number off the FEN", () => {
    const stats = computeLiveStats({ fen: "8/8/8/8/8/8/8/8 w - - 0 24", moves: [] });
    expect(stats.moveNumber).toBe(24);
  });

  it("reports material from White's point of view", () => {
    const stats = computeLiveStats({ fen: "4k3/8/8/8/8/8/8/3RK3 w - - 0 1", moves: [] });
    expect(stats.materialAdvantage).toBe(5);
  });

  it("averages move time per side and skips the first gap", () => {
    // White's first move is not charged against the game start, so only
    // plies 2 and 3 produce a measurable gap.
    const stats = computeLiveStats({
      fen: START,
      startedAt: null,
      moves: [
        { ply: 1, fen_after: "a", created_at: "2026-01-01T00:00:00Z" },
        { ply: 2, fen_after: "b", created_at: "2026-01-01T00:00:10Z" },
        { ply: 3, fen_after: "c", created_at: "2026-01-01T00:00:14Z" },
      ],
    });
    expect(stats.avgMoveSeconds.black).toBe(10);
    expect(stats.avgMoveSeconds.white).toBe(4);
  });

  it("has no average before a side has moved", () => {
    const stats = computeLiveStats({ fen: START, moves: [] });
    expect(stats.avgMoveSeconds.white).toBeNull();
    expect(stats.avgMoveSeconds.black).toBeNull();
  });

  it("raises the repetition warning only at threefold", () => {
    const pos = "8/8/8/8/8/8/8/8 w - - 0 1";
    const rep = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ply: i + 1,
        fen_after: pos,
        created_at: "2026-01-01T00:00:00Z",
      }));
    expect(computeLiveStats({ fen: pos, moves: rep(1) }).repetitionWarning).toBe(false);
    expect(computeLiveStats({ fen: pos, moves: rep(3) }).repetitionWarning).toBe(true);
  });

  it("warns as the fifty-move rule comes into range", () => {
    expect(
      computeLiveStats({ fen: "8/8/8/8/8/8/8/8 w - - 79 60", moves: [] }).fiftyMoveWarning,
    ).toBe(false);
    expect(
      computeLiveStats({ fen: "8/8/8/8/8/8/8/8 w - - 80 60", moves: [] }).fiftyMoveWarning,
    ).toBe(true);
  });
});
