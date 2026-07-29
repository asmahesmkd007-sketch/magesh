import { describe, expect, it } from "vitest";

import {
  APEX_RUNG,
  LADDER,
  PENALTIES,
  TIERS,
  UPSET_BONUS,
  nextRung,
  previewSpChange,
  rewardLabel,
  rungById,
  rungOf,
  rungProgress,
  spToNextRung,
  tierOf,
  upsetBonusFor,
} from "./tiers";

describe("ladder shape", () => {
  it("has 7 tiers x 3 divisions", () => {
    expect(TIERS).toHaveLength(7);
    expect(LADDER).toHaveLength(21);
  });

  it("is strictly ascending in SP", () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].minSp).toBeGreaterThan(LADDER[i - 1].minSp);
    }
  });

  it("labels divisions III -> I within each tier", () => {
    expect(LADDER[0].label).toBe("Bronze III");
    expect(LADDER[1].label).toBe("Bronze II");
    expect(LADDER[2].label).toBe("Bronze I");
    expect(LADDER[3].label).toBe("Silver III");
    expect(APEX_RUNG.label).toBe("Grandmaster I");
  });

  it("keeps ids and nextSp consistent", () => {
    expect(LADDER[0].id).toBe("bronze_3");
    expect(LADDER[0].nextSp).toBe(LADDER[1].minSp);
    expect(APEX_RUNG.nextSp).toBeNull();
  });

  it("gets harder to earn as tiers rise", () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].rates.win).toBeLessThan(TIERS[i - 1].rates.win);
      expect(TIERS[i].rates.loss).toBeLessThan(TIERS[i - 1].rates.loss); // more negative
    }
  });
});

describe("rungOf", () => {
  it("floors at Bronze III for zero and negative totals", () => {
    expect(rungOf(0).id).toBe("bronze_3");
    expect(rungOf(-500).id).toBe("bronze_3");
  });

  it("resolves boundaries inclusively", () => {
    const silver3 = LADDER.find((r) => r.id === "silver_3")!;
    expect(rungOf(silver3.minSp).id).toBe("silver_3");
    expect(rungOf(silver3.minSp - 1).id).toBe("bronze_1");
  });

  it("caps at the apex", () => {
    expect(rungOf(999_999).id).toBe(APEX_RUNG.id);
    expect(tierOf(999_999).code).toBe("grandmaster");
  });
});

describe("rungById", () => {
  it("round-trips every ladder id", () => {
    for (const rung of LADDER) expect(rungById(rung.id)?.index).toBe(rung.index);
  });

  it("returns null for unknown or missing ids", () => {
    expect(rungById("mythic_1")).toBeNull();
    expect(rungById(null)).toBeNull();
    expect(rungById(undefined)).toBeNull();
  });
});

describe("progress", () => {
  it("is 0 at a rung floor and approaches 100 near the next", () => {
    const gold3 = LADDER.find((r) => r.id === "gold_3")!;
    expect(rungProgress(gold3.minSp)).toBe(0);
    expect(rungProgress(gold3.nextSp! - 1)).toBeGreaterThan(90);
  });

  it("is 100 at the apex", () => {
    expect(rungProgress(APEX_RUNG.minSp + 5000)).toBe(100);
    expect(spToNextRung(APEX_RUNG.minSp)).toBeNull();
    expect(nextRung(APEX_RUNG.minSp)).toBeNull();
  });

  it("reports the gap to the next rung", () => {
    const r = LADDER[0];
    expect(spToNextRung(r.minSp)).toBe(r.nextSp! - r.minSp);
  });
});

describe("upset bonus", () => {
  it("pays nothing against equal or lower tiers", () => {
    const gold = TIERS.find((t) => t.code === "gold")!;
    const silver = TIERS.find((t) => t.code === "silver")!;
    expect(upsetBonusFor(gold, gold)).toBe(0);
    expect(upsetBonusFor(gold, silver)).toBe(0);
  });

  it("scales with the tier gap and caps at three", () => {
    const bronze = TIERS[0];
    expect(upsetBonusFor(bronze, TIERS[1])).toBe(UPSET_BONUS[1]);
    expect(upsetBonusFor(bronze, TIERS[2])).toBe(UPSET_BONUS[2]);
    expect(upsetBonusFor(bronze, TIERS[3])).toBe(UPSET_BONUS[3]);
    expect(upsetBonusFor(bronze, TIERS[6])).toBe(UPSET_BONUS[3]);
  });
});

describe("previewSpChange", () => {
  it("uses the mover's own tier rates", () => {
    const bronze = previewSpChange({ sp: 0, outcome: "win" });
    const gm = previewSpChange({ sp: LADDER[20].minSp, outcome: "win" });
    expect(bronze.total).toBe(30);
    expect(gm.total).toBe(18);
  });

  it("adds the upset bonus for wins only", () => {
    const gmSp = LADDER[20].minSp;
    const win = previewSpChange({ sp: 0, outcome: "win", opponentSp: gmSp });
    expect(win.bonus).toBe(UPSET_BONUS[3]);
    expect(win.total).toBe(30 + UPSET_BONUS[3]);

    const loss = previewSpChange({ sp: 0, outcome: "loss", opponentSp: gmSp });
    expect(loss.bonus).toBe(0);
    expect(loss.total).toBe(-8);
  });

  it("stacks conduct penalties on top", () => {
    const r = previewSpChange({ sp: 0, outcome: "loss", penalty: "disconnect" });
    expect(r.penalty).toBe(PENALTIES.disconnect);
    expect(r.total).toBe(-8 + PENALTIES.disconnect);
  });

  it("punishes cheating hardest", () => {
    expect(PENALTIES.cheating).toBeLessThan(PENALTIES.disconnect);
    expect(PENALTIES.cheating).toBeLessThan(PENALTIES.timeout);
  });
});

describe("rewardLabel", () => {
  it("maps known codes and humanises unknown ones", () => {
    expect(rewardLabel("badge_crown")).toBe("Crown Badge");
    expect(rewardLabel("top_1")).toBe("Season Champion");
    expect(rewardLabel("some_new_code")).toBe("some new code");
  });
});

describe("ladder pacing (sanity against real play)", () => {
  /** Simulate a month of games at a given win rate through the ladder. */
  function simulate(games: number, winRate: number): number {
    let sp = 0;
    for (let i = 0; i < games; i++) {
      const tier = tierOf(sp);
      const won = i % 100 < winRate * 100;
      sp = Math.max(0, sp + (won ? tier.rates.win : tier.rates.loss));
    }
    return sp;
  }

  it("puts a casual 50% player in the lower-middle tiers", () => {
    const sp = simulate(90, 0.5);
    expect(tierOf(sp).order).toBeGreaterThanOrEqual(0);
    expect(tierOf(sp).order).toBeLessThanOrEqual(2);
  });

  it("puts a strong 70% regular in the middle-upper tiers", () => {
    const sp = simulate(150, 0.7);
    expect(tierOf(sp).order).toBeGreaterThanOrEqual(2);
  });

  it("keeps Grandmaster out of reach of a losing record", () => {
    expect(tierOf(simulate(300, 0.45)).code).not.toBe("grandmaster");
  });
});
