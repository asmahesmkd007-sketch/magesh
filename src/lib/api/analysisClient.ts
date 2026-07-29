// =====================================================================
// GAME REVIEW / ANALYSIS SERVICE LAYER (client)
// ---------------------------------------------------------------------
// Reads the persisted per-move review (game_moves analysis columns) and
// the per-game summary (game_analysis), and writes a completed review
// back through the save_game_analysis RPC. The engine itself runs in the
// browser (src/lib/analysis/gameAnalyzer.ts — Stockfish pipeline); this
// module only deals with persistence + the shape of the stored report.
// =====================================================================
import { supabase } from "@/integrations/supabase/client";
import type { Classification } from "@/lib/chess/classification";

// ── Stored row shapes ────────────────────────────────────────────────
export type ReviewMove = {
  ply: number;
  san: string;
  uci: string;
  fen_before: string | null;
  fen_after: string;
  time_left_ms: number | null;
  time_used_ms: number | null;
  is_capture: boolean;
  is_check: boolean;
  is_promotion: boolean;
  is_castling: boolean;
  eval_before_cp: number | null;
  eval_after_cp: number | null;
  best_move_san: string | null;
  classification: Classification | null;
};

export type ClassCounts = Partial<Record<Classification, number>>;

export type GameAnalysis = {
  game_id: string;
  accuracy_white: number | null;
  accuracy_black: number | null;
  acpl_white: number | null;
  acpl_black: number | null;
  class_counts_white: ClassCounts | null;
  class_counts_black: ClassCounts | null;
  opening_name: string | null;
  opening_eco: string | null;
  analysis_status: string;
  analyzed_at: string | null;
};

const REVIEW_MOVE_COLS =
  "ply,san,uci,fen_before,fen_after,time_left_ms,time_used_ms," +
  "is_capture,is_check,is_promotion,is_castling," +
  "eval_before_cp,eval_after_cp,best_move_san,classification";

// ── Reads ────────────────────────────────────────────────────────────

/** All moves for a game with their stored analysis annotations, ordered by ply. */
export async function fetchReviewMoves(gameId: string): Promise<ReviewMove[]> {
  // `as never` table cast: the generated types predate the analysis columns
  // (classification, eval_*, time_used_ms). Same pattern walletClient uses.
  const { data, error } = await supabase
    .from("game_moves" as never)
    .select(REVIEW_MOVE_COLS)
    .eq("game_id", gameId)
    .order("ply");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ReviewMove[];
}

/** The per-game analysis summary, or null if the game has not been reviewed. */
export async function fetchGameAnalysis(gameId: string): Promise<GameAnalysis | null> {
  const { data, error } = await supabase
    .from("game_analysis" as never)
    .select("*")
    .eq("game_id", gameId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GameAnalysis | null) ?? null;
}

// ── Write ────────────────────────────────────────────────────────────

export type SaveAnalysisInput = {
  gameId: string;
  accuracyWhite: number | null;
  accuracyBlack: number | null;
  acplWhite: number | null;
  acplBlack: number | null;
  classCountsWhite: ClassCounts;
  classCountsBlack: ClassCounts;
  openingName?: string | null;
  openingEco?: string | null;
  moveEvals: {
    ply: number;
    eval_before_cp: number | null;
    eval_after_cp: number | null;
    best_move_san: string | null;
    classification: Classification;
  }[];
};

export async function saveGameAnalysis(input: SaveAnalysisInput): Promise<void> {
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { error } = await client.rpc("save_game_analysis", {
    p_game_id: input.gameId,
    p_accuracy_white: input.accuracyWhite,
    p_accuracy_black: input.accuracyBlack,
    p_acpl_white: input.acplWhite,
    p_acpl_black: input.acplBlack,
    p_class_counts_white: input.classCountsWhite,
    p_class_counts_black: input.classCountsBlack,
    p_opening_name: input.openingName ?? null,
    p_opening_eco: input.openingEco ?? null,
    p_move_evals: input.moveEvals,
  });
  if (error) throw new Error(error.message);
}
