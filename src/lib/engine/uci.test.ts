import { describe, expect, it } from "vitest";

import {
  formatScore,
  isUciMove,
  MATE_CP,
  parseBestMove,
  parseInfoLine,
  scoreForWhite,
  scoreToCp,
} from "./uci";

describe("isUciMove", () => {
  it("accepts plain and promotion moves", () => {
    expect(isUciMove("e2e4")).toBe(true);
    expect(isUciMove("e7e8q")).toBe(true);
    expect(isUciMove("a1h8")).toBe(true);
  });

  it("rejects junk", () => {
    expect(isUciMove("e2e9")).toBe(false);
    expect(isUciMove("0000")).toBe(false);
    expect(isUciMove("(none)")).toBe(false);
    expect(isUciMove("e2e4x")).toBe(false);
  });
});

describe("parseInfoLine", () => {
  const LINE =
    "info depth 22 seldepth 30 multipv 1 score cp 34 nodes 4180512 nps 951544 hashfull 400 tbhits 0 time 4394 pv e2e4 e7e5 g1f3";

  it("parses a full info line", () => {
    const info = parseInfoLine(LINE);
    expect(info).not.toBeNull();
    expect(info!.depth).toBe(22);
    expect(info!.seldepth).toBe(30);
    expect(info!.multipv).toBe(1);
    expect(info!.score).toEqual({ type: "cp", value: 34 });
    expect(info!.nodes).toBe(4180512);
    expect(info!.nps).toBe(951544);
    expect(info!.timeMs).toBe(4394);
    expect(info!.pv).toEqual(["e2e4", "e7e5", "g1f3"]);
  });

  it("parses mate scores and multipv ranks", () => {
    const info = parseInfoLine("info depth 12 multipv 3 score mate -4 pv d8h4 g2g3");
    expect(info!.score).toEqual({ type: "mate", value: -4 });
    expect(info!.multipv).toBe(3);
  });

  it("captures bound annotations", () => {
    const info = parseInfoLine("info depth 10 score cp 55 lowerbound pv e2e4");
    expect(info!.bound).toBe("lower");
  });

  it("ignores lines without a pv or score", () => {
    expect(parseInfoLine("info string NNUE evaluation using nn-1c0000000000.nnue")).toBeNull();
    expect(parseInfoLine("info depth 5 currmove e2e4 currmovenumber 1")).toBeNull();
    expect(parseInfoLine("bestmove e2e4")).toBeNull();
  });
});

describe("parseBestMove", () => {
  it("parses bestmove with ponder", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toEqual({ move: "e2e4", ponder: "e7e5" });
  });

  it("handles terminal positions", () => {
    expect(parseBestMove("bestmove (none)")).toEqual({ move: null, ponder: null });
  });

  it("returns null for other lines", () => {
    expect(parseBestMove("readyok")).toBeNull();
  });
});

describe("score helpers", () => {
  it("folds mate scores beyond any cp value", () => {
    expect(scoreToCp({ type: "mate", value: 3 })).toBe(MATE_CP - 3);
    expect(scoreToCp({ type: "mate", value: -2 })).toBe(-MATE_CP + 2);
    expect(scoreToCp({ type: "mate", value: 1 })).toBeGreaterThan(
      scoreToCp({ type: "mate", value: 5 }),
    );
    expect(scoreToCp({ type: "cp", value: 250 })).toBe(250);
  });

  it("flips perspective for black to move", () => {
    expect(scoreForWhite({ type: "cp", value: 50 }, "b")).toEqual({ type: "cp", value: -50 });
    expect(scoreForWhite({ type: "mate", value: 2 }, "b")).toEqual({ type: "mate", value: -2 });
    expect(scoreForWhite({ type: "cp", value: 50 }, "w")).toEqual({ type: "cp", value: 50 });
  });

  it("formats scores for display", () => {
    expect(formatScore({ type: "cp", value: 142 })).toBe("+1.42");
    expect(formatScore({ type: "cp", value: -30 })).toBe("-0.30");
    expect(formatScore({ type: "mate", value: 5 })).toBe("M5");
    expect(formatScore({ type: "mate", value: -2 })).toBe("-M2");
  });
});
