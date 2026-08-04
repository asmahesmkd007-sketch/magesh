import { describe, expect, it } from "vitest";

import {
  countryCodeFromLocale,
  countryCodeFromTimezone,
  detectCountryCode,
  resolveInitialCountry,
} from "./detectCountry";

describe("countryCodeFromTimezone", () => {
  it("maps the zones most players will be in", () => {
    expect(countryCodeFromTimezone("Asia/Kolkata")).toBe("IN");
    expect(countryCodeFromTimezone("Asia/Calcutta")).toBe("IN"); // legacy alias
    expect(countryCodeFromTimezone("America/New_York")).toBe("US");
    expect(countryCodeFromTimezone("America/Toronto")).toBe("CA");
    expect(countryCodeFromTimezone("Europe/London")).toBe("GB");
    expect(countryCodeFromTimezone("Australia/Sydney")).toBe("AU");
    expect(countryCodeFromTimezone("America/Argentina/Buenos_Aires")).toBe("AR");
  });

  it("returns null rather than guessing at an unknown zone", () => {
    expect(countryCodeFromTimezone("Mars/Olympus_Mons")).toBeNull();
    expect(countryCodeFromTimezone("UTC")).toBeNull();
    expect(countryCodeFromTimezone("")).toBeNull();
    expect(countryCodeFromTimezone(null)).toBeNull();
  });
});

describe("countryCodeFromLocale", () => {
  it("reads the region subtag", () => {
    expect(countryCodeFromLocale("en-IN")).toBe("IN");
    expect(countryCodeFromLocale("pt-BR")).toBe("BR");
    expect(countryCodeFromLocale("zh-Hant-TW")).toBe("TW");
    expect(countryCodeFromLocale("en-gb")).toBe("GB");
  });

  it("does not mistake a language for a region", () => {
    expect(countryCodeFromLocale("en")).toBeNull();
    expect(countryCodeFromLocale("fr")).toBeNull();
  });

  it("rejects regions that are not ISO countries", () => {
    expect(countryCodeFromLocale("en-ZZ")).toBeNull();
    expect(countryCodeFromLocale("")).toBeNull();
    expect(countryCodeFromLocale(null)).toBeNull();
  });
});

describe("resolveInitialCountry", () => {
  const detectUS = () => "US";
  const detectNothing = () => null;

  it("honours a saved country_code above everything else", () => {
    const result = resolveInitialCountry({
      savedCode: "DE",
      savedName: "France",
      detect: detectUS,
    });
    expect(result).toEqual({
      country: { code: "DE", name: "Germany" },
      detected: false,
    });
  });

  it("honours a saved name from before country_code existed", () => {
    const result = resolveInitialCountry({ savedName: "Canada", detect: detectUS });
    expect(result?.country.code).toBe("CA");
    expect(result?.detected).toBe(false);
  });

  it("detects for a new profile carrying only the schema default", () => {
    // profiles.country is DEFAULT 'India', so a brand-new row already
    // has that name. It must not suppress detection.
    const result = resolveInitialCountry({ savedName: "India", detect: detectUS });
    expect(result?.country.code).toBe("US");
    expect(result?.detected).toBe(true);
  });

  it("keeps the default name when detection has nothing to offer", () => {
    const result = resolveInitialCountry({ savedName: "India", detect: detectNothing });
    expect(result?.country.code).toBe("IN");
    expect(result?.detected).toBe(false);
  });

  it("detects for a completely blank profile", () => {
    expect(resolveInitialCountry({ detect: detectUS })).toEqual({
      country: { code: "US", name: "United States" },
      detected: true,
    });
  });

  it("returns null when there is nothing saved and nothing detected", () => {
    expect(resolveInitialCountry({ detect: detectNothing })).toBeNull();
    expect(
      resolveInitialCountry({ savedCode: "", savedName: "", detect: detectNothing }),
    ).toBeNull();
  });

  it("ignores saved values that are not ISO countries", () => {
    const result = resolveInitialCountry({
      savedCode: "XX",
      savedName: "Middle Earth",
      detect: detectUS,
    });
    expect(result?.country.code).toBe("US");
    expect(result?.detected).toBe(true);
  });
});

describe("detectCountryCode", () => {
  it("returns null during SSR instead of touching navigator", () => {
    // The suite runs in the node environment, so `window` is undefined —
    // exactly the SSR case this guard exists for.
    expect(typeof window).toBe("undefined");
    expect(detectCountryCode()).toBeNull();
  });
});
