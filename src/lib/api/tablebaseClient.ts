// =====================================================================
// Syzygy tablebase client (Lichess public tablebase API)
// ---------------------------------------------------------------------
// Probes 7-man Syzygy tables for exact endgame verdicts: win/draw/loss,
// distance-to-zero/mate and the perfect move list. Only positions with
// ≤ 7 pieces qualify; everything else short-circuits locally. Results
// are cached per FEN for the session, network failures degrade to a
// "unavailable" state the panel renders gracefully.
// =====================================================================

export type TablebaseCategory = "win" | "cursed-win" | "draw" | "blessed-loss" | "loss" | "unknown";

export type TablebaseMove = {
  uci: string;
  san: string;
  /**
   * Category of the resulting position for the OPPONENT (the side to
   * move after this move) — API convention. "loss" here means this
   * move wins for the player making it.
   */
  category: TablebaseCategory;
  dtz: number | null;
  dtm: number | null;
  zeroing: boolean;
  checkmate: boolean;
  stalemate: boolean;
};

export type TablebaseResult = {
  /** Verdict for the side to move. */
  category: TablebaseCategory;
  dtz: number | null;
  dtm: number | null;
  checkmate: boolean;
  stalemate: boolean;
  /** Moves ordered best → worst by the API. */
  moves: TablebaseMove[];
};

const ENDPOINT = "https://tablebase.lichess.ovh/standard";
const TIMEOUT_MS = 6000;

const cache = new Map<string, TablebaseResult>();

/** Piece count from a FEN (kings included). */
export function pieceCount(fen: string): number {
  const board = fen.split(" ")[0] ?? "";
  let n = 0;
  for (const ch of board) if (/[a-z]/i.test(ch)) n++;
  return n;
}

export function tablebaseEligible(fen: string): boolean {
  return pieceCount(fen) <= 7;
}

type ApiMove = {
  uci: string;
  san: string;
  category: string;
  dtz: number | null;
  dtm: number | null;
  zeroing: boolean;
  checkmate: boolean;
  stalemate: boolean;
};

function normaliseCategory(v: string | null | undefined): TablebaseCategory {
  switch (v) {
    case "win":
    case "cursed-win":
    case "draw":
    case "blessed-loss":
    case "loss":
      return v;
    default:
      return "unknown";
  }
}

/**
 * Probe the tablebase for a position. Returns null when the position
 * has more than 7 pieces. Throws on network failure/timeout so the
 * caller can distinguish "not applicable" from "unavailable".
 */
export async function probeTablebase(fen: string): Promise<TablebaseResult | null> {
  if (!tablebaseEligible(fen)) return null;
  const key = fen.split(" ").slice(0, 4).join(" ");
  const cached = cache.get(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?fen=${encodeURIComponent(fen)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`tablebase responded ${res.status}`);
    const data = (await res.json()) as {
      category?: string;
      dtz?: number | null;
      dtm?: number | null;
      checkmate?: boolean;
      stalemate?: boolean;
      moves?: ApiMove[];
    };
    const result: TablebaseResult = {
      category: normaliseCategory(data.category),
      dtz: data.dtz ?? null,
      dtm: data.dtm ?? null,
      checkmate: Boolean(data.checkmate),
      stalemate: Boolean(data.stalemate),
      moves: (data.moves ?? []).map((m) => ({
        uci: m.uci,
        san: m.san,
        category: normaliseCategory(m.category),
        dtz: m.dtz ?? null,
        dtm: m.dtm ?? null,
        zeroing: Boolean(m.zeroing),
        checkmate: Boolean(m.checkmate),
        stalemate: Boolean(m.stalemate),
      })),
    };
    cache.set(key, result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}
