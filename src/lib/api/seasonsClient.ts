// =====================================================================
// SEASONS SERVICE LAYER (client)
// ---------------------------------------------------------------------
// Public reads (current_season, list_seasons, season_leaderboard,
// season_history_for_user) are STABLE SECURITY DEFINER RPCs open to
// anon/authenticated. Every admin_* mutation re-checks profiles.is_admin
// server-side — the frontend never gates writes on its own.
// Backend: supabase/schema.sql section 20.
// =====================================================================
import { supabase } from "@/integrations/supabase/client";

export type SeasonStatus = "upcoming" | "live" | "paused" | "ended";

export type Season = {
  id: string;
  season_number: number;
  name: string | null;
  start_date: string;
  end_date: string;
  status: SeasonStatus;
  created_at: string;
  updated_at: string;
};

export type SeasonLeaderboardEntry = {
  rank: number;
  /** Rank at the previous refresh — drives the ▲▼ trend indicator. */
  prev_rank?: number | null;
  user_id: string;
  /** Season IQ points (reset to 0 each season). */
  season_iq?: number;
  tier?: string;
  games_played?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  win_rate?: number;
  puzzles_solved?: number;
  best_win_streak?: number;
  iq_level: number;
  rating_points: number;
  country: string | null;
  state: string | null;
  district: string | null;
  rewards: string[];
  username: string;
  full_name: string;
  avatar_url: string | null;
  premium_active: boolean;
  premium_expires_at: string | null;
};

export type SeasonHistoryEntry = {
  season_id: string;
  season_number: number;
  season_name: string | null;
  final_rank: number;
  iq_level: number;
  season_iq?: number;
  tier?: string | null;
  games_played?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  best_win_streak?: number;
  rating_points: number;
  rewards: string[];
  ended_at: string;
};

export type SeasonBadge = { season: number; code: string };

export type SeasonHistoryForUser = {
  seasons: SeasonHistoryEntry[];
  current_season_rank: number | null;
  current_season_iq?: number;
  current_tier?: string;
  current_games_played?: number;
  current_wins?: number;
  current_losses?: number;
  current_draws?: number;
  current_puzzles_solved?: number;
  current_best_win_streak?: number;
  seasons_played: number;
  seasons_won: number;
  top_10_finishes: number;
  top_100_finishes: number;
  best_rank_ever: number | null;
  best_iq_level: number;
  best_rating: number;
  /** Permanent career records (SECTION 77) — absent on pre-77 databases. */
  career_highest_iq?: number;
  career_highest_iq_season?: number | null;
  career_best_rank?: number | null;
  career_best_rank_season?: number | null;
  best_season_number?: number | null;
  season_badges?: SeasonBadge[];
};

export type CareerSummary = {
  user_id: string;
  career_highest_iq: number;
  career_highest_iq_season: number | null;
  career_best_rank: number | null;
  career_best_rank_season: number | null;
  best_season_number: number | null;
  current_season_iq: number;
  current_tier: string;
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

// ── Public reads ─────────────────────────────────────────────────────
export const getCurrentSeason = () => rpc<Season | null>("current_season");
export const listSeasons = () => rpc<Season[]>("list_seasons");

export const getSeasonLeaderboard = (
  seasonId: string,
  opts: {
    country?: string | null;
    state?: string | null;
    district?: string | null;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
) =>
  rpc<SeasonLeaderboardEntry[]>("season_leaderboard", {
    p_season_id: seasonId,
    p_country: opts.country ?? null,
    p_state: opts.state ?? null,
    p_district: opts.district ?? null,
    p_search: opts.search?.trim() || null,
    p_limit: opts.limit ?? 25,
    p_offset: opts.offset ?? 0,
  });

export const getSeasonHistoryForUser = (userId: string) =>
  rpc<SeasonHistoryForUser>("season_history_for_user", { p_user_id: userId });

/** Batch career records for search results / comparisons. */
export const getCareerSummaries = (userIds: string[]) =>
  rpc<CareerSummary[]>("career_summaries", { p_user_ids: userIds });

/**
 * Idempotent monthly tick: ends an expired season (freeze + rewards +
 * career records), starts the next one-month season, and bootstraps
 * Season 1 on an empty database. Cron owns this server-side; the seasons
 * page also nudges it so the rollover never waits on cron availability.
 */
export const seasonRollover = () => rpc<void>("season_rollover");

// ── Admin writes ─────────────────────────────────────────────────────
export const adminCreateSeason = (name: string, startDate: string, endDate: string) =>
  rpc<string>("admin_create_season", { p_name: name, p_start: startDate, p_end: endDate });

export const adminEditSeason = (
  seasonId: string,
  name: string,
  startDate: string,
  endDate: string,
) =>
  rpc<void>("admin_edit_season", {
    p_season_id: seasonId,
    p_name: name,
    p_start: startDate,
    p_end: endDate,
  });

export const adminStartSeason = (seasonId: string) =>
  rpc<void>("admin_start_season", { p_season_id: seasonId });

export const adminPauseSeason = (seasonId: string) =>
  rpc<void>("admin_pause_season", { p_season_id: seasonId });

export const adminResumeSeason = (seasonId: string) =>
  rpc<void>("admin_resume_season", { p_season_id: seasonId });

export const adminEndSeason = (seasonId: string, autoStartNext = true) =>
  rpc<{ success: boolean; ranked_players: number; next_season_id: string | null }>(
    "admin_end_season",
    {
      p_season_id: seasonId,
      p_auto_start_next: autoStartNext,
    },
  );

export const adminRecalculateSeason = (seasonId: string) =>
  rpc<void>("admin_recalculate_season", { p_season_id: seasonId });
