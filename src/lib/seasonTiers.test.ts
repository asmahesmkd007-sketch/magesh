import { describe, expect, it } from "vitest";

import { LADDER, rungOf, rungProgress } from "@/lib/ranking/tiers";

import { SEASON_TIERS, nextTierOf, tierDisplayName, tierOf, tierProgress } from "./seasonTiers";

// The /seasons page and the /rankings page render the SAME stored
// number. These tests are the guard against them drifting apart again:
// the legacy export surface must stay a faithful view of the one ladder.

describe("seasonTiers shim tracks the ranking ladder", () => {
  it("exposes exactly the ladder's rungs, in order", () => {
    expect(SEASON_TIERS).toHaveLength(LADDER.length);
    SEASON_TIERS.forEach((tier, i) => {
      expect(tier.name).toBe(LADDER[i].label);
      expect(tier.min).toBe(LADDER[i].minSp);
      expect(tier.max).toBe(LADDER[i].nextSp);
    });
  });

  it("resolves the same rung as rungOf for every threshold", () => {
    for (const rung of LADDER) {
      expect(tierOf(rung.minSp).name).toBe(rung.label);
      expect(tierOf(rung.minSp + 1).name).toBe(rung.label);
      if (rung.minSp > 0) {
        expect(tierOf(rung.minSp - 1).name).not.toBe(rung.label);
      }
    }
  });

  it("agrees with rungProgress", () => {
    for (const sp of [0, 175, 640, 1200, 2600, 4100, 6300, 12000]) {
      expect(tierProgress(sp)).toBe(rungProgress(sp));
      expect(tierOf(sp).name).toBe(rungOf(sp).label);
    }
  });

  it("walks up the ladder and stops at the apex", () => {
    expect(nextTierOf(0)?.name).toBe(LADDER[1].label);
    expect(nextTierOf(LADDER[LADDER.length - 1].minSp)).toBeNull();
  });
});

describe("tierDisplayName", () => {
  it("humanises v2 tier codes from frozen history", () => {
    expect(tierDisplayName("grandmaster", 6400)).toBe("Grandmaster");
    expect(tierDisplayName("bronze", 10)).toBe("Bronze");
  });

  it("preserves legacy labels recorded before the redesign", () => {
    expect(tierDisplayName("Chessox Legend", 9000)).toBe("Chessox Legend");
    expect(tierDisplayName("Expert", 1200)).toBe("Expert");
  });

  it("falls back to the ladder when nothing was stored", () => {
    expect(tierDisplayName(null, 0)).toBe("Bronze III");
    expect(tierDisplayName(undefined, 1400)).toBe("Gold II");
  });
});
