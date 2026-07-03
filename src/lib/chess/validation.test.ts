import { describe, it, expect } from "vitest";
import { isValidFen, isValidPgn, loadPgnSafe, START_FEN } from "./validation";

describe("isValidFen", () => {
  it("accepts the start position", () => {
    expect(isValidFen(START_FEN)).toBe(true);
  });
  it("accepts a mid-game position", () => {
    expect(isValidFen("rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2")).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isValidFen("not a fen")).toBe(false);
    expect(isValidFen("")).toBe(false);
  });
});

describe("isValidPgn / loadPgnSafe", () => {
  const pgn = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6";
  it("accepts a legal PGN and extracts SAN", () => {
    expect(isValidPgn(pgn)).toBe(true);
    const loaded = loadPgnSafe(pgn);
    expect(loaded).not.toBeNull();
    expect(loaded!.sans.slice(0, 3)).toEqual(["e4", "e5", "Nf3"]);
  });
  it("rejects an illegal PGN without throwing", () => {
    expect(loadPgnSafe("1. e9 z2")).toBeNull();
  });
});
