// =====================================================================
// TOURNAMENT SERVICE LAYER (client)
// ---------------------------------------------------------------------
// Typed access to the tournament engine (schema.sql SECTION 74).
// The page loads everything through get_tournament_state — one RPC,
// one round trip — and mutates only through SECURITY DEFINER RPCs.
// Join/leave/cancel/no-show live in walletClient (they move coins);
// they are re-exported here so tournament UI has a single import.
// =====================================================================
import { supabase } from "@/integrations/supabase/client";

export {
  joinTournamentPaid,
  refundTournamentEntry,
  cancelTournament,
  claimNoShow,
  ensureTournamentSlots,
} from "@/lib/api/walletClient";

export type TournamentStatus = "upcoming" | "locked" | "live" | "completed" | "cancelled";

export type TournamentRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  format: string;
  time_control: string;
  prize_pool: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: TournamentStatus;
  player_count: number;
  max_players: number;
  min_players: number;
  cover_gradient: string | null;
  winner_display: string | null;
  entry_fee_coins: number;
  prize_1st: number;
  prize_2nd: number;
  prize_3rd: number;
  prize_4th: number;
  platform_fee_pct: number;
  prizes_distributed: boolean;
  current_round: number;
  total_rounds: number;
  round_started_at: string | null;
  /** Set while the 10s "Round Complete" intermission runs; NULL otherwise.
   *  Absent on databases without the SECTION 76 migration. */
  next_round_at?: string | null;
  created_at: string;
};

export type EntryStatus = "active" | "eliminated" | "winner" | "runner_up" | "third" | "fourth";

export type TournamentEntry = {
  id: string;
  user_id: string;
  score: number;
  rank: number | null;
  wins: number;
  losses: number;
  draws: number;
  piece_points: number;
  time_used_ms: number;
  status: EntryStatus;
  eliminated_in_round: number | null;
  fastest_win_ms: number | null;
  joined_at: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
  iq_rating: number | null;
  is_online: boolean | null;
  premium_active: boolean | null;
  premium_expires_at: string | null;
};

export type MatchStatus = "pending" | "active" | "finished" | "bye";

export type TournamentMatch = {
  id: string;
  round: number;
  slot: number;
  player1_id: string | null;
  player2_id: string | null;
  game_id: string | null;
  winner_id: string | null;
  status: MatchStatus;
  player1_username: string | null;
  player2_username: string | null;
  // Live game snapshot (null when no game, e.g. byes)
  game_status: string | null;
  game_result: string | null;
  fen: string | null;
  turn: "w" | "b" | null;
  moves_count: number | null;
  white_id: string | null;
  black_id: string | null;
  white_username: string | null;
  black_username: string | null;
  white_time_ms: number | null;
  black_time_ms: number | null;
  last_move_at: string | null;
  end_reason: string | null;
  game_created_at: string | null;
  game_ended_at: string | null;
};

export type ActivityKind =
  | "player_joined"
  | "player_left"
  | "tournament_locked"
  | "tournament_live"
  | "round_started"
  | "round_finished"
  | "match_finished"
  | "bye"
  | "prize_distributed"
  | "tournament_finished"
  | "tournament_cancelled";

