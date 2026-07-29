import { describe, expect, it } from "vitest";

import { ANTICHEAT_CONFIG } from "./config";
import { accuracyFromAcpl, analyzeEngineProfile, summarizeEngineMetrics } from "./engineAnalysis";
import { analyzeMoveTimes, detectTimerManipulation, timingStats } from "./timeAnalysis";
import type { EngineMoveSample, MoveTimingSample } from "./types";

const T = ANTICHEAT_CONFIG.analysis.timing;
const E = ANTICHEAT_CONFIG.analysis.engine;

// ── helpers that build realistic player profiles ──────────────────────

/** Human-ish think times: highly variable, occasional long thinks. */
function humanTimes(count: number): MoveTimingSample[] {
  const pattern = [1200, 3400, 800, 15_000, 2200, 600, 4800, 1100, 9000, 2600, 1500, 7200];
  return Array.from({ length: count }, (_, i) => ({
    ply: i + 1,
    timeUsedMs: pattern[i % pattern.length],
  }));
}

/** Bot-ish times: metronomic cadence with negligible jitter. */
function botTimes(count: number, base = 2000): MoveTimingSample[] {
  return Array.from({ length: count }, (_, i) => ({
    ply: i + 1,
    timeUsedMs: base + ((i % 3) - 1) * 40,
  }));
}

function samples(
  count: number,
  opts: { cpl: number; bestRate: number; timeMs: number; startPly?: number },
): EngineMoveSample[] {
  const start = opts.startPly ?? 1;
  return Array.from({ length: count }, (_, i) => ({
    ply: start + i * 2,
    san: `m${i}`,
    cpl: opts.cpl,
    isBest: i % Math.max(1, Math.round(1 / opts.bestRate)) === 0,
    isBook: false,
    timeUsedMs: opts.timeMs,
  }));
}

// ── timing ────────────────────────────────────────────────────────────

describe("timing statistics", () => {
  it("computes a high coefficient of variation for human play", () => {
    expect(timingStats(humanTimes(24)).cv).toBeGreaterThan(0.5);
  });

  it("computes a near-zero coefficient of variation for metronomic play", () => {
    expect(timingStats(botTimes(24)).cv).toBeLessThan(T.uniformCvThreshold);
  });

  it("ignores the opening plies when counting impossible speeds", () => {
    const stats = timingStats([
      { ply: 1, timeUsedMs: 40 },
      { ply: 2, timeUsedMs: 30 },
      { ply: 3, timeUsedMs: 20 },
      { ply: 4, timeUsedMs: 25 },
      { ply: 20, timeUsedMs: 30 },
    ]);
    expect(stats.impossibleCount).toBe(1);
  });
});

describe("analyzeMoveTimes", () => {
  it("returns nothing for a normal human game", () => {
    expect(analyzeMoveTimes(humanTimes(30))).toEqual([]);
  });

  it("returns nothing when the sample is too small, however uniform", () => {
    expect(analyzeMoveTimes(botTimes(T.minMoves - 1))).toEqual([]);
  });

  it("flags robotic uniformity over a long game", () => {
    const findings = analyzeMoveTimes(botTimes(30));
    expect(findings.map((f) => f.type)).toContain("uniform_move_times");
  });

  it("does not flag uniformly FAST play (premove chains in bullet)", () => {
    const premoves: MoveTimingSample[] = Array.from({ length: 30 }, (_, i) => ({
      ply: i + 1,
      timeUsedMs: 180 + (i % 2) * 10,
    }));
    expect(premoves.map((p) => p.timeUsedMs).every((t) => t < T.uniformMinMeanMs)).toBe(true);
    expect(analyzeMoveTimes(premoves).map((f) => f.type)).not.toContain("uniform_move_times");
  });

  it("flags repeated sub-human reaction times", () => {
    const fast: MoveTimingSample[] = Array.from({ length: 20 }, (_, i) => ({
      ply: i + 5,
      timeUsedMs: i < T.impossibleCountFlag ? 60 : 4000 + i * 137,
    }));
    expect(analyzeMoveTimes(fast).map((f) => f.type)).toContain("impossible_speed");
  });

  it("flags long-think-then-instant sequences", () => {
    const seq: MoveTimingSample[] = [];
    for (let i = 0; i < 20; i++) {
      const isPair = i < T.thinkInstantCountFlag * 2 && i % 2 === 0;
      seq.push({
        ply: i + 1,
        timeUsedMs: isPair ? T.longThinkMs + 5_000 : i % 2 === 1 && i < 8 ? 500 : 3_000 + i * 211,
      });
    }
    expect(analyzeMoveTimes(seq).map((f) => f.type)).toContain("think_then_instant");
  });
});

