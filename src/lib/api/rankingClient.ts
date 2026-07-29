// =====================================================================
// RANKING SERVICE LAYER (client)
// ---------------------------------------------------------------------
// Single typed entry point for both ranking systems:
//   • Permanent ELO  — elo_leaderboard, per time class
//   • Season Points  — sp_leaderboard, current or past season
//   • player_ranking_card — a player's standing in both, one round trip
//   • hall_of_fame   — frozen records of finished seasons
//   • admin_*        — configuration, adjustments, bans, analytics
//
// Every read is a STABLE SECURITY DEFINER RPC open to anon/authenticated;
// every admin_* re-checks profiles.is_admin server-side, so the frontend
// never gates writes on its own. Backend: schema.sql SECTION 102.
// =====================================================================
import { supabase } from "@/integrations/supabase/client";
import type { TimeClass } from "@/lib/ranking/elo";

/** Geographic/social slice a leaderboard is drawn from. */
export type RankingScope = "global" | "country" | "state" | "district" | "friends";

export type ScopeFilters = {
  country?: string | null;
  state?: string | null;
  district?: string | null;
  /** Required for the "friends" scope — the viewing user. */
  viewer?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
};

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

// ── Permanent ELO ────────────────────────────────────────────────────

export type EloLeaderboardRow = {
  rank: number;
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
  state: string | null;
  district: string | null;
  rating: number;
  peak_rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number | null;
  premium_active: boolean;
};

export async function fetchEloLeaderboard(
  timeClass: TimeClass,
  scope: RankingScope,
  filters: ScopeFilters = {},
): Promise<EloLeaderboardRow[]> {
  const rows = await rpc<EloLeaderboardRow[]>("elo_leaderboard", {
    p_time_class: timeClass,
    p_scope: scope,
    p_country: filters.country ?? null,
    p_state: filters.state ?? null,
    p_district: filters.district ?? null,
    p_viewer: filters.viewer ?? null,
    p_search: filters.search?.trim() || null,
    p_min_games: 5,
    p_limit: filters.limit ?? 50,
    p_offset: filters.offset ?? 0,
  });
  return rows ?? [];
}

// ── Season Points ────────────────────────────────────────────────────

export type SpLeaderboardRow = {
  rank: number;
  prev_rank: number | null;
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
  state: string | null;
  district: string | null;
  season_points: number;
  rung_id: string;
  rung_index: number;
  tier_code: string;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number | null;
  best_win_streak: number;
  premium_active: boolean;
};

export async function fetchSpLeaderboard(
  scope: RankingScope,
  filters: ScopeFilters & { seasonId?: string | null } = {},
): Promise<SpLeaderboardRow[]> {
  const rows = await rpc<SpLeaderboardRow[]>("sp_leaderboard", {
    p_season_id: filters.seasonId ?? null,
    p_scope: scope,
    p_country: filters.country ?? null,
    p_state: filters.state ?? null,
    p_district: filters.district ?? null,
    p_viewer: filters.viewer ?? null,
    p_search: filters.search?.trim() || null,
    p_limit: filters.limit ?? 50,
    p_offset: filters.offset ?? 0,
  });
  return rows ?? [];
}

// ── Player card ──────────────────────────────────────────────────────

export type PlayerRankingCard = {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
  state: string | null;
  district: string | null;
  elo: {
    time_class: TimeClass;
    rating: number;
    peak_rating: number;
    games_played: number;
    wins: number;
    losses: number;
    draws: number;
    global_rank: number | null;
    country_rank: number | null;
    state_rank: number | null;
    district_rank: number | null;
  } | null;
  season: {
    season_id: string;
    season_points: number;
    rung_id: string;
    rung_index: number;
    tier_code: string;
    rank: number | null;
    prev_rank: number | null;
    peak_sp: number;
    peak_rung_index: number;
    games_played: number;
    wins: number;
    losses: number;
    draws: number;
    best_win_streak: number;
    banned: boolean;
  } | null;
  career: {
    best_season_rank: number | null;
    best_season_number: number | null;
    highest_sp: number;
    seasons_played: number;
    seasons_won: number;
  };
};

export const fetchPlayerRankingCard = (userId: string, timeClass: TimeClass = "rapid") =>
  rpc<PlayerRankingCard | null>("player_ranking_card", {
    p_user_id: userId,
    p_time_class: timeClass,
  });

// ── Hall of Fame ─────────────────────────────────────────────────────

export type HallOfFameRow = {
  season_number: number;
  season_name: string | null;
  ended_at: string;
  final_rank: number;
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
  season_points: number;
  tier_code: string;
  rung_id: string | null;
  rewards: string[];
};

export type HallOfFameChampion = {
  season_number: number;
  season_name: string | null;
  ended_at: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  country: string | null;
  season_points: number;
  tier_code: string;
};

export const fetchHallOfFame = (seasonNumber?: number | null, limit = 100, offset = 0) =>
  rpc<HallOfFameRow[]>("hall_of_fame", {
    p_season_number: seasonNumber ?? null,
    p_limit: limit,
    p_offset: offset,
  });

export const fetchHallOfFameChampions = (limit = 24) =>
  rpc<HallOfFameChampion[]>("hall_of_fame_champions", { p_limit: limit });

// ── Season configuration (public read) ───────────────────────────────

export type SeasonConfig = {
  sp_rates: Record<string, { win: number; draw: number; loss: number }>;
  upset_bonus: Record<string, number>;
  penalties: Record<string, number>;
  ladder: { id: string; min: number }[];
  demotion_grace_sp: number;
  min_moves_for_sp: number;
  daily_sp_cap: number;
  repeat_opponent_limit: number;
  repeat_opponent_pct: number;
  updated_at?: string;
};

/** The live rules, straight from season_config (readable by everyone). */
export async function fetchSeasonConfig(): Promise<SeasonConfig | null> {
  const { data, error } = await supabase
    .from("season_config" as never)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SeasonConfig | null) ?? null;
}

// ── Admin ────────────────────────────────────────────────────────────

export const adminGetSeasonConfig = () => rpc<SeasonConfig>("admin_get_season_config");

export const adminUpdateSeasonConfig = (patch: Partial<SeasonConfig>) =>
  rpc<SeasonConfig>("admin_update_season_config", { p_patch: patch });

export const adminAdjustSeasonPoints = (userId: string, points: number, reason: string) =>
  rpc<number>("admin_adjust_season_points", {
    p_user_id: userId,
    p_points: points,
    p_reason: reason,
  });

export const adminSetSeasonBan = (userId: string, banned: boolean, reason?: string) =>
  rpc<void>("admin_set_season_ban", {
    p_user_id: userId,
    p_banned: banned,
    p_reason: reason ?? null,
  });

export type RankingAnalytics = {
  season_id: string | null;
  ranked_players: number;
  banned_players: number;
  active_players: number;
  games_counted: number;
  sp_awarded: number;
  sp_deducted: number;
  tier_distribution: Record<string, number>;
  elo_distribution: Record<string, number>;
};

export const adminRankingAnalytics = () => rpc<RankingAnalytics>("admin_ranking_analytics");
