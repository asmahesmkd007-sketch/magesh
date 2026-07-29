// =====================================================================
// ANTI-CHEAT — shared type vocabulary
// ---------------------------------------------------------------------
// Single source of truth for event names, severities, risk levels and
// row shapes used by the client detector, the server ingestion path,
// the analysis pipeline and the admin dashboard. Everything here is
// isomorphic (no browser or Node APIs) so both bundles can import it.
// =====================================================================

/** Where an event was observed. Mirrors the DB CHECK constraint. */
export type AntiCheatSource = "client" | "server" | "analysis" | "realtime";

/** Evidence weight class. Mirrors the DB CHECK constraint. */
export type AntiCheatSeverity = "info" | "low" | "medium" | "high" | "critical";

/** Risk bands (0-20 / 21-40 / 41-60 / 61-80 / 81-100). */
export type RiskLevel = "safe" | "monitor" | "warning" | "review" | "high_risk";

/** Scoring dimensions. Each event type feeds exactly one of these. */
export type RiskCategory = "engine" | "timing" | "behavior" | "connection" | "account";

// ── Client-observed browser telemetry (batched into browser_events) ───
export const BROWSER_EVENT_TYPES = [
  "tab_switch", // visibilitychange → hidden
  "focus_loss", // window blur
  "excessive_visibility_toggle", // rapid minimize/restore churn
  "multiple_tabs", // another ChessOX tab answered our broadcast ping
  "multiple_tabs_same_game", // …and it was on the same game as a player
  "page_refresh", // navigation type "reload" during an active game
  "back_navigation", // history back/forward into an active game
  "devtools_open", // window-chrome size heuristic
  "devtools_shortcut", // F12 / Ctrl+Shift+I/J/C pressed
  "console_tamper", // native console methods replaced
  "function_override", // core natives (fetch, timers, WebSocket…) patched
  "dom_injection", // foreign script/iframe injected after load
  "timer_anomaly", // interval timers throttled/blocked while visible
  "clock_skew", // Date.now vs performance.now drift (clock manipulation)
  "untrusted_input", // synthetic (isTrusted=false) pointer events on the board
  "macro_pattern", // near-identical inter-click cadence
  "instant_reaction", // move submitted implausibly fast after opponent's
  "suspicious_idle", // zero interaction before an instant reply
  "connection_drop", // realtime channel lost during an active game
  "connection_restore", // realtime channel re-established
] as const;
export type BrowserEventType = (typeof BROWSER_EVENT_TYPES)[number];

// ── Server-observed events (written straight to anti_cheat_events) ────
export const SERVER_EVENT_TYPES = [
  "illegal_move_attempt", // move rejected by chess.js against stored FEN
  "wrong_turn_move", // move submitted while it's the opponent's turn
  "non_player_move", // move for a game the caller isn't seated in
  "banned_player_move_attempt", // suspended/banned account tried to move
  "duplicate_move", // same ply committed twice (replay/packet duplication)
  "move_rate_exceeded", // per-user move rate limit tripped
  "impossible_move_speed", // server-measured think time below human floor
  "report_filed", // another player reported this user
] as const;
export type ServerEventType = (typeof SERVER_EVENT_TYPES)[number];

// ── Analysis-produced events / flag types ─────────────────────────────
export const ANALYSIS_EVENT_TYPES = [
  "analysis_started",
  "analysis_completed",
  "analysis_failed",
] as const;
export type AnalysisEventType = (typeof ANALYSIS_EVENT_TYPES)[number];

export const FLAG_TYPES = [
  "engine_match", // engine top-move agreement over threshold
  "low_acpl", // average centipawn loss below human plausibility
  "best_move_streak", // long unbroken runs of engine-first moves
  "engine_consistency", // engine-level play sustained across the game
  "suspicious_improvement", // performance far above the account's rating
  "uniform_move_times", // variance in think times too low for a human
  "impossible_speed", // repeated sub-human reaction times
  "think_then_instant", // long thinks followed by instant perfect replies
  "timer_manipulation", // client clock claims contradict server clocks
  "disconnect_abuse", // pattern of dropping when losing
  "reconnect_abuse", // reconnect cycling to gain thinking time
  "multi_account", // shared device fingerprint / IP overlap
  "manual_review", // raised by an admin by hand
] as const;
export type FlagType = (typeof FLAG_TYPES)[number];

