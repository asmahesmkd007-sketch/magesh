// =====================================================================
// ANTI-CHEAT — risk scoring engine (pure)
// ---------------------------------------------------------------------
// The ONLY place the 0-100 risk score is computed. Server ingestion
// decays + accumulates the raw category values and calls computeRisk();
// admin actions (dismiss flag, reset) adjust raws and re-derive through
// the same function, so the score can never drift between code paths.
//
// Design: each category saturates toward its cap (score = cap·(1−e^(−raw/k)))
// and the caps are sized so no single category alone crosses the
// "review" boundary (61). That is the structural false-positive guard:
// one kind of evidence — however much of it — cannot mark a player for
// enforcement; it takes corroboration across categories.
// =====================================================================

import { ANTICHEAT_CONFIG } from "./config";
import type { RawRiskAccumulators, RiskCategory, RiskComputation, RiskLevel } from "./types";

export const RISK_CATEGORIES: RiskCategory[] = [
  "engine",
  "timing",
  "behavior",
  "connection",
  "account",
];

export const EMPTY_RAWS: RawRiskAccumulators = {
  engine: 0,
  timing: 0,
  behavior: 0,
  connection: 0,
  account: 0,
};

/** Map a 0-100 total to its band. */
export function riskLevelFor(total: number): RiskLevel {
  for (const band of ANTICHEAT_CONFIG.risk.bands) {
    if (total <= band.max) return band.level;
  }
  return "high_risk";
}

/** Saturating per-category score: cap·(1 − e^(−raw/k)). */
export function categoryScore(category: RiskCategory, raw: number): number {
  if (raw <= 0) return 0;
  const cap = ANTICHEAT_CONFIG.risk.caps[category];
  const k = ANTICHEAT_CONFIG.risk.k[category];
  return round2(cap * (1 - Math.exp(-raw / k)));
}

/** Compute the full risk picture from raw accumulators. */
export function computeRisk(raws: RawRiskAccumulators): RiskComputation {
  const components = {
    engine: categoryScore("engine", raws.engine),
    timing: categoryScore("timing", raws.timing),
    behavior: categoryScore("behavior", raws.behavior),
    connection: categoryScore("connection", raws.connection),
    account: categoryScore("account", raws.account),
  };
  const sum =
    components.engine +
    components.timing +
    components.behavior +
    components.connection +
    components.account;
  const total = Math.min(100, Math.round(sum));
  return { total, level: riskLevelFor(total), components };
}

/**
 * Exponentially decay raw accumulators for the time elapsed since they
 * were last decayed. Applied lazily on every update — no cron needed.
 */
export function decayRaws(raws: RawRiskAccumulators, elapsedMs: number): RawRiskAccumulators {
  if (elapsedMs <= 0) return { ...raws };
  const out = { ...EMPTY_RAWS };
  for (const cat of RISK_CATEGORIES) {
    const halfLifeMs = ANTICHEAT_CONFIG.risk.halfLifeDays[cat] * 24 * 60 * 60 * 1000;
    const factor = Math.pow(0.5, elapsedMs / halfLifeMs);
    const decayed = raws[cat] * factor;
    out[cat] = decayed < 0.001 ? 0 : round4(decayed);
  }
  return out;
}

/** Add category deltas onto (already-decayed) raws. Negative deltas floor at 0. */
export function applyDeltas(
  raws: RawRiskAccumulators,
  deltas: Partial<RawRiskAccumulators>,
): RawRiskAccumulators {
  const out = { ...raws };
  for (const cat of RISK_CATEGORIES) {
    const d = deltas[cat];
    if (d === undefined || d === 0) continue;
    out[cat] = round4(Math.max(0, out[cat] + d));
  }
  return out;
}

/**
 * Enforcement gate — the codified false-positive policy. Suspension and
 * ban demand corroborated evidence; a single event/flag/report can never
 * satisfy it. Warning/restriction have a lower, but still non-trivial, bar.
 */
export function enforcementAllowed(input: {
  action: "warning" | "restriction" | "suspension" | "ban" | "unban" | "risk_reset";
  totalScore: number;
  activeFlagCount: number; // open / under_review / confirmed
  distinctFlagTypes: number;
  confirmedFlagCount: number;
}): { allowed: boolean; reason?: string } {
  const { action, totalScore, activeFlagCount, distinctFlagTypes, confirmedFlagCount } = input;
  if (action === "unban" || action === "risk_reset") return { allowed: true };

  if (action === "warning" || action === "restriction") {
    if (activeFlagCount >= 1 || totalScore >= ANTICHEAT_CONFIG.enforcement.minScoreForWarning) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        "Insufficient evidence: a warning/restriction needs at least one active flag or a risk score in the warning band.",
    };
  }

  // suspension / ban
  const { minFlagsForSuspension, minDistinctTypesForSuspension } = ANTICHEAT_CONFIG.enforcement;
  if (confirmedFlagCount >= 1 && totalScore > 60) return { allowed: true };
  if (
    activeFlagCount >= minFlagsForSuspension &&
    distinctFlagTypes >= minDistinctTypesForSuspension
  ) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Insufficient evidence for ${action}: requires ${minFlagsForSuspension}+ active flags across ${minDistinctTypesForSuspension}+ distinct indicators, or a confirmed flag with a risk score above 60. Review the evidence and confirm a flag first.`,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
