import { Chess, type Move } from "chess.js";

export type EngineMove = { from: string; to: string; promotion?: string };

const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables (white perspective, index 0 = a8)
const PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const KING = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];

const PST: Record<string, number[]> = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };

/** Evaluate from white's perspective (positive = white better). */
function evaluate(chess: Chess): number {
  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq) continue;
      const idx = sq.color === "w" ? r * 8 + c : (7 - r) * 8 + c;
      const v = VAL[sq.type] + PST[sq.type][idx];
      score += sq.color === "w" ? v : -v;
    }
  }
  return score;
}

function orderMoves(moves: Move[]): Move[] {
  return moves.sort((a, b) => {
    const av = (a.captured ? VAL[a.captured] : 0) + (a.promotion ? 800 : 0);
    const bv = (b.captured ? VAL[b.captured] : 0) + (b.promotion ? 800 : 0);
    return bv - av;
  });
}

function negamax(chess: Chess, depth: number, alpha: number, beta: number, color: number): number {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    if (chess.inCheck()) return -100000 - depth; // mated (prefer faster mates)
    return 0; // stalemate
  }
  if (chess.isDraw()) return 0;
  if (depth === 0) return color * evaluate(chess);

  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -beta, -alpha, -color);
    chess.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

const DEPTH: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 3 };
const NOISE: Record<number, number> = { 1: 90, 2: 45, 3: 12, 4: 0, 5: 0 };

/** Find the engine's move for the side to play in `fen`. */
export function findBestMove(fen: string, level: number): EngineMove | null {
  const lvl = Math.min(5, Math.max(1, Math.round(level)));
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  // Level 1 plays loosely — often just a random legal move
  if (lvl === 1 && Math.random() < 0.5) {
    const m = moves[Math.floor(Math.random() * moves.length)];
    return { from: m.from, to: m.to, promotion: m.promotion };
  }

  const depth = DEPTH[lvl];
  const noise = NOISE[lvl];
  const color = chess.turn() === "w" ? 1 : -1;

  let best: Move | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  for (const m of orderMoves(moves)) {
    chess.move(m);
    let score = -negamax(chess, depth - 1, -Infinity, -alpha, -color);
    chess.undo();
    if (noise > 0) score += (Math.random() - 0.5) * 2 * noise;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
    if (bestScore > alpha) alpha = bestScore;
  }
  if (!best) best = moves[0];
  return { from: best.from, to: best.to, promotion: best.promotion };
}
