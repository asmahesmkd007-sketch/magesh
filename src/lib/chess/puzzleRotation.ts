// Daily puzzle rotation helper — thin client wrapper around the
// `get_daily_puzzle` / `update_puzzle_progress` RPCs (see supabase/schema.sql,
// section "PUZZLE LIBRARY EXPANSION"). The actual 3-per-24h lock, the
// 1st=Mate in 1 / 2nd=Mate in 2 / 3rd=Mate in 3 rotation, the every-10th-solve
// Mate in 5 special, and the never-repeat guarantee are ALL enforced
// server-side in Postgres (never trust the client for a rate limit) — this
// module just exposes a typed, ergonomic surface plus a countdown helper for
// the UI, mirroring the pattern used by the withdrawal system's rate-limited
// RPCs.
import { supabase } from "@/integrations/supabase/client";
import type { Puzzle } from "./puzzles";

export type PuzzleStatus = "NOT_STARTED" | "IN_PROGRESS" | "SOLVED" | "FAILED" | "SKIPPED";

export type PuzzleProgressRow = {
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
  rating_earned?: number;
  xp_earned?: number;
};

export type PuzzleStatsRow = {
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
  puzzle_rating?: number;
  xp: number;
  coins_earned: number;
  last_active: string;
};

export type DailyPuzzleResult = {
  locked: boolean;
  puzzle: Puzzle | null;
  progress: PuzzleProgressRow | null;
  stats: PuzzleStatsRow;
  completedToday: number;
  remainingToday: number;
  nextUnlockTime: string | null;
};

// Loose cast: these RPCs (added in supabase/schema.sql's "PUZZLE LIBRARY
// EXPANSION" section) aren't in the generated Supabase types until that SQL
// is applied to a live project and types are regenerated — same pattern used
// by src/lib/api/adminClient.ts for its admin_* RPCs.
type Rpc = (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase as unknown as { rpc: Rpc };

/** Fetches (or resumes) the user's next daily puzzle. Server enforces all limits. */
export async function fetchNextPuzzle(): Promise<DailyPuzzleResult> {
  const { data, error } = await rpc.rpc("get_daily_puzzle");
  if (error) throw new Error(error.message);
  const res = data as {
    locked: boolean;
    puzzle?: Record<string, unknown>;
    progress?: PuzzleProgressRow;
    stats: PuzzleStatsRow;
    completed_today: number;
    remaining_today: number;
    next_unlock_time?: string | null;
  };
  return {
    locked: res.locked,
    puzzle: res.puzzle
      ? ({
          ...res.puzzle,
          moves: Array.isArray(res.puzzle.moves)
            ? res.puzzle.moves
            : String(res.puzzle.moves).split(" "),
          themes: Array.isArray(res.puzzle.themes) ? res.puzzle.themes : [],
        } as unknown as Puzzle)
      : null,
    progress: res.progress ?? null,
    stats: res.stats,
    completedToday: res.completed_today ?? res.stats?.completed_today ?? 0,
    remainingToday: res.remaining_today ?? 0,
    nextUnlockTime: res.next_unlock_time ?? res.stats?.next_unlock_time ?? null,
  };
}

export async function submitPuzzleProgress(payload: {
  puzzleId: string;
  status: PuzzleStatus;
  timeSpentMs: number;
  boardFen: string;
  stepIndex: number;
  wrongMoves: number;
  hintUsed: boolean;
  lastMove: string | null;
}): Promise<{ progress: PuzzleProgressRow; stats: PuzzleStatsRow }> {
  const { data, error } = await rpc.rpc("update_puzzle_progress", {
    p_puzzle_id: payload.puzzleId,
    p_status: payload.status,
    p_time_spent_ms: payload.timeSpentMs,
    p_board_fen: payload.boardFen,
    p_step_index: payload.stepIndex,
    p_wrong_moves: payload.wrongMoves,
    p_hint_used: payload.hintUsed,
    p_last_move: payload.lastMove ?? "",
  });
  if (error) throw new Error(error.message);
  return data as { progress: PuzzleProgressRow; stats: PuzzleStatsRow };
}

/** Formats the ms remaining until the daily lock lifts as "Hh Mm Ss". */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "00:00:00";
  const totalSeconds = Math.floor(msRemaining / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Milliseconds until `nextUnlockTime`, clamped to >= 0. */
export function msUntilUnlock(nextUnlockTime: string | null): number {
  if (!nextUnlockTime) return 0;
  return Math.max(0, new Date(nextUnlockTime).getTime() - Date.now());
}

/** Which rotation slot (0/1/2) the *next* puzzle today will land in. */
export function nextRotationSlot(completedToday: number): 0 | 1 | 2 {
  return Math.min(completedToday, 2) as 0 | 1 | 2;
}

export const ROTATION_GOALS = ["Mate in 1", "Mate in 2", "Mate in 3"] as const;

/** True if the user's next solve (totalSolved + 1) lands on a Mate in 5 special. */
export function isNextSolveSpecial(totalSolved: number): boolean {
  return (totalSolved + 1) % 10 === 0;
}
