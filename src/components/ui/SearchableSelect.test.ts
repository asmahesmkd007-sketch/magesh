import { describe, expect, it } from "vitest";

import { filterOptions, type SelectOption } from "./selectFiltering";
import { COUNTRIES, countryFlag } from "@/data/countries";

const countryOptions: SelectOption[] = COUNTRIES.map((c) => ({
  value: c.code,
  label: c.name,
  prefix: countryFlag(c.code),
  keywords: c.code,
}));

function labels(options: readonly SelectOption[]): string[] {
  return options.map((o) => o.label);
}

describe("filterOptions", () => {
  it("returns everything for an empty query", () => {
    expect(filterOptions(countryOptions, "")).toHaveLength(countryOptions.length);
    expect(filterOptions(countryOptions, "   ")).toHaveLength(countryOptions.length);
  });

  it("ranks prefix matches above substring matches", () => {
    const result = labels(filterOptions(countryOptions, "ind"));
    expect(result[0]).toBe("India");
    // "British Indian Ocean Territory" only contains the query.
    expect(result.indexOf("India")).toBeLessThan(result.indexOf("British Indian Ocean Territory"));
  });

  it("matches on the ISO code as well as the name", () => {
    expect(labels(filterOptions(countryOptions, "IN"))).toContain("India");
    expect(labels(filterOptions(countryOptions, "de"))).toContain("Germany");
  });

  it("ignores case and accents", () => {
    expect(labels(filterOptions(countryOptions, "cote"))).toContain("Côte d'Ivoire");
    expect(labels(filterOptions(countryOptions, "TÜRKIYE"))).toContain("Türkiye");
    expect(labels(filterOptions(countryOptions, "reunion"))).toContain("Réunion");
  });

  it("narrows to a single country as the query grows", () => {
    expect(labels(filterOptions(countryOptions, "united states"))).toEqual([
      "United States",
      "United States Minor Outlying Islands",
    ]);
  });

  it("returns nothing when there is no match", () => {
    expect(filterOptions(countryOptions, "atlantis")).toEqual([]);
  });

  it("works for state lists too", () => {
    const states: SelectOption[] = [
      { value: "Tamil Nadu", label: "Tamil Nadu" },
      { value: "Telangana", label: "Telangana" },
      { value: "Kerala", label: "Kerala" },
    ];
    expect(labels(filterOptions(states, "ta"))).toEqual(["Tamil Nadu"]);
    expect(labels(filterOptions(states, "te"))).toEqual(["Telangana"]);
    // No prefix match — every substring hit keeps the source order.
    expect(labels(filterOptions(states, "l"))).toEqual(["Tamil Nadu", "Telangana", "Kerala"]);
  });
});
