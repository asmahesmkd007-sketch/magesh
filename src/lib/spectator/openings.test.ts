import { describe, expect, it } from "vitest";

import { openingLabel } from "./openings";

const san = (line: string) => line.split(" ").filter(Boolean);

describe("openingLabel", () => {
  it("prefers the analysed name over the live book lookup", () => {
    expect(openingLabel("Analysed Opening", san("e4 c5"))).toBe("Analysed Opening");
  });

  it("treats a blank stored value as absent", () => {
    expect(openingLabel("   ", san("e4 e6"))).toBe(openingLabel(null, san("e4 e6")));
  });

  it("falls back to the shared ECO book", () => {
    expect(openingLabel(null, san("e4 c5"))).toBe("Sicilian Defense");
    expect(openingLabel(null, san("e4 e6"))).toBe("French Defense");
  });

  it("refines the name as more plies are released", () => {
    const first = openingLabel(null, san("e4 c5"));
    const later = openingLabel(null, san("e4 c5 Nf3 Nc6 Bb5"));
    expect(first).toBe("Sicilian Defense");
    expect(later).not.toBe(first);
  });

  it("returns null before a move is played", () => {
    expect(openingLabel(null, [])).toBeNull();
    expect(openingLabel(undefined, [])).toBeNull();
  });

  it("returns null for a line the book does not cover", () => {
    expect(openingLabel(null, san("h4 a5 Rh3"))).toBeNull();
  });
});