export type AntiCheatEventType = BrowserEventType | ServerEventType | AnalysisEventType;

// ── Wire format: client → server batched report ───────────────────────
export interface ClientEventReport {
  type: BrowserEventType;
  /** Aggregated occurrences inside this batch window (≥1). */
  count: number;
  /** Client wall-clock of the first occurrence (ms epoch) — a claim, not truth. */
  firstAt: number;
  /** Small, bounded context blob (validated + size-capped server-side). */
  meta?: Record<string, string | number | boolean>;
}

export interface ClientEventBatch {
  gameId: string | null;
  sessionId: string;
  events: ClientEventReport[];
}

// ── Risk scoring shapes ───────────────────────────────────────────────
/** Decayed per-category accumulators persisted in player_risk_scores.raw_*. */
export interface RawRiskAccumulators {
  engine: number;
  timing: number;
  behavior: number;
  connection: number;
  account: number;
}

export interface RiskComputation {
  total: number; // 0..100
  level: RiskLevel;
  components: RawRiskAccumulators; // normalized per-category scores (capped)
}

// ── Analysis result shapes ────────────────────────────────────────────
export interface MoveTimingSample {
  ply: number;
  /** Server-measured think time for this move in ms. */
  timeUsedMs: number;
}

export interface TimingFinding {
  type: Extract<
    FlagType,
    "uniform_move_times" | "impossible_speed" | "think_then_instant" | "timer_manipulation"
  >;
  severity: AntiCheatSeverity;
  summary: string;
  details: Record<string, unknown>;
}

export interface EngineMoveSample {
  ply: number;
  san: string;
  /** Centipawn loss vs the reference engine's best move. */
  cpl: number;
  /** The played move equals the reference engine's first choice. */
  isBest: boolean;
  /** Move was still in opening book plies (excluded from match stats). */
  isBook: boolean;
  timeUsedMs: number;
}

export interface EngineMetrics {
  movesConsidered: number;
  acpl: number;
  bestMovePct: number; // 0..100
  accuracy: number; // 0..100 (smooth ACPL→accuracy mapping)
  longestBestStreak: number;
  /** Best-move rate on "critical" moves (positions where cpl spread is wide). */
  instantBestMoves: number; // engine-best moves played in < instantMoveMs
}

export interface EngineFinding {
  type: Extract<
    FlagType,
    | "engine_match"
    | "low_acpl"
    | "best_move_streak"
    | "engine_consistency"
    | "suspicious_improvement"
  >;
  severity: AntiCheatSeverity;
  summary: string;
  details: Record<string, unknown>;
}

// ── DB row shapes (tables are not in the generated Supabase types) ────
export interface PlayerRiskRow {
  user_id: string;
  total_score: number;
  risk_level: RiskLevel;
  engine_score: number;
  timing_score: number;
  behavior_score: number;
  connection_score: number;
  account_score: number;
  raw_engine: number;
  raw_timing: number;
  raw_behavior: number;
  raw_connection: number;
  raw_account: number;
  flagged_games: number;
  last_event_at: string | null;
  decayed_at: string;
  created_at: string;
  updated_at: string;
}

export interface AntiCheatFlagRow {
  id: string;
  user_id: string;
  game_id: string | null;
  flag_type: FlagType;
  severity: AntiCheatSeverity;
  status: "open" | "under_review" | "confirmed" | "dismissed";
  risk_contribution: number;
  summary: string;
  details: Record<string, unknown>;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnforcementActionRow {
  id: string;
  user_id: string;
  action: "warning" | "restriction" | "suspension" | "ban" | "unban" | "risk_reset";
  reason: string;
  duration_hours: number | null;
  expires_at: string | null;
  created_by: string;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
}

export function isBrowserEventType(v: unknown): v is BrowserEventType {
  return typeof v === "string" && (BROWSER_EVENT_TYPES as readonly string[]).includes(v);
}
