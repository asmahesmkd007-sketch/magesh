import { describe, expect, it } from "vitest";

import { ANTICHEAT_CONFIG, BROWSER_EVENT_WEIGHTS, FLAG_SEVERITY_WEIGHTS } from "./config";
import {
  EMPTY_RAWS,
  applyDeltas,
  categoryScore,
  computeRisk,
  decayRaws,
  enforcementAllowed,
  riskLevelFor,
} from "./risk";

const DAY = 24 * 60 * 60 * 1000;

describe("risk bands", () => {
  it("maps scores onto the documented 0-20/21-40/41-60/61-80/81-100 bands", () => {
    expect(riskLevelFor(0)).toBe("safe");
    expect(riskLevelFor(20)).toBe("safe");
    expect(riskLevelFor(21)).toBe("monitor");
    expect(riskLevelFor(40)).toBe("monitor");
    expect(riskLevelFor(41)).toBe("warning");
    expect(riskLevelFor(60)).toBe("warning");
    expect(riskLevelFor(61)).toBe("review");
    expect(riskLevelFor(80)).toBe("review");
    expect(riskLevelFor(81)).toBe("high_risk");
    expect(riskLevelFor(100)).toBe("high_risk");
  });
});

describe("category saturation", () => {
  it("never exceeds the configured cap however large the raw value", () => {
    for (const [cat, cap] of Object.entries(ANTICHEAT_CONFIG.risk.caps)) {
      const score = categoryScore(cat as keyof typeof ANTICHEAT_CONFIG.risk.caps, 1e6);
      expect(score).toBeLessThanOrEqual(cap);
      expect(score).toBeGreaterThan(cap * 0.99);
    }
  });

  it("is monotonic in the raw value", () => {
    let prev = -1;
    for (const raw of [0, 1, 5, 10, 25, 50, 100]) {
      const score = categoryScore("engine", raw);
      expect(score).toBeGreaterThanOrEqual(prev);
      prev = score;
    }
  });
});

describe("false-positive protection: no single category can force enforcement", () => {
  it("keeps a player below the review band (61) when only one category is saturated", () => {
    for (const cat of ["engine", "timing", "behavior", "connection", "account"] as const) {
      const risk = computeRisk({ ...EMPTY_RAWS, [cat]: 1e6 });
      expect(risk.total).toBeLessThanOrEqual(60);
      expect(risk.level === "review" || risk.level === "high_risk").toBe(false);
    }
  });

  it("one tab switch leaves the score at zero-ish and safe", () => {
    const w = BROWSER_EVENT_WEIGHTS.tab_switch;
    const risk = computeRisk(applyDeltas({ ...EMPTY_RAWS }, { [w.category]: w.weight }));
    expect(risk.level).toBe("safe");
    expect(risk.total).toBeLessThan(2);
  });

  it("one disconnect leaves the score safe", () => {
    const w = BROWSER_EVENT_WEIGHTS.connection_drop;
    const risk = computeRisk(applyDeltas({ ...EMPTY_RAWS }, { [w.category]: w.weight }));
    expect(risk.level).toBe("safe");
  });

  it("reaches the review band only when several categories corroborate", () => {
    const corroborated = computeRisk({
      engine: 60,
      timing: 25,
      behavior: 12,
      connection: 4,
      account: 8,
    });
    expect(corroborated.total).toBeGreaterThan(60);
  });
});

describe("decay", () => {
  it("halves a raw accumulator after exactly one half-life", () => {
    const halfLifeDays = ANTICHEAT_CONFIG.risk.halfLifeDays.behavior;
    const decayed = decayRaws({ ...EMPTY_RAWS, behavior: 10 }, halfLifeDays * DAY);
    expect(decayed.behavior).toBeCloseTo(5, 3);
  });

  it("leaves values untouched for non-positive elapsed time", () => {
    const raws = { ...EMPTY_RAWS, engine: 7 };
    expect(decayRaws(raws, 0).engine).toBe(7);
    expect(decayRaws(raws, -1000).engine).toBe(7);
  });

  it("drives long-dormant evidence back toward safe", () => {
    const decayed = decayRaws({ ...EMPTY_RAWS, behavior: 40 }, 365 * DAY);
    expect(computeRisk(decayed).level).toBe("safe");
  });
});

describe("applyDeltas", () => {
  it("floors at zero when a dismissed flag's contribution is removed", () => {
    const raws = applyDeltas({ ...EMPTY_RAWS, engine: 5 }, { engine: -FLAG_SEVERITY_WEIGHTS.high });
    expect(raws.engine).toBe(0);
  });

  it("adds independent deltas per category", () => {
    const raws = applyDeltas({ ...EMPTY_RAWS }, { engine: 3, timing: 2 });
    expect(raws.engine).toBe(3);
    expect(raws.timing).toBe(2);
    expect(raws.behavior).toBe(0);
  });
});

describe("enforcement gate", () => {
  const base = { totalScore: 0, activeFlagCount: 0, distinctFlagTypes: 0, confirmedFlagCount: 0 };

  it("refuses a ban with no evidence at all", () => {
    expect(enforcementAllowed({ ...base, action: "ban" }).allowed).toBe(false);
  });

  it("refuses a suspension from a single flag of a single type", () => {
    const gate = enforcementAllowed({
      ...base,
      action: "suspension",
      activeFlagCount: 1,
      distinctFlagTypes: 1,
      totalScore: 55,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/distinct indicators/i);
  });

  it("refuses a suspension from many flags of ONE indicator type", () => {
    expect(
      enforcementAllowed({
        ...base,
        action: "suspension",
        activeFlagCount: 6,
        distinctFlagTypes: 1,
        totalScore: 58,
      }).allowed,
    ).toBe(false);
  });

  it("allows a suspension once two distinct indicators corroborate", () => {
    expect(
      enforcementAllowed({
        ...base,
        action: "suspension",
        activeFlagCount: 2,
        distinctFlagTypes: 2,
        totalScore: 55,
      }).allowed,
    ).toBe(true);
  });

  it("allows a ban on a confirmed flag with a high score", () => {
    expect(
      enforcementAllowed({
        ...base,
        action: "ban",
        activeFlagCount: 1,
        distinctFlagTypes: 1,
        confirmedFlagCount: 1,
        totalScore: 72,
      }).allowed,
    ).toBe(true);
  });

  it("refuses a warning with no flags and a safe score", () => {
    expect(enforcementAllowed({ ...base, action: "warning", totalScore: 12 }).allowed).toBe(false);
  });

  it("allows a warning from a single flag", () => {
    expect(enforcementAllowed({ ...base, action: "warning", activeFlagCount: 1 }).allowed).toBe(
      true,
    );
  });

  it("always allows unban and risk reset", () => {
    expect(enforcementAllowed({ ...base, action: "unban" }).allowed).toBe(true);
    expect(enforcementAllowed({ ...base, action: "risk_reset" }).allowed).toBe(true);
  });
});
