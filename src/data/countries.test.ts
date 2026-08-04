import { describe, expect, it } from "vitest";

import { COUNTRIES, countryByCode, countryByName, countryFlag } from "./countries";

describe("COUNTRIES", () => {
  it("covers the ISO 3166-1 list", () => {
    // 249 officially assigned alpha-2 codes.
    expect(COUNTRIES).toHaveLength(249);
  });

  it("has unique, well-formed alpha-2 codes", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  it("has unique, non-empty names", () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name.trim()).not.toBe("");
  });

  it("is sorted alphabetically by name", () => {
    const names = COUNTRIES.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "en"));
    expect(names).toEqual(sorted);
  });

  it("keeps the names the existing profiles were saved with", () => {
    // These strings are already stored in profiles.country and are used
    // by the leaderboard filters — renaming any of them orphans rows.
    for (const name of ["India", "United States", "United Kingdom", "Canada", "Australia"]) {
      expect(countryByName(name)).not.toBeNull();
    }
  });
});

describe("countryByCode", () => {
  it("resolves a code case-insensitively", () => {
    expect(countryByCode("IN")?.name).toBe("India");
    expect(countryByCode("in")?.name).toBe("India");
    expect(countryByCode(" us ")?.name).toBe("United States");
  });

  it("returns null for anything unknown or empty", () => {
    expect(countryByCode("ZZ")).toBeNull();
    expect(countryByCode("")).toBeNull();
    expect(countryByCode(null)).toBeNull();
    expect(countryByCode(undefined)).toBeNull();
  });
});

describe("countryByName", () => {
  it("resolves pre-country_code profiles by their stored name", () => {
    expect(countryByName("india")?.code).toBe("IN");
    expect(countryByName("United States")?.code).toBe("US");
  });

  it("returns null for an unrecognised name", () => {
    expect(countryByName("Atlantis")).toBeNull();
    expect(countryByName(null)).toBeNull();
  });
});

describe("countryFlag", () => {
  it("builds the regional-indicator pair", () => {
    expect(countryFlag("IN")).toBe("\u{1F1EE}\u{1F1F3}");
    expect(countryFlag("us")).toBe("\u{1F1FA}\u{1F1F8}");
  });

  it("emits nothing for a malformed code", () => {
    expect(countryFlag("")).toBe("");
    expect(countryFlag("USA")).toBe("");
    expect(countryFlag("1N")).toBe("");
    expect(countryFlag(null)).toBe("");
  });

  it("produces a flag for every country in the list", () => {
    for (const country of COUNTRIES) {
      expect(countryFlag(country.code)).toHaveLength(4); // two surrogate pairs
    }
  });
});
