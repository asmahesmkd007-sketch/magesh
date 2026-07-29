// =====================================================================
// ANTI-CHEAT — central configuration
// ---------------------------------------------------------------------
// Every tunable lives here so detection behavior can be adjusted in one
// place without touching detector/analysis code. Values are grouped by
// subsystem; the risk section is consumed by risk.ts (pure) and the
// rest by the client detector and server pipeline.
// =====================================================================

import type { AntiCheatSeverity, BrowserEventType, RiskCategory, ServerEventType } from "./types";

export const ANTICHEAT_CONFIG = {
  /** Master switch — flip off to stop all client reporting + analysis. */
  enabled: true,

  client: {
    /** Flush the event queue at most this often (ms). */
    flushIntervalMs: 12_000,
    /** …or as soon as this many distinct queued entries accumulate. */
    flushMaxEvents: 20,
    /** Hard cap of reports per flush payload (server enforces too). */
    maxEventsPerBatch: 40,
    /** localStorage key for events that couldn't be flushed before unload. */
    pendingStorageKey: "chessox.ac.pending",
    /** BroadcastChannel name used for multi-tab detection. */
    broadcastChannel: "chessox-ac",
    /** Rapid hide/show cycles within this window count as churn. */
    visibilityChurnWindowMs: 60_000,
    visibilityChurnThreshold: 6,
    /** DevTools window-chrome size heuristic (px). */
    devtoolsSizeDelta: 200,
    devtoolsCheckDebounceMs: 1_000,
    /** Native-function integrity sweep cadence (ms, idle-scheduled). */
    integrityCheckIntervalMs: 30_000,
    /** Timer heartbeat: expected interval and the drift that flags. */
    heartbeatIntervalMs: 5_000,
    heartbeatDriftMs: 2_500,
    /** Wall-clock vs monotonic-clock divergence that flags (ms). */
    clockSkewThresholdMs: 5_000,
    /** Reaction faster than this after an opponent move is recorded. */
    instantReactionMs: 400,
    /** No pointer/key activity for this long ⇒ "idle" before a reply. */
    idleBeforeReplyMs: 5_000,
    /** Macro cadence: this many consecutive clicks within jitter ⇒ flag. */
    macroClickRun: 6,
    macroClickJitterMs: 25,
  },

  server: {
    /** Batches accepted per user per minute. */
    reportRateLimit: { limit: 8, windowMs: 60_000 },
    /** Fingerprint registrations per user per hour. */
    fingerprintRateLimit: { limit: 12, windowMs: 3_600_000 },
    /** Per-event-type count cap inside one batch (anti-noise). */
    maxCountPerEvent: 200,
    /** Metadata blob cap per event (serialized chars). */
    maxMetaChars: 600,
    /** Server-side think time below this is recorded (ms). */
    impossibleMoveMs: 120,
    /** Ignore the first N plies for speed checks (premoves/theory). */
    speedCheckMinPly: 4,
  },

  analysis: {
    /** Only analyze rated human-vs-human games with at least this many plies. */
    minPlies: 12,
    /** CPU budget: analyze at most the first N plies (the replay must start
     * from move 1, so a long game is truncated at the end, not the start). */
    maxPlies: 160,
    /** Negamax depth for the reference engine (server CPU budget). */
    engineDepth: 3,
    /** Opening plies excluded from engine-match statistics. */
    bookPlies: 8,
    /** Sweep: how far back to look for finished-but-unanalyzed games. */
    sweepWindowHours: 24,
    sweepMaxGames: 4,

    engine: {
      /** Moves (non-book, own) needed before engine stats mean anything. */
      minMoves: 15,
      /** Best-move agreement ≥ this ⇒ engine_match flag (pct). */
      matchPctFlag: 78,
      matchPctCritical: 88,
      /** ACPL ≤ this ⇒ low_acpl flag (centipawns). */
      acplFlag: 12,
      acplCritical: 6,
      /** Unbroken engine-first streak ≥ this ⇒ best_move_streak flag. */
      bestStreakFlag: 10,
      /** accuracy ≥ this AND rating below threshold ⇒ suspicious_improvement. */
      improvementAccuracy: 90,
      improvementMaxRating: 1600,
      /** Engine-best moves played faster than this count as "instant". */
      instantMoveMs: 1_000,
      instantBestFlag: 6,
    },

    timing: {
      /** Moves needed before timing statistics are meaningful. */
      minMoves: 12,
      /** Coefficient of variation below this ⇒ uniform_move_times. */
      uniformCvThreshold: 0.18,
      /** …but only when the mean think time exceeds this (ms). */
      uniformMinMeanMs: 800,
      /** Think time below this is humanly impossible for a considered move. */
      impossibleMs: 150,
      /** Occurrences needed to raise impossible_speed. */
      impossibleCountFlag: 5,
      /** "Long think" threshold for think_then_instant (ms). */
      longThinkMs: 20_000,
      /** "Instant reply" threshold following a long think (ms). */
      instantAfterThinkMs: 1_500,
      /** Long-think→instant sequences needed to flag. */
      thinkInstantCountFlag: 3,
    },

    connection: {
      /** Disconnects in one game ⇒ disconnect_abuse candidate. */
      disconnectsPerGameFlag: 4,
      /** Reconnect cycles across recent games ⇒ reconnect_abuse. */
      reconnectCyclesFlag: 8,
      recentGamesWindow: 10,
    },
  },

  multiAccount: {
    /** Distinct accounts on one fingerprint before flagging. */
    accountsPerDeviceFlag: 2,
    /** Cooldown between repeated multi_account flags per user (hours). */
    reflagCooldownHours: 72,
  },

  risk: {
    /** Per-category ceiling of the 0-100 total. Sums > 100 are clamped.
     * Ceilings are chosen so no single category can push a player past
     * "warning" (60) on its own — reaching "review"/"high_risk" requires
     * corroborating signals from at least two categories. */
    caps: {
      engine: 45,
      timing: 25,
      behavior: 15,
      connection: 15,
      account: 20,
    } satisfies Record<RiskCategory, number>,
    /** Saturation constant per category: score = cap·(1 − e^(−raw/k)). */
    k: {
      engine: 30,
      timing: 18,
      behavior: 12,
      connection: 10,
      account: 12,
    } satisfies Record<RiskCategory, number>,
    /** Exponential decay half-life of raw accumulators, per category (days). */
    halfLifeDays: {
      engine: 30,
      timing: 30,
      behavior: 10,
      connection: 10,
      account: 45,
    } satisfies Record<RiskCategory, number>,
    /** Band boundaries (inclusive upper bounds). */
    bands: [
      { max: 20, level: "safe" },
      { max: 40, level: "monitor" },
      { max: 60, level: "warning" },
      { max: 80, level: "review" },
      { max: 100, level: "high_risk" },
    ] as const,
  },

  enforcement: {
    /** Suspension/ban requires ≥ this many non-dismissed flags… */
    minFlagsForSuspension: 2,
    /** …spanning ≥ this many distinct flag types (or 1 confirmed flag). */
    minDistinctTypesForSuspension: 2,
    /** Warning/restriction requires at least one flag or this score. */
    minScoreForWarning: 41,
  },

  notifications: {
    /** Suppress duplicate admin alerts per (user, kind) for this long. */
    dedupeWindowMs: 60 * 60 * 1000,
  },
} as const;

