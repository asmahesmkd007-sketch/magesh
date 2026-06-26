import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { findBestMove } from "./engine";

describe("findBestMove", () => {
  it("returns a legal move for the start position", () => {
    const fen = new Chess().fen();
    const move = findBestMove(fen, 3);
    expect(move).not.toBeNull();
    const chess = new Chess(fen);
    const legal = chess
      .moves({ verbose: true })
      .some((m) => m.from === move!.from && m.to === move!.to);
    expect(legal).toBe(true);
  });

  it("finds mate in one (back-rank)", () => {
    // White to move: Ra8 is checkmate.
    const fen = "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1";
    const move = findBestMove(fen, 4);
    expect(move).not.toBeNull();
    const chess = new Chess(fen);
    const played = chess.move({ from: move!.from, to: move!.to, promotion: move!.promotion });
    expect(played).not.toBeNull();
    expect(chess.isCheckmate()).toBe(true);
  });

  it("returns null when there are no legal moves (stalemate position)", () => {
    const fen = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"; // black stalemated
    expect(findBestMove(fen, 3)).toBeNull();
  });

  it("captures a free queen when offered", () => {
    // White rook on a1 can take an undefended black queen on a8.
    const fen = "q5k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
    const move = findBestMove(fen, 3);
    expect(move).toMatchObject({ from: "a1", to: "a8" });
  });
});
