import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LeaderboardEntry = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  country: string | null;
  state: string | null;
  district: string | null;
  iq_level: number;
  community_score: number;
  created_at: string;
  premium_active: boolean;
  premium_expires_at: string | null;
  title: string | null;
  
  // New Stats
  is_online: boolean;
  last_seen: string | null;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  rapid_rating: number;
  blitz_rating: number;
  bullet_rating: number;
  classical_rating: number;
  overall_rating: number;
  puzzle_rating: number;
  puzzle_solved: number;
  win_streak: number;
  followers: number;
  following: number;
  achievements_count: number;
  level: number;
  xp: number;
  total_count: number; // for pagination
};

export type SortOption = "iq_desc" | "iq_asc" | "rating_desc" | "newest" | "oldest" | "wins_desc" | "matches_desc" | "winrate_desc" | "active_desc" | "puzzle_desc" | "streak_desc" | "score_desc";

export type LeaderboardFilters = {
  country: string | null; // null = Global
  state: string | null;
  district: string | null;
  search: string;
  sort: SortOption;
  timeframe: 'all_time' | 'today' | 'week' | 'month';
  friendsOnly: boolean;
};

const PAGE_SIZE = 25;

// Sorting is handled by the RPC function in the database natively now.
// We just pass the SortOption to the RPC.

export function useLeaderboard(filters: LeaderboardFilters) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refetchTick, setRefetchTick] = useState(0);

  // Reset to page 0 whenever filters change (a new filter set is a new result set).
  useEffect(() => {
    setPage(0);
  }, [filters.country, filters.state, filters.district, filters.search, filters.sort, filters.timeframe, filters.friendsOnly]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const queryFilters = {
      p_search: filters.search.trim().replace(/[%_]/g, "") || "",
      p_country: filters.country || null,
      p_state: filters.state || null,
      p_district: filters.district || null,
      p_sort_col: filters.sort,
      p_timeframe: filters.timeframe || 'all_time',
      p_friends_only: filters.friendsOnly || false,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    };

    (supabase as any)
      .rpc("get_dynamic_leaderboard", queryFilters)
      .then(({ data, error }: { data: LeaderboardEntry[] | null; error: unknown }) => {
        if (cancelled) return;
        if (!error) {
          setEntries(data ?? []);
          // Use total_count from the first row (all rows have it)
          setTotal(data?.[0]?.total_count ?? 0);
        } else {
          console.error("Leaderboard error:", error);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters.country, filters.state, filters.district, filters.search, filters.sort, filters.timeframe, filters.friendsOnly, page, refetchTick]);

  useEffect(() => {
    const channel = supabase
      .channel("leaderboard_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ratings" }, () => {
        setRefetchTick((t) => t + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_puzzle_stats" }, () => {
        setRefetchTick((t) => t + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    entries,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    setPage,
    loading,
  };
}
