import { describe, expect, it } from "vitest";

import { GameTree, ROOT_ID, START_FEN } from "./moveTree";

describe("GameTree", () => {
  it("starts at the standard position by default", () => {
    const tree = new GameTree();
    expect(tree.rootFen).toBe(START_FEN);
    expect(tree.size).toBe(0);
    expect(tree.mainline()).toEqual([]);
  });

  it("rejects an invalid FEN at construction", () => {
    expect(() => new GameTree("not a fen")).toThrow();
  });

  it("plays moves and tracks ply/move numbers", () => {
    const tree = new GameTree();
    const e4 = tree.play(ROOT_ID, "e4")!;
    const e5 = tree.play(e4.id, "e5")!;
    const nf3 = tree.play(e5.id, "Nf3")!;
    expect(e4.ply).toBe(1);
    expect(e4.moveNumber).toBe(1);
    expect(e4.color).toBe("w");
    expect(e5.moveNumber).toBe(1);
    expect(e5.color).toBe("b");
    expect(nf3.moveNumber).toBe(2);
    expect(tree.mainline().map((n) => n.san)).toEqual(["e4", "e5", "Nf3"]);
  });

  it("returns null for illegal moves", () => {
    const tree = new GameTree();
    expect(tree.play(ROOT_ID, "Ke2")).toBeNull();
    expect(tree.play(ROOT_ID, { from: "e2", to: "e5" })).toBeNull();
  });

  it("reuses an existing child for the same move", () => {
    const tree = new GameTree();
    const first = tree.play(ROOT_ID, "e4")!;
    const again = tree.play(ROOT_ID, { from: "e2", to: "e4" })!;
    expect(again.id).toBe(first.id);
    expect(tree.size).toBe(1);
  });

  it("creates side variations and reports mainline membership", () => {
    const tree = new GameTree();
    const e4 = tree.play(ROOT_ID, "e4")!;
    const e5 = tree.play(e4.id, "e5")!;
    const c5 = tree.play(e4.id, "c5")!; // sicilian as a variation
    expect(tree.isMainline(e5.id)).toBe(true);
    expect(tree.isMainline(c5.id)).toBe(false);
    expect(tree.variationsOf(e5.id).map((n) => n.san)).toEqual(["c5"]);

    tree.promote(c5.id);
    expect(tree.isMainline(c5.id)).toBe(true);
    expect(tree.isMainline(e5.id)).toBe(false);
    expect(tree.mainline().map((n) => n.san)).toEqual(["e4", "c5"]);
  });

  it("deletes subtrees and refuses to delete the root", () => {
    const tree = new GameTree();
    const e4 = tree.play(ROOT_ID, "e4")!;
    const e5 = tree.play(e4.id, "e5")!;
    tree.play(e5.id, "Nf3");
    tree.delete(e5.id);
    expect(tree.size).toBe(1);
    expect(tree.node(e5.id)).toBeNull();
    tree.delete(ROOT_ID);
    expect(tree.root).toBeTruthy();
  });

  it("navigates path / next / prev / endOfLine", () => {
    const tree = new GameTree();
    const { lastId } = tree.appendMainline(["e4", "e5", "Nf3", "Nc6"]);
    const path = tree.path(lastId);
    expect(path.map((n) => n.san)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
    expect(tree.prev(lastId)!.san).toBe("Nf3");
    expect(tree.next(path[0].id)!.san).toBe("e5");
    expect(tree.endOfLine(ROOT_ID).san).toBe("Nc6");
  });

  it("appendMainline stops at the first illegal move", () => {
    const tree = new GameTree();
    const { applied } = tree.appendMainline(["e4", "e5", "Qxf7"]);
    expect(applied).toBe(2);
    expect(tree.mainline().map((n) => n.san)).toEqual(["e4", "e5"]);
  });

  it("manages comments and mutually-exclusive quality NAGs", () => {
    const tree = new GameTree();
    const e4 = tree.play(ROOT_ID, "e4")!;
    tree.setComment(e4.id, "  the king's pawn  ");
    expect(tree.node(e4.id)!.comment).toBe("the king's pawn");
    tree.setComment(e4.id, "   ");
    expect(tree.node(e4.id)!.comment).toBeNull();

    tree.toggleNag(e4.id, 1); // !
    tree.toggleNag(e4.id, 3); // !! replaces !
    expect(tree.node(e4.id)!.nags).toEqual([3]);
    tree.toggleNag(e4.id, 14); // positional NAG can coexist
    expect(tree.node(e4.id)!.nags).toEqual([3, 14]);
    tree.toggleNag(e4.id, 3); // toggle off
    expect(tree.node(e4.id)!.nags).toEqual([14]);
  });

  it("supports custom FEN starts", () => {
    // King-and-pawn endgame, Black to move at move 40.
    const fen = "8/8/4k3/8/4P3/4K3/8/8 b - - 0 40";
    const tree = new GameTree(fen);
    const kd6 = tree.play(ROOT_ID, "Kd6")!;
    expect(kd6.moveNumber).toBe(40);
    expect(kd6.color).toBe("b");
    const kd4 = tree.play(kd6.id, "Kd4")!;
    expect(kd4.moveNumber).toBe(41);
  });

  it("walks the whole tree in pre-order", () => {
    const tree = new GameTree();
    const e4 = tree.play(ROOT_ID, "e4")!;
    tree.play(e4.id, "e5");
    tree.play(e4.id, "c5");
    const sans = [...tree.walk()].map((n) => n.san);
    expect(sans).toEqual(["e4", "e5", "c5"]);
  });
});
