import type { Color, PieceSymbol } from "chess.js";
import type { BoardCell } from "@/components/site/InteractiveBoard";

/**
 * Solid Unicode chess glyphs used for BOTH colours. The piece colour is conveyed
 * by fill + outline (see InteractiveBoard / CapturedPieces), never by the
 * hollow outline codepoints which render as empty boxes on many platforms.
 */
export const SOLID_GLYPH: Record<PieceSymbol, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

export const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export type CapturedSummary = {
  /** Black pieces that White has captured (shown beside the White player). */
  byWhite: PieceSymbol[];
  /** White pieces that Black has captured (shown beside the Black player). */
  byBlack: PieceSymbol[];
  /** Positive = White is ahead in material, negative = Black is ahead. */
  materialAdvantage: number;
};

const INITIAL: Record<Exclude<PieceSymbol, "k">, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/**
 * Derives captured pieces purely from the current board position, so it stays
 * correct regardless of move history, promotions, or how the position was loaded.
 */
export function computeCaptured(board: BoardCell[][]): CapturedSummary {
  const remaining: Record<Color, Record<string, number>> = {
    w: { ...INITIAL },
    b: { ...INITIAL },
  };
  for (const row of board) {
    for (const cell of row) {
      if (!cell || cell.type === "k") continue;
      if (remaining[cell.color][cell.type] !== undefined) remaining[cell.color][cell.type]--;
    }
  }

  const collect = (color: Color): PieceSymbol[] => {
    const out: PieceSymbol[] = [];
    for (const [type, count] of Object.entries(remaining[color])) {
      for (let i = 0; i < Math.max(0, count); i++) out.push(type as PieceSymbol);
    }
    return out.sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
  };

  const byWhite = collect("b");
  const byBlack = collect("w");
  const materialAdvantage =
    byWhite.reduce((s, p) => s + PIECE_VALUE[p], 0) -
    byBlack.reduce((s, p) => s + PIECE_VALUE[p], 0);

  return { byWhite, byBlack, materialAdvantage };
}
