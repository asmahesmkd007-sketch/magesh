import { Chess } from "chess.js";
import { negamax, orderMoves } from "./evaluation";

export type EngineMove = { from: string; to: string; promotion?: string };

const DEPTH: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };
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

  let best: (typeof moves)[number] | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;

  const ordered = orderMoves(moves);
  for (const m of ordered) {
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
  if (!best) best = ordered[0] || moves[0];
  return { from: best.from, to: best.to, promotion: best.promotion };
}
