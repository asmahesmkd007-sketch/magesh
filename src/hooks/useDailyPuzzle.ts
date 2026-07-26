import { useEffect, useState } from "react";
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

export function useDailyPuzzle() {
  const { user } = useAuth();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [progress, setProgress] = useState<PuzzleProgress | null>(null);
  const [stats, setStats] = useState<PuzzleStats | null>(null);
  const [locked, setLocked] = useState(false);
  const [remainingToday, setRemainingToday] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDailyPuzzle = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await rpcClient.rpc("get_daily_puzzle");

      let res: any;
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
        res = data as any;
      }

      setLocked(res.locked);
      setStats(res.stats);
      setRemainingToday(res.remaining_today);
      if (!res.locked && res.puzzle) {
        setPuzzle({
          ...res.puzzle,
          moves: Array.isArray(res.puzzle.moves) ? res.puzzle.moves : res.puzzle.moves.split(" "),
          themes: Array.isArray(res.puzzle.themes) ? res.puzzle.themes : [],
        });
        setProgress(res.progress);
      } else {
        setPuzzle(null);
        setProgress(null);
      }
    } catch (err: any) {
      console.error("fetchDailyPuzzle error", err);
      setError(err.message || "Failed to fetch puzzle");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchDailyPuzzle();
  }, [user]);

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

      const res = data as any;
      setProgress(res.progress);
      setStats(res.stats);

      // If solved, failed, or skipped, we might be locked now
      if (["SOLVED", "FAILED", "SKIPPED"].includes(payload.status)) {
        if (res.stats.completed_today >= 3) {
          setLocked(true);
          setRemainingToday(0);
        } else {
          setRemainingToday(3 - res.stats.completed_today);
        }
      }
    } catch (err: any) {
      console.error("updateProgress error", err);
    }
  };

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
  };
}
