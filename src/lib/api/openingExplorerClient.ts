// =====================================================================
// OPENING EXPLORER SERVICE LAYER (client)
// ---------------------------------------------------------------------
// Continuation statistics for any position, computed server-side by the
// opening_explorer RPC over finished ChessOX games (EPD-keyed, so
// transpositions with different clocks still match). Results cache per
// (position, filters) for the session.
// =====================================================================
import { supabase } from "@/integrations/supabase/client";

export type ExplorerFilters = {
  /** Restrict to the signed-in user's games. */
  personal?: boolean;
  /** With `personal`: only games where the user had this colour. */
  color?: "w" | "b";
  timeClass?: "bullet" | "blitz" | "rapid" | "classical" | "correspondence";
  minRating?: number;
  /** Only games started on/after this date (ISO). */
  since?: string;
};

export type ExplorerRow = {
  san: string;
  games: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  avgRating: number | null;
};

/** First four FEN fields — the position identity the RPC indexes on. */
export function fenToEpd(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

const cache = new Map<string, ExplorerRow[]>();

export async function fetchExplorer(
  fen: string,
  filters: ExplorerFilters = {},
): Promise<ExplorerRow[]> {
  const epd = fenToEpd(fen);

  let userId: string | null = null;
  if (filters.personal) {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    if (!userId) return []; // personal filter without a session → nothing
  }

  const key = JSON.stringify([
    epd,
    userId,
    filters.color,
    filters.timeClass,
    filters.minRating,
    filters.since,
  ]);
  const hit = cache.get(key);
  if (hit) return hit;

  const client = supabase as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc("opening_explorer", {
    p_epd: epd,
    p_user: userId,
    p_color: filters.personal ? (filters.color ?? null) : null,
    p_time_class: filters.timeClass ?? null,
    p_min_rating: filters.minRating ?? null,
    p_since: filters.since ?? null,
  });
  if (error) throw new Error(error.message);

  const rows = (
    (data ?? []) as {
      san: string;
      games: number;
      white_wins: number;
      draws: number;
      black_wins: number;
      avg_rating: number | null;
    }[]
  ).map((r) => ({
    san: r.san,
    games: Number(r.games),
    whiteWins: Number(r.white_wins),
    draws: Number(r.draws),
    blackWins: Number(r.black_wins),
    avgRating: r.avg_rating === null ? null : Number(r.avg_rating),
  }));
  cache.set(key, rows);
  return rows;
}
