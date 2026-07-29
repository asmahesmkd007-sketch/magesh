// =====================================================================
// ANTI-CHEAT — engine-similarity analysis (pure)
// ---------------------------------------------------------------------
// Turns per-move engine comparisons (produced server-side against the
// shared negamax reference in lib/chess/evaluation.ts) into metrics and
// review findings: engine match %, best-move frequency/streaks, ACPL,
// accuracy, instant perfect moves and rating-relative improvement.
// Pure and threshold-driven (config.ts) so it is unit-testable.
// =====================================================================

import { ANTICHEAT_CONFIG } from "./config";
import type { EngineFinding, EngineMetrics, EngineMoveSample } from "./types";

const CFG = ANTICHEAT_CONFIG.analysis.engine;

/** Smooth ACPL → accuracy mapping (100 at 0 loss, ~50 at 60 ACPL). */
export function accuracyFromAcpl(acpl: number): number {
  const acc = 100 * Math.exp(-Math.max(0, acpl) / 85);
  return Math.round(acc * 100) / 100;
}

export function summarizeEngineMetrics(samples: EngineMoveSample[]): EngineMetrics {
  const considered = samples.filter((s) => !s.isBook);
  const n = considered.length;
  const totalCpl = considered.reduce((a, s) => a + s.cpl, 0);
  const acpl = n ? totalCpl / n : 0;
  const bestCount = considered.filter((s) => s.isBest).length;

  let longestBestStreak = 0;
  let run = 0;
  for (const s of considered) {
    run = s.isBest ? run + 1 : 0;
    if (run > longestBestStreak) longestBestStreak = run;
  }

  const instantBestMoves = considered.filter(
    (s) => s.isBest && s.timeUsedMs > 0 && s.timeUsedMs < CFG.instantMoveMs,
  ).length;

  return {
    movesConsidered: n,
    acpl: Math.round(acpl * 100) / 100,
    bestMovePct: n ? Math.round((bestCount / n) * 10000) / 100 : 0,
    accuracy: accuracyFromAcpl(acpl),
    longestBestStreak,
    instantBestMoves,
  };
}

/**
 * Evaluate one player's engine profile for a single game. Below the
 * minimum sample size nothing is returned — a brilliant miniature is
 * not evidence. Findings are inputs to human review, never verdicts.
 */
export function analyzeEngineProfile(
  samples: EngineMoveSample[],
  context: { playerRating: number | null },
): EngineFinding[] {
  const findings: EngineFinding[] = [];
  const metrics = summarizeEngineMetrics(samples);
  if (metrics.movesConsidered < CFG.minMoves) return findings;

  if (metrics.bestMovePct >= CFG.matchPctFlag) {
    findings.push({
      type: "engine_match",
      severity: metrics.bestMovePct >= CFG.matchPctCritical ? "critical" : "high",
      summary: `${metrics.bestMovePct}% of ${metrics.movesConsidered} moves matched the reference engine's first choice`,
      details: { bestMovePct: metrics.bestMovePct, moves: metrics.movesConsidered },
    });
  }

  if (metrics.acpl <= CFG.acplFlag) {
    findings.push({
      type: "low_acpl",
      severity: metrics.acpl <= CFG.acplCritical ? "critical" : "high",
      summary: `Average centipawn loss of ${metrics.acpl} over ${metrics.movesConsidered} moves`,
      details: { acpl: metrics.acpl, accuracy: metrics.accuracy, moves: metrics.movesConsidered },
    });
  }

  if (metrics.longestBestStreak >= CFG.bestStreakFlag) {
    findings.push({
      type: "best_move_streak",
      severity: "medium",
      summary: `${metrics.longestBestStreak} consecutive engine-first moves`,
      details: { streak: metrics.longestBestStreak },
    });
  }

  if (metrics.instantBestMoves >= CFG.instantBestFlag) {
    findings.push({
      type: "engine_consistency",
      severity: "high",
      summary: `${metrics.instantBestMoves} engine-best moves each played in under ${CFG.instantMoveMs}ms`,
      details: { instantBestMoves: metrics.instantBestMoves, thresholdMs: CFG.instantMoveMs },
    });
  }

  if (
    context.playerRating !== null &&
    context.playerRating <= CFG.improvementMaxRating &&
    metrics.accuracy >= CFG.improvementAccuracy
  ) {
    findings.push({
      type: "suspicious_improvement",
      severity: "medium",
      summary: `Accuracy ${metrics.accuracy} far above the expectation for a ${context.playerRating}-rated account`,
      details: { accuracy: metrics.accuracy, rating: context.playerRating },
    });
  }

  return findings;
}
