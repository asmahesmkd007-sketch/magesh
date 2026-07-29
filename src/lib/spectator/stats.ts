// =====================================================================
// LIVE SPECTATOR STATISTICS
// ---------------------------------------------------------------------
// The numbers under the board: material, piece counts, pace of play and
// the repetition warning. Everything is derived from data the delayed
// feed already carries — the FEN and the released move list — so the
// panel costs no extra request and can never show a viewer something
// newer than the position they are looking at.
//
// Pure and synchronous: parses the FEN board field directly rather than
// instantiating chess.js, because this recomputes on every poll for
// every open feed.
//
// Deliberately NOT here: move accuracy and evaluation. Those are engine
// output, and showing them to spectators while a game is live is exactly
// the ghost-coaching channel the broadcast delay exists to close. They
// belong to the post-game review.
// =====================================================================

export type PieceLetter = "p" | "n" | "b" | "r" | "q" | "k";

export const PIECE_VALUE: Record<PieceLetter, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export type SideMaterial = {
  counts: Record<PieceLetter, number>;
  /** Total value of this side's pieces, pawns included. */
  points: number;
};

export type LiveStats = {
  /** Full move number, as shown on a scoresheet (1-based). */
  moveNumber: number;
  white: SideMaterial;
  black: SideMaterial;
  /** Positive = White ahead. Sign is White-relative throughout. */
  materialAdvantage: number;
  /** Mean seconds per move so far, per side. Null before a side has moved. */
  avgMoveSeconds: { white: number | null; black: number | null };
  /** How many times the current position has occurred. 3 = draw claimable. */
  repetitions: number;
  /** True once the position has appeared three times. */
  repetitionWarning: boolean;
  /** Plies since the last capture or pawn move, from the FEN halfmove clock. */
  halfmoveClock: number;
  /** True as the fifty-move rule comes into range (>= 80 plies). */
  fiftyMoveWarning: boolean;
};

const EMPTY_COUNTS = (): Record<PieceLetter, number> => ({ p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 });

/** Board identity for repetition: the first four FEN fields, sans clocks. */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** Counts every piece on the board straight out of the FEN placement field. */
export function readMaterial(fen: string): { white: SideMaterial; black: SideMaterial } {
  const white = EMPTY_COUNTS();
  const black = EMPTY_COUNTS();
  const placement = fen.split(" ")[0] ?? "";

  for (const ch of placement) {
    if (ch === "/" || (ch >= "1" && ch <= "8")) continue;
    const lower = ch.toLowerCase() as PieceLetter;
    if (!(lower in white)) continue;
    if (ch === lower) black[lower] += 1;
    else white[lower] += 1;
  }

  const points = (c: Record<PieceLetter, number>) =>
    (Object.keys(c) as PieceLetter[]).reduce((sum, k) => sum + c[k] * PIECE_VALUE[k], 0);

  return {
    white: { counts: white, points: points(white) },
    black: { counts: black, points: points(black) },
  };
}

type StatMove = { ply: number; fen_after: string; created_at: string };

/**
 * Mean thinking time per side, measured from the gaps between move
 * timestamps. The first move of the game has no predecessor to measure
 * against and is skipped, so a long pre-game pause is not charged to
 * White as think time.
 */
function averageMoveSeconds(
  moves: readonly StatMove[],
  startedAt: string | null,
): { white: number | null; black: number | null } {
  const totals = { white: 0, black: 0 };
  const counts = { white: 0, black: 0 };
  let prev = startedAt ? Date.parse(startedAt) : NaN;

  for (const m of moves) {
    const at = Date.parse(m.created_at);
    if (Number.isFinite(prev) && Number.isFinite(at) && at >= prev) {
      const side = m.ply % 2 === 1 ? "white" : "black";
      totals[side] += (at - prev) / 1000;
      counts[side] += 1;
    }
    prev = at;
  }

  return {
    white: counts.white > 0 ? totals.white / counts.white : null,
    black: counts.black > 0 ? totals.black / counts.black : null,
  };
}

/**
 * How many times the position on the board has occurred in the game so
 * far, counting the starting position. Threefold is a claimable draw, so
 * the panel warns at 3.
 */
export function countRepetitions(fen: string, moves: readonly StatMove[]): number {
  const key = positionKey(fen);
  const startKey = positionKey("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  let n = key === startKey ? 1 : 0;
  for (const m of moves) if (positionKey(m.fen_after) === key) n += 1;
  return n;
}

export function computeLiveStats(input: {
  fen: string;
  /** The plies the feed has released, oldest first. */
  moves: readonly StatMove[];
  /** Game start, used as the clock origin for White's first move. */
  startedAt?: string | null;
}): LiveStats {
  const { fen, moves } = input;
  const { white, black } = readMaterial(fen);
  const fields = fen.split(" ");
  const halfmoveClock = Number.parseInt(fields[4] ?? "0", 10) || 0;
  const fullMove = Number.parseInt(fields[5] ?? "1", 10) || 1;
  const repetitions = countRepetitions(fen, moves);

  return {
    moveNumber: fullMove,
    white,
    black,
    materialAdvantage: white.points - black.points,
    avgMoveSeconds: averageMoveSeconds(moves, input.startedAt ?? null),
    repetitions,
    repetitionWarning: repetitions >= 3,
    halfmoveClock,
    fiftyMoveWarning: halfmoveClock >= 80,
  };
}
