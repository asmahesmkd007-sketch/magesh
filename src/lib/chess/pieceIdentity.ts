// =====================================================================
// PIECE IDENTITY ACROSS POSITIONS
// ---------------------------------------------------------------------
// The board renders one absolutely-positioned node per piece, keyed by a
// stable id, and lets CSS slide it between squares. That only works if a
// piece keeps the *same* id from one position to the next — a new id
// remounts the node, so the piece teleports instead of gliding, and
// re-triggers the "pop" animation on a piece that merely moved.
//
// This is the pure core of that mapping, extracted from the board
// component so the rule set can be tested directly. A piece keeps its id
// when:
//   * it is still on the square it was on, with the same colour and type
//     (an unchanged piece never re-mounts); or
//   * it is standing on `lastMove.to` and a same-coloured piece was on
//     `lastMove.from` (the piece that just moved — including promotions,
//     where the type deliberately changes).
// Anything else is a piece appearing from nowhere and gets a fresh id.
// =====================================================================
import type { Color, PieceSymbol, Square } from "chess.js";

export type IdentityCell = { square: Square | string; type: PieceSymbol; color: Color } | null;
export type PieceIdentity = { id: string; color: Color; type: PieceSymbol };
export type Placed = {
  id: string;
  color: Color;
  type: PieceSymbol;
  square: string;
  /** Newly-appeared piece — eligible for the "pop" entrance animation. */
  fresh: boolean;
};

export type PieceIdState = {
  /** Board signature this state was computed for; null before first use. */
  sig: string | null;
  /** Square → identity, as of that signature. */
  map: Map<string, PieceIdentity>;
  out: Placed[];
  /** Monotonic id source; never reset, so ids are unique for the session. */
  counter: number;
};

export function initialPieceIdState(): PieceIdState {
  return { sig: null, map: new Map(), out: [], counter: 0 };
}

/**
 * Compact description of *what is where*. Two positions with the same
 * signature are the same arrangement of pieces, so identities need not be
 * recomputed — this is what makes the caller's render-time cache safe.
 */
export function boardSignature(board: IdentityCell[][]): string {
  let s = "";
  for (const row of board) for (const c of row) s += c ? c.color + c.type : ".";
  return s;
}

/**
 * Produce the next identity state. Pure: `prev` is never mutated, so
 * calling this twice with the same inputs yields equal output and the
 * caller can safely run it during render.
 */
export function assignPieceIds(
  board: IdentityCell[][],
  lastMove: { from: string; to: string } | null,
  prev: PieceIdState,
  signature?: string,
): PieceIdState {
  const prevMap = prev.map;
  const next = new Map<string, PieceIdentity>();
  const used = new Set<string>();
  const out: Placed[] = [];
  let counter = prev.counter;

  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const sq = String(cell.square);
      let id: string | undefined;
      let fresh = false;

      const stay = prevMap.get(sq);
      if (stay && !used.has(stay.id) && stay.color === cell.color && stay.type === cell.type) {
        id = stay.id;
      } else if (lastMove && sq === lastMove.to) {
        const moved = prevMap.get(lastMove.from);
        // Type is intentionally not compared: a promoting pawn becomes a
        // queen on the same node, so it glides rather than popping.
        if (moved && !used.has(moved.id) && moved.color === cell.color) id = moved.id;
      }
      if (!id) {
        id = `pc${counter++}`;
        fresh = prevMap.size > 0; // don't pop-animate the very first render
      }

      used.add(id);
      next.set(sq, { id, color: cell.color, type: cell.type });
      out.push({ id, color: cell.color, type: cell.type, square: sq, fresh });
    }
  }

  return { sig: signature ?? boardSignature(board), map: next, out, counter };
}
