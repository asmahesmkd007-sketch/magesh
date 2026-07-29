import { describe, expect, it } from "vitest";

import { ROOT_ID } from "./moveTree";
import { parsePgn, serializePgn, validateFen } from "./pgn";

describe("parsePgn", () => {
  it("parses headers and mainline moves", () => {
    const pgn = `[Event "Casual Game"]
[White "Anderssen"]
[Black "Kieseritzky"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 1-0`;
    const parsed = parsePgn(pgn);
    expect(parsed.headers).toContainEqual(["White", "Anderssen"]);
    expect(parsed.result).toBe("1-0");
    expect(parsed.tree.mainline().map((n) => n.san)).toEqual(["e4", "e5", "f4", "exf4", "Bc4"]);
    expect(parsed.warnings).toEqual([]);
  });

  it("preserves comments, NAGs and suffix annotations", () => {
    const pgn = `1. e4! {best by test} e5 $2 2. Nf3?! {developing} Nc6`;
    const parsed = parsePgn(pgn);
    const [e4, e5, nf3] = parsed.tree.mainline();
    expect(e4.nags).toContain(1);
    expect(e4.comment).toBe("best by test");
    expect(e5.nags).toContain(2);
    expect(nf3.nags).toContain(6);
    expect(nf3.comment).toBe("developing");
  });

  it("builds nested variations", () => {
    const pgn = `1. e4 e5 (1... c5 2. Nf3 (2. c3 d5) 2... d6) 2. Nf3 Nc6`;
    const parsed = parsePgn(pgn);
    const mainline = parsed.tree.mainline().map((n) => n.san);
    expect(mainline).toEqual(["e4", "e5", "Nf3", "Nc6"]);

    const e5 = parsed.tree.mainline()[1];
    const variations = parsed.tree.variationsOf(e5.id);
    expect(variations.map((n) => n.san)).toEqual(["c5"]);
    // Nested variation inside the sicilian line.
    const c5 = variations[0];
    const nf3 = parsed.tree.next(c5.id)!;
    expect(parsed.tree.variationsOf(nf3.id).map((n) => n.san)).toEqual(["c3"]);
  });

  it("extracts clock tags and strips them from comments", () => {
    const pgn = `1. e4 {[%clk 0:03:00] good start} e5 {[%clk 0:02:58]}`;
    const parsed = parsePgn(pgn);
    const [e4, e5] = parsed.tree.mainline();
    expect(e4.clockSeconds).toBe(180);
    expect(e4.comment).toBe("good start");
    expect(e5.clockSeconds).toBe(178);
    expect(e5.comment).toBeNull();
  });

  it("recovers from glued move numbers and zero-castling", () => {
    const pgn = `1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.0-0 Bc5`;
    const parsed = parsePgn(pgn);
    expect(parsed.tree.mainline().map((n) => n.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bc4",
      "Nf6",
      "O-O",
      "Bc5",
    ]);
  });

  it("keeps the legal prefix and warns on a broken move", () => {
    const pgn = `1. e4 e5 2. Qxf7 Nc6`;
    const parsed = parsePgn(pgn);
    expect(parsed.tree.mainline().map((n) => n.san)).toEqual(["e4", "e5"]);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("skips only the variation when a variation move is broken", () => {
    const pgn = `1. e4 e5 (1... zz9) 2. Nf3`;
    const parsed = parsePgn(pgn);
    expect(parsed.tree.mainline().map((n) => n.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("honours FEN/SetUp headers", () => {
    const pgn = `[SetUp "1"]
[FEN "8/8/4k3/8/4P3/4K3/8/8 w - - 0 1"]

1. Kd4 Kd6`;
    const parsed = parsePgn(pgn);
    expect(parsed.tree.rootFen).toBe("8/8/4k3/8/4P3/4K3/8/8 w - - 0 1");
    expect(parsed.tree.mainline().map((n) => n.san)).toEqual(["Kd4", "Kd6"]);
  });

  it("rejects an invalid FEN header outright", () => {
    expect(() => parsePgn(`[FEN "banana"]\n\n1. e4`)).toThrow(/FEN/);
  });

  it("counts multiple games and imports the first", () => {
    const pgn = `[Event "One"]

1. e4 e5 1-0

[Event "Two"]

1. d4 d5 0-1`;
    const parsed = parsePgn(pgn);
    expect(parsed.gameCount).toBe(2);
    expect(parsed.tree.mainline().map((n) => n.san)).toEqual(["e4", "e5"]);
    expect(parsed.warnings.some((w) => w.includes("2 games"))).toBe(true);
  });

  it("throws on empty input", () => {
    expect(() => parsePgn("   ")).toThrow();
  });
});

describe("serializePgn", () => {
  it("round-trips a study with variations, comments and NAGs", () => {
    const source = `[Event "Study"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4! {best} e5 (1... c5 2. Nf3 {flexible} d6) 2. Nf3 Nc6 3. Bb5 a6 *`;
    const first = parsePgn(source);
    const out = serializePgn(first.tree, first.headers, { result: first.result });
    const second = parsePgn(out);

    expect(second.tree.mainline().map((n) => n.san)).toEqual(
      first.tree.mainline().map((n) => n.san),
    );
    const e5a = first.tree.mainline()[1];
    const e5b = second.tree.mainline()[1];
    expect(second.tree.variationsOf(e5b.id).map((n) => n.san)).toEqual(
      first.tree.variationsOf(e5a.id).map((n) => n.san),
    );
    expect(second.tree.mainline()[0].nags).toContain(1);
    expect(second.tree.mainline()[0].comment).toBe("best");
    expect(out).toContain('[White "A"]');
    expect(out.trim().endsWith("*")).toBe(true);
  });

  it("emits the seven tag roster with defaults", () => {
    const parsed = parsePgn("1. e4 e5");
    const out = serializePgn(parsed.tree, []);
    for (const tag of ["Event", "Site", "Date", "Round", "White", "Black", "Result"]) {
      expect(out).toContain(`[${tag} `);
    }
  });

  it("adds SetUp/FEN for custom starts", () => {
    const parsed = parsePgn(`[FEN "8/8/4k3/8/4P3/4K3/8/8 w - - 0 1"]\n\n1. Kd4`);
    const out = serializePgn(parsed.tree, parsed.headers);
    expect(out).toContain('[SetUp "1"]');
    expect(out).toContain('[FEN "8/8/4k3/8/4P3/4K3/8/8 w - - 0 1"]');
  });

  it("can strip annotations and variations for a clean export", () => {
    const parsed = parsePgn(`1. e4! {best} e5 (1... c5) 2. Nf3`);
    const out = serializePgn(parsed.tree, [], { annotations: false, variations: false });
    expect(out).not.toContain("{");
    expect(out).not.toContain("(");
    expect(out).not.toContain("!");
  });

  it("numbers black-first lines correctly", () => {
    const parsed = parsePgn(`1. e4 e5 (1... c5 2. Nf3) 2. Nf3`);
    const out = serializePgn(parsed.tree, []);
    expect(out).toContain("(1... c5 2. Nf3)");
  });
});

describe("validateFen", () => {
  it("accepts a normal FEN", () => {
    const r = validateFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(r.ok).toBe(true);
  });

  it("pads 4-field EPD-style input", () => {
    const r = validateFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
    expect(r.ok).toBe(true);
  });

  it("rejects wrong field counts with a clear message", () => {
    const r = validateFen("only two");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/6 space-separated fields/);
  });

  it("rejects illegal positions", () => {
    const r = validateFen("9/8/8/8/8/8/8/8 w - - 0 1");
    expect(r.ok).toBe(false);
  });
});

describe("parse → tree integrity", () => {
  it("keeps FENs consistent along the mainline", () => {
    const parsed = parsePgn("1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6");
    let cursor = parsed.tree.next(ROOT_ID);
    while (cursor) {
      const parent = parsed.tree.prev(cursor.id)!;
      // Each node's stored FEN must be reachable from its parent's FEN.
      const replay = parsed.tree.positionAt(parent.id);
      replay.move(cursor.san);
      expect(replay.fen()).toBe(cursor.fenAfter);
      cursor = parsed.tree.next(cursor.id);
    }
  });
});
