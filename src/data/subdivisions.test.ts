import { describe, expect, it } from "vitest";

import { countryByCode } from "./countries";
import {
  SUBDIVISIONS,
  hasSubdivisions,
  keepSubdivisionIfValid,
  subdivisionLabel,
  subdivisionsFor,
} from "./subdivisions";

describe("subdivisionsFor", () => {
  it("returns the states of the requested country only", () => {
    expect(subdivisionsFor("IN")).toEqual(
      expect.arrayContaining(["Tamil Nadu", "Kerala", "Karnataka", "Maharashtra"]),
    );
    expect(subdivisionsFor("US")).toEqual(
      expect.arrayContaining(["California", "Texas", "Florida", "New York"]),
    );
    expect(subdivisionsFor("CA")).toEqual(expect.arrayContaining(["Ontario", "Alberta", "Quebec"]));
  });

  it("never leaks one country's states into another", () => {
    expect(subdivisionsFor("US")).not.toContain("Tamil Nadu");
    expect(subdivisionsFor("CA")).not.toContain("California");
    expect(subdivisionsFor("IN")).not.toContain("Ontario");
  });

  it("has the expected counts for the lists people will check", () => {
    expect(subdivisionsFor("IN")).toHaveLength(36); // 28 states + 8 UTs
    expect(subdivisionsFor("US")).toHaveLength(56); // 50 + DC + 5 territories
    expect(subdivisionsFor("CA")).toHaveLength(13); // 10 provinces + 3 territories
    expect(subdivisionsFor("AU")).toHaveLength(8);
    expect(subdivisionsFor("JP")).toHaveLength(47);
    expect(subdivisionsFor("DE")).toHaveLength(16);
  });

  it("returns default regions for unlisted countries, and empty list when no country is selected", () => {
    expect(subdivisionsFor("SG")).toEqual(
      expect.arrayContaining(["Central Region", "East Region"]),
    );
    expect(subdivisionsFor("ZZ")).toEqual(
      expect.arrayContaining(["Capital Region", "Central Region"]),
    );
    expect(subdivisionsFor("")).toEqual([]);
    expect(subdivisionsFor(null)).toEqual([]);
  });

  it("accepts a lowercase code", () => {
    expect(subdivisionsFor("in")).toBe(subdivisionsFor("IN"));
  });

  it("returns a stable empty list when country is missing so callers can memoise on it", () => {
    expect(subdivisionsFor(null)).toBe(subdivisionsFor(""));
  });
});

describe("keepSubdivisionIfValid", () => {
  it("keeps a state that belongs to the country", () => {
    expect(keepSubdivisionIfValid("IN", "Tamil Nadu")).toBe("Tamil Nadu");
    expect(keepSubdivisionIfValid("CA", "Ontario")).toBe("Ontario");
  });

  it("drops a state left over from another country", () => {
    expect(keepSubdivisionIfValid("CA", "Tamil Nadu")).toBe("");
    expect(keepSubdivisionIfValid("US", "Ontario")).toBe("");
  });

  it("keeps valid regions for default countries", () => {
    expect(keepSubdivisionIfValid("ZZ", "Central Region")).toBe("Central Region");
  });

  it("normalises empty input", () => {
    expect(keepSubdivisionIfValid("IN", "")).toBe("");
    expect(keepSubdivisionIfValid("IN", null)).toBe("");
    expect(keepSubdivisionIfValid("IN", "   ")).toBe("");
    expect(keepSubdivisionIfValid(null, "Anywhere")).toBe("");
  });
});

describe("hasSubdivisions", () => {
  it("decides whether a country is selected for dropdown combobox", () => {
    expect(hasSubdivisions("IN")).toBe(true);
    expect(hasSubdivisions("US")).toBe(true);
    expect(hasSubdivisions("SG")).toBe(true);
    expect(hasSubdivisions(null)).toBe(false);
  });
});

describe("subdivisionLabel", () => {
  it("uses the country's own term", () => {
    expect(subdivisionLabel("US")).toBe("State");
    expect(subdivisionLabel("JP")).toBe("Prefecture");
    expect(subdivisionLabel("CH")).toBe("Canton");
    expect(subdivisionLabel("AE")).toBe("Emirate");
  });

  it("falls back to a neutral label", () => {
    expect(subdivisionLabel("SG")).toBe("State / Province");
    expect(subdivisionLabel(null)).toBe("State / Province");
  });
});

describe("SUBDIVISIONS data integrity", () => {
  it("is keyed by real ISO 3166-1 codes", () => {
    for (const code of Object.keys(SUBDIVISIONS)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(countryByCode(code), `${code} is not an ISO country`).not.toBeNull();
    }
  });

  it("has no duplicate or blank entries in any country", () => {
    for (const [code, list] of Object.entries(SUBDIVISIONS)) {
      expect(list.length, `${code} is listed but empty`).toBeGreaterThan(0);
      expect(new Set(list).size, `${code} has duplicates`).toBe(list.length);
      for (const name of list) expect(name.trim(), `${code} has a blank entry`).not.toBe("");
    }
  });
});