export type TournamentActivityItem = {
  id: number;
  kind: ActivityKind | string;
  message: string;
  actor_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type CaptureRow = {
  id: number;
  match_id: string;
  game_id: string;
  user_id: string;
  victim_id: string | null;
  piece: "p" | "n" | "b" | "r" | "q";
  bonus: number;
  ply: number;
  created_at: string;
  capturer_username: string | null;
  victim_username: string | null;
};

export type TournamentState = {
  server_now: string;
  viewer_id: string | null;
  tournament: TournamentRow;
  entries: TournamentEntry[];
  matches: TournamentMatch[];
  activity: TournamentActivityItem[];
  /** Last 50 piece-capture bonuses (SECTION 75); absent on pre-arena DBs. */
  captures?: CaptureRow[];
};

/** Arena point rules (mirrors the SECTION 75 server constants — display only;
 *  the server is the sole scorer). */
export const ARENA_POINTS = { win: 5, loss: -5, draw: 2 } as const;
export const PIECE_BONUS: Record<CaptureRow["piece"], number> = {
  p: 2,
  n: 8,
  b: 5,
  r: 5,
  q: 10,
};

/**
 * Load the whole tournament page state in one round trip.
 * Returns null when the tournament does not exist.
 */
export async function getTournamentState(tournamentId: string): Promise<TournamentState | null> {
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc("get_tournament_state", {
    p_tournament_id: tournamentId,
  });
  if (error) throw new Error(error.message);
  return (data ?? null) as TournamentState | null;
}

async function rpc<T>(fn: string, params: Record<string, unknown>): Promise<T> {
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc(fn, params);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Abort the current game (chess.com rules: at most one move played).
 * Tournament matches get a fresh replacement game — its id is returned;
 * casual games simply end as aborted (returns null).
 */
export function abortGame(gameId: string): Promise<string | null> {
  return rpc<string | null>("abort_game", { p_game_id: gameId });
}

/** Explicitly refuse the opponent's pending draw offer. */
export function declineDraw(gameId: string): Promise<null> {
  return rpc<null>("decline_draw", { p_game_id: gameId });
}

/**
 * Nudge the server-side clockwork (locked→live transition, dead-clock
 * sweep, and the between-rounds advance once the 10s intermission is up).
 * All three RPCs are idempotent and validate everything internally; this
 * keeps tournaments moving even when pg_cron is unavailable.
 */
export async function nudgeTournamentEngine(): Promise<void> {
  await Promise.allSettled([
    rpc("transition_locked_tournaments", {}),
    rpc("tournament_clock_sweep", {}),
    rpc("advance_pending_rounds", {}),
  ]);
}

// ---- Admin TR panel -------------------------------------------------

export type AdminTrRow = {
  id: string;
  name: string;
  slug: string;
  status: TournamentStatus;
  time_control: string;
  format: string;
  entry_fee_coins: number;
  player_count: number;
  max_players: number;
  prize_1st: number;
  prize_2nd: number;
  prize_3rd: number;
  prize_4th: number;
  current_round: number;
  total_rounds: number;
  winner_display: string | null;
  prizes_distributed: boolean;
  created_at: string;
  starts_at: string | null;
  ends_at: string | null;
  fees_collected: number;
  refunds_paid: number;
  prizes_paid: number;
  /** Booked house cut (gross − prizes) — 0 until the tournament completes;
   *  absent on databases without the SECTION 76 migration. */
  platform_revenue?: number;
  total_matches: number;
  checkmates: number;
  resigns: number;
  timeouts: number;
  no_shows: number;
  draws: number;
  aborted: number;
  captures: number;
  capture_points: number;
};

export type AdminTrFinanceRow = {
  id: string;
  user_id: string;
  username: string | null;
  type: "tournament_entry" | "tournament_refund" | "tournament_prize";
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
};

/** Admin-only: tournament room overview with money + match aggregates. */
export function adminTrOverview(filters?: {
  status?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminTrRow[]> {
  return rpc<AdminTrRow[]>("admin_tr_overview", {
    p_status: filters?.status ?? null,
    p_search: filters?.search ?? null,
    p_from: filters?.from ?? null,
    p_to: filters?.to ?? null,
    p_limit: filters?.limit ?? 60,
    p_offset: filters?.offset ?? 0,
  });
}

/** Admin-only: every wallet transaction tied to one tournament. */
export function adminTrFinance(tournamentId: string): Promise<AdminTrFinanceRow[]> {
  return rpc<AdminTrFinanceRow[]>("admin_tr_finance", { p_tournament_id: tournamentId });
}

/** "1+0" → "Bullet", "3+2" → "Blitz", "10+0" → "Rapid" */
export function timeClassOf(timeControl: string): "Bullet" | "Blitz" | "Rapid" {
  const mins = parseInt(timeControl.split("+")[0] ?? "5", 10);
  if (mins < 3) return "Bullet";
  if (mins < 10) return "Blitz";
  return "Rapid";
}

/** Total prize pool in coins across all paid places. */
export function prizePoolOf(t: TournamentRow): number {
  return (t.prize_1st ?? 0) + (t.prize_2nd ?? 0) + (t.prize_3rd ?? 0) + (t.prize_4th ?? 0);
}

/** Knockout round display name, e.g. Final / Semifinals / Quarterfinals. */
export function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round; // 0 = final
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round}`;
}