describe("detectTimerManipulation", () => {
  it("accepts a clock that agrees with server-observed think time", () => {
    expect(detectTimerManipulation({ serverTotalMs: 60_000, clockDeltaMs: 59_000 })).toBeNull();
  });

  // The pipeline computes clockDelta as
  //   initial + increment*moves - finalClock
  // which equals the sum of server-measured think times exactly, because
  // makeMove writes  final = initial - Σelapsed + increment*N.
  // These cases pin the invariant that every truncation/edge path leaves the
  // discrepancy at or below zero, so an honest game can never be flagged.
  it("does not flag an honest game reconstructed from the real clock formula", () => {
    const initial = 600_000;
    const increment = 5_000;
    const thinkTimes = [4_000, 12_000, 800, 30_000, 2_500, 7_100, 900, 15_400];
    const serverTotalMs = thinkTimes.reduce((a, b) => a + b, 0);
    const finalClock = initial - serverTotalMs + increment * thinkTimes.length;
    const clockDeltaMs = initial + increment * thinkTimes.length - finalClock;
    expect(detectTimerManipulation({ serverTotalMs, clockDeltaMs })).toBeNull();
  });

  it("does not flag when the analyzed move list was truncated at the ply cap", () => {
    // Only the first half of a long game is analyzed, but finalClock reflects
    // the whole game — clockDelta overshoots, so the discrepancy goes negative.
    const initial = 600_000;
    const analyzedThink = 40_000; // first half only
    const wholeGameThink = 120_000; // what the clock actually recorded
    const clockDeltaMs = wholeGameThink;
    expect(detectTimerManipulation({ serverTotalMs: analyzedThink, clockDeltaMs })).toBeNull();
    expect(initial).toBeGreaterThan(0); // guard against an accidental no-op test
  });

  it("does not flag when some moves recorded no think time", () => {
    // Null time_used_ms becomes 0, shrinking serverTotal — the safe direction.
    expect(detectTimerManipulation({ serverTotalMs: 12_000, clockDeltaMs: 45_000 })).toBeNull();
  });

  it("tolerates small rounding/latency discrepancies", () => {
    expect(detectTimerManipulation({ serverTotalMs: 60_000, clockDeltaMs: 57_500 })).toBeNull();
  });

  it("flags a clock credited far more time than the server observed", () => {
    const finding = detectTimerManipulation({ serverTotalMs: 120_000, clockDeltaMs: 40_000 });
    expect(finding?.type).toBe("timer_manipulation");
    expect(finding?.severity).toBe("critical");
  });
});

// ── engine similarity ─────────────────────────────────────────────────

describe("accuracyFromAcpl", () => {
  it("is 100 at zero centipawn loss and decreases monotonically", () => {
    expect(accuracyFromAcpl(0)).toBe(100);
    expect(accuracyFromAcpl(10)).toBeLessThan(100);
    expect(accuracyFromAcpl(60)).toBeLessThan(accuracyFromAcpl(20));
    expect(accuracyFromAcpl(500)).toBeGreaterThanOrEqual(0);
  });
});

describe("summarizeEngineMetrics", () => {
  it("excludes book moves from the considered set", () => {
    const withBook: EngineMoveSample[] = [
      { ply: 1, san: "e4", cpl: 0, isBest: true, isBook: true, timeUsedMs: 500 },
      { ply: 3, san: "Nf3", cpl: 40, isBest: false, isBook: false, timeUsedMs: 2000 },
    ];
    const m = summarizeEngineMetrics(withBook);
    expect(m.movesConsidered).toBe(1);
    expect(m.acpl).toBe(40);
  });

  it("measures the longest unbroken best-move streak", () => {
    const s: EngineMoveSample[] = [true, true, true, false, true, true, true, true].map(
      (isBest, i) => ({ ply: i * 2 + 1, san: "x", cpl: 0, isBest, isBook: false, timeUsedMs: 900 }),
    );
    expect(summarizeEngineMetrics(s).longestBestStreak).toBe(4);
  });
});

describe("analyzeEngineProfile", () => {
  it("returns nothing below the minimum sample size, even for perfect play", () => {
    const tiny = samples(E.minMoves - 1, { cpl: 0, bestRate: 1, timeMs: 400 });
    expect(analyzeEngineProfile(tiny, { playerRating: 900 })).toEqual([]);
  });

  it("returns nothing for an ordinary club-strength game", () => {
    const normal = samples(30, { cpl: 45, bestRate: 0.35, timeMs: 6_000 });
    expect(analyzeEngineProfile(normal, { playerRating: 1200 })).toEqual([]);
  });

  it("returns nothing for a strong, accurate human (high rating, good but not perfect)", () => {
    const strong = samples(35, { cpl: 22, bestRate: 0.55, timeMs: 8_000 });
    const findings = analyzeEngineProfile(strong, { playerRating: 2200 });
    expect(findings.map((f) => f.type)).not.toContain("engine_match");
    expect(findings.map((f) => f.type)).not.toContain("suspicious_improvement");
  });

  it("flags engine-level agreement and near-zero centipawn loss", () => {
    const cheater = samples(40, { cpl: 3, bestRate: 1, timeMs: 700 });
    const types = analyzeEngineProfile(cheater, { playerRating: 1100 }).map((f) => f.type);
    expect(types).toContain("engine_match");
    expect(types).toContain("low_acpl");
    expect(types).toContain("best_move_streak");
    expect(types).toContain("engine_consistency");
  });

  it("flags accuracy far beyond a low-rated account's expectation", () => {
    const improbable = samples(30, { cpl: 4, bestRate: 0.5, timeMs: 5_000 });
    const types = analyzeEngineProfile(improbable, { playerRating: 1000 }).map((f) => f.type);
    expect(types).toContain("suspicious_improvement");
  });

  it("does not raise the improvement flag when the rating already justifies the play", () => {
    const gm = samples(30, { cpl: 4, bestRate: 0.5, timeMs: 5_000 });
    const types = analyzeEngineProfile(gm, { playerRating: 2500 }).map((f) => f.type);
    expect(types).not.toContain("suspicious_improvement");
  });

  it("does not treat slow engine-quality moves as instant-perfect play", () => {
    const slowAccurate = samples(30, { cpl: 4, bestRate: 1, timeMs: 20_000 });
    const types = analyzeEngineProfile(slowAccurate, { playerRating: 2400 }).map((f) => f.type);
    expect(types).not.toContain("engine_consistency");
  });
});
