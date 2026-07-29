// =====================================================================
// ANTI-CHEAT — move-time analysis (pure)
// ---------------------------------------------------------------------
// Statistical checks over the SERVER-measured think times of one
// player's moves in one game (game_moves.time_used_ms — the client's
// clock is never trusted). Consumed by the post-game pipeline
// (analysis.server.ts); pure so it is unit-testable.
// =====================================================================

import { ANTICHEAT_CONFIG } from "./config";
import type { MoveTimingSample, TimingFinding } from "./types";

const CFG = ANTICHEAT_CONFIG.analysis.timing;

export interface TimingStats {
  moves: number;
  meanMs: number;
  stdDevMs: number;
  /** Coefficient of variation (stdDev / mean); low = robotic cadence. */
  cv: number;
  impossibleCount: number;
  thinkInstantCount: number;
}

export function timingStats(samples: MoveTimingSample[]): TimingStats {
  const times = samples.map((s) => s.timeUsedMs);
  const n = times.length;
  const mean = n ? times.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n ? times.reduce((a, b) => a + (b - mean) ** 2, 0) / n : 0;
  const stdDev = Math.sqrt(variance);

  let impossibleCount = 0;
  for (const s of samples) {
    // Skip the first plies: premoves and rote opening theory are
    // legitimately near-instant.
    if (s.ply <= ANTICHEAT_CONFIG.server.speedCheckMinPly) continue;
    if (s.timeUsedMs < CFG.impossibleMs) impossibleCount++;
  }

  // Long think immediately followed by an instant reply — the signature
  // of "feed position to an engine, then blitz its answer".
  let thinkInstantCount = 0;
  for (let i = 1; i < samples.length; i++) {
    if (
      samples[i - 1].timeUsedMs >= CFG.longThinkMs &&
      samples[i].timeUsedMs <= CFG.instantAfterThinkMs
    ) {
      thinkInstantCount++;
    }
  }

  return {
    moves: n,
    meanMs: mean,
    stdDevMs: stdDev,
    cv: mean > 0 ? stdDev / mean : 0,
    impossibleCount,
    thinkInstantCount,
  };
}

/**
 * Evaluate one player's timing profile for a single game. Returns zero
 * or more findings — never a verdict. Small samples return nothing:
 * statistics over a handful of moves are noise, not evidence.
 */
export function analyzeMoveTimes(samples: MoveTimingSample[]): TimingFinding[] {
  const findings: TimingFinding[] = [];
  if (samples.length < CFG.minMoves) return findings;

  const stats = timingStats(samples);

  // Robotic cadence: humans think in bursts; automation is metronomic.
  // Only meaningful when moves actually take time — uniformly FAST play
  // (blitz premove chains) is normal, so require a real mean.
  if (stats.cv < CFG.uniformCvThreshold && stats.meanMs >= CFG.uniformMinMeanMs) {
    findings.push({
      type: "uniform_move_times",
      severity: stats.cv < CFG.uniformCvThreshold / 2 ? "high" : "medium",
      summary: `Near-identical think times across ${stats.moves} moves (cv ${stats.cv.toFixed(3)}, mean ${Math.round(stats.meanMs)}ms)`,
      details: {
        cv: round3(stats.cv),
        meanMs: Math.round(stats.meanMs),
        stdDevMs: Math.round(stats.stdDevMs),
        moves: stats.moves,
      },
    });
  }

  if (stats.impossibleCount >= CFG.impossibleCountFlag) {
    findings.push({
      type: "impossible_speed",
      severity: stats.impossibleCount >= CFG.impossibleCountFlag * 2 ? "high" : "medium",
      summary: `${stats.impossibleCount} moves played in under ${CFG.impossibleMs}ms (server-measured)`,
      details: { count: stats.impossibleCount, thresholdMs: CFG.impossibleMs },
    });
  }

  if (stats.thinkInstantCount >= CFG.thinkInstantCountFlag) {
    findings.push({
      type: "think_then_instant",
      severity: "medium",
      summary: `${stats.thinkInstantCount} long thinks (≥${Math.round(CFG.longThinkMs / 1000)}s) each followed by an instant reply`,
      details: {
        count: stats.thinkInstantCount,
        longThinkMs: CFG.longThinkMs,
        instantMs: CFG.instantAfterThinkMs,
      },
    });
  }

  return findings;
}

/**
 * Cross-check the client-claimed clock against server-measured time.
 * `serverTotalMs` is the sum of server-side think times; `clockDeltaMs`
 * is how much the player's DB clock actually decreased (net of
 * increments). A material shortfall means the stored clock was credited
 * more time than the server observed — timer manipulation evidence.
 */
export function detectTimerManipulation(input: {
  serverTotalMs: number;
  clockDeltaMs: number;
  toleranceMs?: number;
}): TimingFinding | null {
  const tolerance = input.toleranceMs ?? 3_000;
  const discrepancy = input.serverTotalMs - input.clockDeltaMs;
  if (discrepancy <= tolerance) return null;
  return {
    type: "timer_manipulation",
    severity: discrepancy > tolerance * 3 ? "critical" : "high",
    summary: `Player clock credited ${Math.round(discrepancy / 1000)}s more than server-observed think time`,
    details: {
      serverTotalMs: Math.round(input.serverTotalMs),
      clockDeltaMs: Math.round(input.clockDeltaMs),
      discrepancyMs: Math.round(discrepancy),
    },
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
