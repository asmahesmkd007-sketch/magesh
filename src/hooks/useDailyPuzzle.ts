import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { type Puzzle } from "@/lib/chess/puzzles";

export type PuzzleStatus = "NOT_STARTED" | "IN_PROGRESS" | "SOLVED" | "FAILED" | "SKIPPED";

export type PuzzleProgress = {
  id: string;
  user_id: string;
  puzzle_id: string;
  status: PuzzleStatus;
  started_at: string;
  solved_at: string | null;
  attempts: number;
  time_spent_ms: number;
  hint_used: boolean;
  wrong_moves_count: number;
  board_fen: string | null;
  step_index: number;
  last_move_played: string | null;
  last_viewed_time: string;
};

export type PuzzleStats = {
  user_id: string;
  completed_today: number;
  daily_reset_time: string;
  next_unlock_time: string | null;
  current_streak: number;
  longest_streak: number;
  total_solved: number;
  total_failed: number;
  total_attempts: number;
  total_puzzle_rating: number;
  xp: number;
  coins_earned: number;
  last_active: string;
};

// Loose cast: get_daily_puzzle / update_puzzle_progress are added in
// supabase/schema.sql's "PUZZLE LIBRARY EXPANSION" section and aren't in the
// generated Supabase types until that SQL is applied to a live project and
// types are regenerated — same pattern used by src/lib/api/adminClient.ts.
type Rpc = (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpcClient = supabase as unknown as { rpc: Rpc };

// Shape of the `puzzles` row as returned by row_to_json() in get_daily_puzzle
// (see supabase/schema.sql) — moves comes back as either a Postgres array or
// (depending on driver serialization) a space-separated string, and there is
// no singular `theme` column, only `themes`.
type RawPuzzleRow = Omit<Puzzle, "moves" | "themes" | "theme"> & {
  moves: string[] | string;
  themes?: string[];
  theme?: string;
};

type GetDailyPuzzleResponse = {
  locked: boolean;
  remaining_today: number;
  stats: PuzzleStats | null;
  puzzle: RawPuzzleRow | null;
  progress: PuzzleProgress | null;
};

type UpdateProgressResponse = {
  progress: PuzzleProgress;
  stats: PuzzleStats;
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function useDailyPuzzle() {
  const { user } = useAuth();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [progress, setProgress] = useState<PuzzleProgress | null>(null);
  const [stats, setStats] = useState<PuzzleStats | null>(null);
  const [locked, setLocked] = useState(false);
  const [remainingToday, setRemainingToday] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guards against concurrent get_daily_puzzle calls — e.g. the "solved"
  // auto-advance timer and a manual "Next Puzzle" click firing within
  // moments of each other. Without it, two in-flight calls can each create
  // a brand-new puzzle_progress row server-side (since the just-completed
  // puzzle is already terminal), silently orphaning one and skipping ahead
  // by an extra puzzle. A ref (not `loading` state) so it's read fresh even
  // from stale timer/callback closures.
  const fetchInFlight = useRef(false);

  const fetchDailyPuzzle = useCallback(async () => {
    if (!user || fetchInFlight.current) return;
    fetchInFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await rpcClient.rpc("get_daily_puzzle");

      let res: GetDailyPuzzleResponse;
      if (rpcError) {
        if (rpcError.message.includes("No more puzzles")) {
          // Gracefully handle the case where the backend has ran out of puzzles
          res = {
            locked: false,
            remaining_today: 0,
            stats: null,
            puzzle: null,
            progress: null,
          };
        } else {
          throw rpcError;
        }
      } else {
        res = data as GetDailyPuzzleResponse;
      }

      // 10-second test reset configuration (requested by user for testing)
      if (res.stats && res.stats.completed_today >= 3) {
        res.stats.daily_reset_time = new Date(Date.now() + 10000).toISOString();
      }

      setLocked(res.locked || (res.stats ? res.stats.completed_today >= 3 : false));
      setStats(res.stats);
      setRemainingToday(res.locked ? 0 : res.remaining_today);

      if (!res.locked && res.puzzle) {
        const themes = Array.isArray(res.puzzle.themes) ? res.puzzle.themes : [];
        setPuzzle({
          ...res.puzzle,
          moves: Array.isArray(res.puzzle.moves) ? res.puzzle.moves : res.puzzle.moves.split(" "),
          themes,
          theme: res.puzzle.theme || themes[0] || "Tactics",
        });
        setProgress(res.progress);
      } else {
        setPuzzle(null);
        setProgress(null);
      }
    } catch (err: unknown) {
      console.error("fetchDailyPuzzle error", err);
      setError(errorMessage(err, "Failed to fetch puzzle"));
    } finally {
      setLoading(false);
      fetchInFlight.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchDailyPuzzle();
  }, [user, fetchDailyPuzzle]);

  const updateProgress = async (payload: {
    status: PuzzleStatus;
    time_spent_ms: number;
    board_fen: string;
    step_index: number;
    wrong_moves_count: number;
    hint_used: boolean;
    last_move_played: string | null;
  }) => {
    if (!puzzle || !user) return;
    try {
      const { data, error: updateError } = await rpcClient.rpc("update_puzzle_progress", {
        p_puzzle_id: puzzle.id,
        p_status: payload.status,
        p_time_spent_ms: payload.time_spent_ms,
        p_board_fen: payload.board_fen,
        p_step_index: payload.step_index,
        p_wrong_moves: payload.wrong_moves_count,
        p_hint_used: payload.hint_used,
        p_last_move: payload.last_move_played || "",
      });

      if (updateError) throw updateError;

      const res = data as UpdateProgressResponse;
      
      // If completed 3 puzzles, set 10 second test timer
      if (res.stats.completed_today >= 3) {
        res.stats.daily_reset_time = new Date(Date.now() + 10000).toISOString();
        setLocked(true);
        setRemainingToday(0);
      } else {
        setRemainingToday(3 - res.stats.completed_today);
      }

      setProgress(res.progress);
      setStats(res.stats);
    } catch (err: unknown) {
      console.error("updateProgress error", err);
    }
  };

  const resetTimerAndUnlock = useCallback(async () => {
    if (!user) return;
    try {
      // Reset user_puzzle_stats completed_today = 0 in database so get_daily_puzzle unlocks
      await (supabase as unknown as {
        from: (table: string) => {
          update: (data: Record<string, unknown>) => {
            eq: (column: string, value: string) => Promise<unknown>;
          };
        };
      })
        .from("user_puzzle_stats")
        .update({
          completed_today: 0,
          daily_reset_time: new Date(Date.now() + 10000).toISOString(),
        })
        .eq("user_id", user.id);

      setLocked(false);
      setRemainingToday(3);

      fetchInFlight.current = false;
      await fetchDailyPuzzle();
    } catch (err: unknown) {
      console.error("resetTimerAndUnlock error", err);
    }
  }, [user, fetchDailyPuzzle]);

  return {
    puzzle,
    progress,
    stats,
    locked,
    remainingToday,
    loading,
    error,
    fetchDailyPuzzle,
    updateProgress,
    resetTimerAndUnlock,
  };
}
