import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import {
  checkedKingSquare,
  claimableDraw,
  halfmoveClock,
  hasMatingMaterial,
  positionKey,
  positionKeysOf,
  repetitionCount,
  terminalStateOf,
} from "./rules";

/** Play a list of SAN moves onto a fresh (or supplied) game. */
function play(sans: string[], chess = new Chess()): Chess {
  for (const san of sans) chess.move(san);
  return chess;
}

describe("checkmate", () => {
  it("awards Fool's Mate to Black (the mated side is the side to move)", () => {
    const chess = play(["f3", "e5", "g4", "Qh4#"]);
    expect(chess.turn()).toBe("w");
    expect(terminalStateOf(chess)).toEqual({
      result: "black",
      reason: "checkmate",
      automatic: true,
    });
  });

  it("awards Scholar's Mate to White", () => {
    const chess = play(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
    expect(chess.turn()).toBe("b");
    expect(terminalStateOf(chess)?.result).toBe("white");
  });

  it("detects mate from a bare FEN with no move history", () => {
    // The server builds `new Chess(storedFen)` — mate must still resolve.
    const chess = new Chess("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
    expect(terminalStateOf(chess)).toEqual({
      result: "black",
      reason: "checkmate",
      automatic: true,
    });
  });
});

describe("stalemate", () => {
  it("is a draw and is never reported as fifty-move", () => {
    const chess = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(chess.isStalemate()).toBe(true);
    expect(terminalStateOf(chess)).toEqual({
      result: "draw",
      reason: "stalemate",
      automatic: true,
    });
  });
});

describe("insufficient material", () => {
  it.each([
    ["king vs king", "8/8/4k3/8/8/4K3/8/8 w - - 0 1"],
    ["king+bishop vs king", "8/8/4k3/8/8/4K3/8/5B2 w - - 0 1"],
    ["king+knight vs king", "8/8/4k3/8/8/4K3/8/5N2 w - - 0 1"],
  ])("reports %s as insufficient, not fifty-move", (_label, fen) => {
    expect(terminalStateOf(new Chess(fen))).toEqual({
      result: "draw",
      reason: "insufficient",
      automatic: true,
    });
  });
});

describe("repetition", () => {
  // Knights shuffling back and forth repeats the position exactly.
  const CYCLE = ["Nf3", "Nf6", "Ng1", "Ng8"];

  it("counts the starting position as one occurrence", () => {
    expect(repetitionCount(new Chess())).toBe(1);
  });

  it("does not fire before the third occurrence", () => {
    const chess = play(CYCLE);
    expect(repetitionCount(chess)).toBe(2);
    expect(terminalStateOf(chess)).toBeNull();
  });

  it("draws by threefold on the third occurrence", () => {
    const chess = play([...CYCLE, ...CYCLE]);
    expect(repetitionCount(chess)).toBe(3);
    expect(terminalStateOf(chess)).toEqual({
      result: "draw",
      reason: "repetition",
      automatic: false,
    });
  });

  it("marks threefold as claimable and fivefold as automatic", () => {
    const three = play([...CYCLE, ...CYCLE]);
    expect(claimableDraw(three)).toBe("repetition");

    const five = play([...CYCLE, ...CYCLE, ...CYCLE, ...CYCLE]);
    expect(repetitionCount(five)).toBe(5);
    const terminal = terminalStateOf(five);
    expect(terminal).toEqual({ result: "draw", reason: "fivefold", automatic: true });
    expect(claimableDraw(five)).toBeNull();
  });

  it("ignores halfmove/fullmove counters when matching positions", () => {
    const a = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const b = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 9 42";
    expect(positionKey(a)).toBe(positionKey(b));
  });

  it("distinguishes positions that differ only in castling rights", () => {
    const withRights = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    const withoutRights = "r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1";
    expect(positionKey(withRights)).not.toBe(positionKey(withoutRights));
  });

  // The regression that mattered most: the server validates moves against a
  // stored FEN, so its Chess instance remembers nothing. Without the prior
  // keys, repetition was undetectable in every multiplayer game.
  it("detects repetition on a FEN-only instance via priorPositionKeys", () => {
    const full = play([...CYCLE, ...CYCLE]);
    expect(terminalStateOf(full)?.reason).toBe("repetition");

    const fenOnly = new Chess(full.fen());
    expect(fenOnly.isThreefoldRepetition()).toBe(false);
    expect(terminalStateOf(fenOnly)).toBeNull();

    // Replay what the server would read back from game_moves.fen_after.
    const priorKeys = positionKeysOf(full).slice(0, -1);
    expect(terminalStateOf(fenOnly, priorKeys)).toEqual({
      result: "draw",
      reason: "repetition",
      automatic: false,
    });
  });
});

describe("move-count draws", () => {
  /** A position whose halfmove clock is set to `n`. */
  const withClock = (n: number) => new Chess(`8/8/3k4/8/8/3K4/7R/8 w - - ${n} ${60 + n}`);

  it("does not draw before 100 halfmoves", () => {
    expect(halfmoveClock(withClock(99))).toBe(99);
    expect(terminalStateOf(withClock(99))).toBeNull();
  });

  it("draws by the fifty-move rule at 100 halfmoves, as claimable", () => {
    expect(terminalStateOf(withClock(100))).toEqual({
      result: "draw",
      reason: "fifty-move",
      automatic: false,
    });
  });

  it("escalates to the seventy-five-move rule at 150 halfmoves, automatically", () => {
    expect(terminalStateOf(withClock(150))).toEqual({
      result: "draw",
      reason: "seventy-five-move",
      automatic: true,
    });
  });

  it("scores mate ahead of an expired fifty-move counter", () => {
    // Black to move is mated (Qg7# supported by Kf6); the halfmove clock
    // is well past 100, so a draw-first ordering would misreport this.
    const chess = new Chess("7k/6Q1/5K2/8/8/8/8/8 b - - 120 90");
    expect(chess.isCheckmate()).toBe(true);
    expect(terminalStateOf(chess)).toEqual({
      result: "white",
      reason: "checkmate",
      automatic: true,
    });
  });
});

describe("hasMatingMaterial (FIDE 6.9 — flag fall vs. bare pieces)", () => {
  it.each([
    ["lone king", "8/8/4k3/8/8/4K3/8/8 w - - 0 1", false],
    ["king + one knight", "8/8/4k3/8/8/4K3/8/5N2 w - - 0 1", false],
    ["king + one bishop", "8/8/4k3/8/8/4K3/8/5B2 w - - 0 1", false],
    ["king + two knights", "8/8/4k3/8/8/4K3/8/4NN2 w - - 0 1", true],
    ["king + bishop pair", "8/8/4k3/8/8/4K3/8/4BB2 w - - 0 1", true],
    ["king + one pawn", "8/8/4k3/8/8/4K3/4P3/8 w - - 0 1", true],
    ["king + rook", "8/8/4k3/8/8/4K3/8/5R2 w - - 0 1", true],
    ["king + queen", "8/8/4k3/8/8/4K3/8/5Q2 w - - 0 1", true],
  ])("%s → %s", (_label, fen, expected) => {
    expect(hasMatingMaterial(new Chess(fen), "w")).toBe(expected);
  });

  it("judges each side independently", () => {
    // White has a rook; Black has only a knight.
    const chess = new Chess("8/8/4k1n1/8/8/4K3/8/5R2 w - - 0 1");
    expect(hasMatingMaterial(chess, "w")).toBe(true);
    expect(hasMatingMaterial(chess, "b")).toBe(false);
  });
});

describe("checkedKingSquare", () => {
  it("returns null when nobody is in check", () => {
    expect(checkedKingSquare(new Chess())).toBeNull();
  });

  it("locates the king of the side to move", () => {
    const chess = play(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7+"]);
    expect(checkedKingSquare(chess)).toBe("e8");
  });
});

describe("ongoing positions", () => {
  it("reports no terminal state for a normal opening", () => {
    expect(terminalStateOf(play(["e4", "e5", "Nf3", "Nc6"]))).toBeNull();
  });
});
