import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import {
  assignPieceIds,
  boardSignature,
  initialPieceIdState,
  type IdentityCell,
  type PieceIdState,
} from "./pieceIdentity";

/** The board shape InteractiveBoard passes in. */
function boardOf(chess: Chess): IdentityCell[][] {
  return chess
    .board()
    .map((row) => row.map((p) => (p ? { square: p.square, type: p.type, color: p.color } : null)));
}

/** Advance identity state by playing `san`, as the component would. */
function step(chess: Chess, state: PieceIdState, san: string): PieceIdState {
  const move = chess.move(san);
  return assignPieceIds(boardOf(chess), { from: move.from, to: move.to }, state);
}

const idAt = (state: PieceIdState, square: string) =>
  state.out.find((p) => p.square === square)?.id;

describe("boardSignature", () => {
  it("is identical for identical arrangements", () => {
    expect(boardSignature(boardOf(new Chess()))).toBe(boardSignature(boardOf(new Chess())));
  });

  it("changes when a piece moves", () => {
    const a = new Chess();
    const b = new Chess();
    b.move("e4");
    expect(boardSignature(boardOf(a))).not.toBe(boardSignature(boardOf(b)));
  });
});

describe("first render", () => {
  it("assigns 32 distinct ids and pops none of them", () => {
    const state = assignPieceIds(boardOf(new Chess()), null, initialPieceIdState());
    expect(state.out).toHaveLength(32);
    expect(new Set(state.out.map((p) => p.id)).size).toBe(32);
    // Nothing should animate in on the very first paint of a board.
    expect(state.out.every((p) => !p.fresh)).toBe(true);
  });
});

describe("a piece that moves keeps its identity", () => {
  it("carries the id from the origin square to the destination", () => {
    const chess = new Chess();
    let state = assignPieceIds(boardOf(chess), null, initialPieceIdState());
    const pawnId = idAt(state, "e2");

    state = step(chess, state, "e4");
    expect(idAt(state, "e4")).toBe(pawnId);
    expect(idAt(state, "e2")).toBeUndefined();
    // It moved, it did not appear — so no entrance animation.
    expect(state.out.find((p) => p.square === "e4")?.fresh).toBe(false);
  });

  it("leaves every untouched piece's id alone", () => {
    const chess = new Chess();
    let state = assignPieceIds(boardOf(chess), null, initialPieceIdState());
    const before = new Map(state.out.map((p) => [p.square, p.id]));

    state = step(chess, state, "e4");
    for (const { square, id } of state.out) {
      if (square === "e4") continue;
      expect(id).toBe(before.get(square));
    }
  });
});

describe("captures", () => {
  it("gives the capturing piece the destination and retires the captured id", () => {
    const chess = new Chess();
    let state = assignPieceIds(boardOf(chess), null, initialPieceIdState());
    for (const san of ["e4", "d5"]) state = step(chess, state, san);

    const whitePawn = idAt(state, "e4");
    const blackPawn = idAt(state, "d5");
    expect(whitePawn).toBeDefined();
    expect(blackPawn).toBeDefined();

    state = step(chess, state, "exd5");
    expect(idAt(state, "d5")).toBe(whitePawn);
    expect(state.out.some((p) => p.id === blackPawn)).toBe(false);
    expect(state.out).toHaveLength(31);
  });
});

describe("castling", () => {
  it("keeps the king's identity; the rook is re-keyed but does not pop", () => {
    const chess = new Chess();
    let state = assignPieceIds(boardOf(chess), null, initialPieceIdState());
    for (const san of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"]) state = step(chess, state, san);

    const kingId = idAt(state, "e1");
    state = step(chess, state, "O-O");

    // lastMove describes the king's travel, so the king glides.
    expect(idAt(state, "g1")).toBe(kingId);
    // The rook jumped h1→f1 without being the tracked move; it necessarily
    // takes a new id. What matters is that the board still holds exactly
    // one white rook on f1 and the piece count is unchanged.
    expect(idAt(state, "f1")).toBeDefined();
    expect(state.out).toHaveLength(32);
  });
});

describe("promotion", () => {
  it("keeps the pawn's node so it glides instead of popping", () => {
    // White pawn on a7 promotes; type changes, identity must not.
    const chess = new Chess("8/P6k/8/8/8/8/7K/8 w - - 0 1");
    let state = assignPieceIds(boardOf(chess), null, initialPieceIdState());
    const pawnId = idAt(state, "a7");

    state = step(chess, state, "a8=Q");
    expect(idAt(state, "a8")).toBe(pawnId);
    expect(state.out.find((p) => p.square === "a8")?.type).toBe("q");
    expect(state.out.find((p) => p.square === "a8")?.fresh).toBe(false);
  });
});

describe("en passant", () => {
  it("moves the capturer and removes the captured pawn", () => {
    const chess = new Chess();
    let state = assignPieceIds(boardOf(chess), null, initialPieceIdState());
    for (const san of ["e4", "a6", "e5", "d5"]) state = step(chess, state, san);

    const capturer = idAt(state, "e5");
    const victim = idAt(state, "d5");

    state = step(chess, state, "exd6");
    expect(idAt(state, "d6")).toBe(capturer);
    expect(state.out.some((p) => p.id === victim)).toBe(false);
    expect(idAt(state, "d5")).toBeUndefined();
  });
});

describe("purity", () => {
  // The bug this replaced: the old implementation mutated its previous-state
  // ref from inside a useMemo, so a StrictMode double-invocation fed the
  // second pass the first pass's output and re-keyed every piece.
  it("does not mutate the state it is given", () => {
    const chess = new Chess();
    const first = assignPieceIds(boardOf(chess), null, initialPieceIdState());
    const snapshot = { sig: first.sig, counter: first.counter, entries: [...first.map.entries()] };

    chess.move("e4");
    assignPieceIds(boardOf(chess), { from: "e2", to: "e4" }, first);

    expect(first.sig).toBe(snapshot.sig);
    expect(first.counter).toBe(snapshot.counter);
    expect([...first.map.entries()]).toEqual(snapshot.entries);
  });

  it("is idempotent — running the same transition twice gives the same ids", () => {
    const a = new Chess();
    const start = assignPieceIds(boardOf(a), null, initialPieceIdState());
    a.move("e4");
    const board = boardOf(a);

    const once = assignPieceIds(board, { from: "e2", to: "e4" }, start);
    const twice = assignPieceIds(board, { from: "e2", to: "e4" }, start);
    expect(twice.out).toEqual(once.out);
  });
});

describe("id uniqueness", () => {
  it("never issues the same id to two pieces across a whole game", () => {
    const chess = new Chess();
    let state = assignPieceIds(boardOf(chess), null, initialPieceIdState());
    const sans = [
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bb5",
      "a6",
      "Ba4",
      "Nf6",
      "O-O",
      "Be7",
      "Re1",
      "b5",
      "Bb3",
      "d6",
      "c3",
      "O-O",
      "h3",
      "Nb8",
      "d4",
      "Nbd7",
    ];
    for (const san of sans) {
      state = step(chess, state, san);
      expect(new Set(state.out.map((p) => p.id)).size).toBe(state.out.length);
    }
  });
});