export type AntiCheatConfig = typeof ANTICHEAT_CONFIG;

// ── Event weight table ────────────────────────────────────────────────
// How much raw accumulator each event contributes, and to which risk
// category. Weights are per occurrence; batched counts multiply but are
// capped per batch so telemetry noise can't snowball (see perBatchCap).
export interface EventWeight {
  category: RiskCategory;
  weight: number;
  severity: AntiCheatSeverity;
  /** Max total contribution a single batch may add for this type. */
  perBatchCap: number;
}

export const BROWSER_EVENT_WEIGHTS: Record<BrowserEventType, EventWeight> = {
  tab_switch: { category: "behavior", weight: 0.15, severity: "info", perBatchCap: 1.5 },
  focus_loss: { category: "behavior", weight: 0.1, severity: "info", perBatchCap: 1 },
  excessive_visibility_toggle: {
    category: "behavior",
    weight: 0.8,
    severity: "low",
    perBatchCap: 2.4,
  },
  multiple_tabs: { category: "behavior", weight: 0.5, severity: "low", perBatchCap: 1 },
  multiple_tabs_same_game: { category: "behavior", weight: 2, severity: "medium", perBatchCap: 4 },
  page_refresh: { category: "connection", weight: 0.5, severity: "info", perBatchCap: 1 },
  back_navigation: { category: "connection", weight: 0.3, severity: "info", perBatchCap: 0.9 },
  devtools_open: { category: "behavior", weight: 1.2, severity: "low", perBatchCap: 2.4 },
  devtools_shortcut: { category: "behavior", weight: 0.6, severity: "low", perBatchCap: 1.2 },
  console_tamper: { category: "behavior", weight: 3, severity: "medium", perBatchCap: 6 },
  function_override: { category: "behavior", weight: 3.5, severity: "high", perBatchCap: 7 },
  dom_injection: { category: "behavior", weight: 2.5, severity: "medium", perBatchCap: 5 },
  timer_anomaly: { category: "timing", weight: 1.5, severity: "low", perBatchCap: 3 },
  clock_skew: { category: "timing", weight: 2.5, severity: "medium", perBatchCap: 5 },
  untrusted_input: { category: "behavior", weight: 4, severity: "high", perBatchCap: 8 },
  macro_pattern: { category: "behavior", weight: 3, severity: "medium", perBatchCap: 6 },
  instant_reaction: { category: "timing", weight: 0.8, severity: "low", perBatchCap: 3.2 },
  suspicious_idle: { category: "timing", weight: 1, severity: "low", perBatchCap: 3 },
  connection_drop: { category: "connection", weight: 0.4, severity: "info", perBatchCap: 2 },
  connection_restore: { category: "connection", weight: 0, severity: "info", perBatchCap: 0 },
};

