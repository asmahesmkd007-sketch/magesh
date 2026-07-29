// =====================================================================
// ANTI-CHEAT SERVICE LAYER (admin client)
// ---------------------------------------------------------------------
// Typed entry point for the anti-cheat dashboard. Reads go through
// SECURITY DEFINER RPCs that re-verify has_role(auth.uid(),'admin')
// server-side; mutations go through server functions (acReviewFlag /
// acEnforce / acResetRisk) which do the same and additionally apply the
// multi-indicator false-positive gate. The UI role check only hides
// pixels — it is never the gate.
// =====================================================================

import { supabase } from "@/integrations/supabase/client";
import { acEnforce, acResetRisk, acReviewFlag } from "@/lib/anticheat/anticheat.functions";
import type { AntiCheatSeverity, RiskLevel } from "@/lib/anticheat/types";

type Rpc = (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const client = supabase as unknown as { rpc: Rpc };
  const { data, error } = await client.rpc(name, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

// ── Read models ───────────────────────────────────────────────────────

export type AcOverview = {
  open_flags: number;
  under_review: number;
  confirmed_flags: number;
  high_risk_players: number;
  review_players: number;
  events_24h: number;
  browser_events_24h: number;
  actions_30d: number;
  live_flagged_games: Array<{
    game_id: string;
    flag_type: string;
    severity: AntiCheatSeverity;
    created_at: string;
    white_username: string | null;
    black_username: string | null;
    game_status: string | null;
    username: string | null;
  }>;
};

export type AcPlayer = {
  user_id: string;
  total_score: number;
  risk_level: RiskLevel;
  engine_score: number;
  timing_score: number;
  behavior_score: number;
  connection_score: number;
  account_score: number;
  flagged_games: number;
  last_event_at: string | null;
  updated_at: string;
  username: string | null;
  avatar_url: string | null;
  account_status: string | null;
  open_flags: number;
};

export type AcFlag = {
  id: string;
  user_id: string;
  game_id: string | null;
  flag_type: string;
  severity: AntiCheatSeverity;
  status: "open" | "under_review" | "confirmed" | "dismissed";
  risk_contribution: number;
  summary: string;
  details: Record<string, unknown>;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  username: string | null;
  avatar_url: string | null;
  white_username: string | null;
  black_username: string | null;
  time_control: string | null;
  game_status: string | null;
};

export type AcEvent = {
  id: number;
  game_id: string | null;
  user_id?: string | null;
  event_type: string;
  severity: AntiCheatSeverity;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AcBrowserEvent = {
  id: number;
  game_id: string | null;
  user_id?: string | null;
  event_type: string;
  count: number;
  metadata: Record<string, unknown>;
  window_started_at: string | null;
  created_at: string;
};

export type AcPlayerDetail = {
  profile: {
    id: string;
    username: string;
    avatar_url: string | null;
    account_status: string | null;
    created_at: string;
  } | null;
  risk: (AcPlayer & { raw_engine: number; decayed_at: string }) | null;
  flags: AcFlag[];
  events: AcEvent[];
  browser_events: AcBrowserEvent[];
  fingerprints: Array<{
    id: string;
    fingerprint_hash: string;
    components: Record<string, unknown>;
    ip_hash: string | null;
    user_agent: string | null;
    times_seen: number;
    first_seen_at: string;
    last_seen_at: string;
  }>;
  shared_devices: Array<{
    user_id: string;
    username: string | null;
    fingerprint_hash: string;
    last_seen_at: string;
    same_ip: boolean;
  }>;
  reviews: Array<{
    id: string;
    flag_id: string | null;
    admin_id: string;
    admin_username: string | null;
    decision: string;
    notes: string;
    created_at: string;
  }>;
  actions: Array<{
    id: string;
    action: string;
    reason: string;
    duration_hours: number | null;
    expires_at: string | null;
    created_by: string;
    admin_username: string | null;
    revoked_at: string | null;
    created_at: string;
  }>;
  reports: Array<{
    id: string;
    reporter_id: string;
    reason: string | null;
    description: string;
    status: string;
    created_at: string;
  }>;
};

export type AcGameEvidence = {
  game: {
    id: string;
    white_id: string | null;
    black_id: string | null;
    white_username: string | null;
    black_username: string | null;
    time_control: string;
    time_class: string;
    is_rated: boolean;
    status: string;
    result: string;
    end_reason: string | null;
    moves_count: number;
    created_at: string;
    ended_at: string | null;
  } | null;
  moves: Array<{
    ply: number;
    san: string;
    uci: string;
    by_user: string | null;
    time_left_ms: number | null;
    created_at: string;
  }>;
  flags: AcFlag[];
  events: AcEvent[];
  browser_events: AcBrowserEvent[];
};

// ── Reads ─────────────────────────────────────────────────────────────

export const getOverview = () => rpc<AcOverview>("anticheat_overview");

export const listPlayers = (minScore = 0, limit = 50) =>
  rpc<AcPlayer[]>("anticheat_list_players", { p_min_score: minScore, p_limit: limit });

export const listFlags = (status?: string, limit = 100) =>
  rpc<AcFlag[]>("anticheat_list_flags", { p_status: status ?? null, p_limit: limit });

export const getPlayerDetail = (userId: string) =>
  rpc<AcPlayerDetail>("anticheat_player_detail", { p_user_id: userId });

export const getGameEvidence = (gameId: string) =>
  rpc<AcGameEvidence>("anticheat_game_evidence", { p_game_id: gameId });

// ── Mutations (server functions with server-side admin + evidence gates) ──

export const reviewFlag = (flagId: string, decision: "confirm" | "dismiss", notes = "") =>
  acReviewFlag({ data: { flagId, decision, notes } });

export type EnforceAction = "warning" | "restriction" | "suspension" | "ban" | "unban";

export const enforce = (
  userId: string,
  action: EnforceAction,
  reason: string,
  durationHours?: number,
) => acEnforce({ data: { userId, action, reason, durationHours } });

export const resetRiskScore = (userId: string, notes = "") =>
  acResetRisk({ data: { userId, notes } });