export const SERVER_EVENT_WEIGHTS: Record<ServerEventType, EventWeight> = {
  illegal_move_attempt: { category: "behavior", weight: 2, severity: "medium", perBatchCap: 6 },
  wrong_turn_move: { category: "behavior", weight: 1, severity: "low", perBatchCap: 3 },
  non_player_move: { category: "behavior", weight: 3, severity: "high", perBatchCap: 6 },
  banned_player_move_attempt: {
    category: "account",
    weight: 2,
    severity: "medium",
    perBatchCap: 4,
  },
  duplicate_move: { category: "connection", weight: 1.5, severity: "medium", perBatchCap: 4.5 },
  move_rate_exceeded: { category: "behavior", weight: 1, severity: "low", perBatchCap: 3 },
  impossible_move_speed: { category: "timing", weight: 1, severity: "low", perBatchCap: 4 },
  report_filed: { category: "account", weight: 2, severity: "low", perBatchCap: 4 },
};

/** Raw-accumulator contribution for a flag of the given severity. */
export const FLAG_SEVERITY_WEIGHTS: Record<AntiCheatSeverity, number> = {
  info: 2,
  low: 6,
  medium: 12,
  high: 22,
  critical: 35,
};

/** Which risk category each flag type feeds (used when dismissing too). */
export const FLAG_TYPE_CATEGORIES: Record<import("./types").FlagType, RiskCategory> = {
  engine_match: "engine",
  low_acpl: "engine",
  best_move_streak: "engine",
  engine_consistency: "engine",
  suspicious_improvement: "engine",
  uniform_move_times: "timing",
  impossible_speed: "timing",
  think_then_instant: "timing",
  timer_manipulation: "timing",
  disconnect_abuse: "connection",
  reconnect_abuse: "connection",
  multi_account: "account",
  manual_review: "account",
};
