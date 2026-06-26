import { Chess, type Move } from "chess.js";

// ── Piece values & piece-square tables (mirrored from engine.ts) ────────────
const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15,
  15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5,
  10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
];
const BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10,
  5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10,
  10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
];
const ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0,
  0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
  0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
];
const QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0,
  -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10,
  0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
];
const KING = [
  -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40,
  -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40,
  -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const PST: Record<string, number[]> = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };

function evaluate(chess: Chess): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = chess.board()[r][c];
      if (!sq) continue;
      const idx = sq.color === "w" ? r * 8 + c : (7 - r) * 8 + c;
      const v = VAL[sq.type] + PST[sq.type][idx];
      score += sq.color === "w" ? v : -v;
    }
  }
  return score;
}

function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const av = (a.captured ? VAL[a.captured] : 0) + (a.promotion ? 800 : 0);
    const bv = (b.captured ? VAL[b.captured] : 0) + (b.promotion ? 800 : 0);
    return bv - av;
  });
}

function negamax(chess: Chess, depth: number, alpha: number, beta: number, color: number): number {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return chess.inCheck() ? -100000 - depth : 0;
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

// ── Public types ────────────────────────────────────────────────────────────
export type Classification = "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

export type MoveAnalysis = {
  ply: number;
  san: string;
  bestMoveSan: string | null;
  evalCpBefore: number;
  evalCpAfter: number;
  evalWhite: number;
  cpl: number;
  classification: Classification;
};

function classify(cpl: number, isBest: boolean): Classification {
  if (isBest || cpl <= 0) return "best";
  if (cpl <= 10) return "excellent";
  if (cpl <= 25) return "good";
  if (cpl <= 50) return "inaccuracy";
  if (cpl <= 100) return "mistake";
  return "blunder";
}

// ── Analyse one position ────────────────────────────────────────────────────
function analyzePosition(chess: Chess, actualSan: string, depth: number): MoveAnalysis | null {
  const color = chess.turn() === "w" ? 1 : -1;
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  let bestMoveSan: string | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;

  for (const m of orderMoves(moves)) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -Infinity, -alpha, -color);
    chess.undo();
    if (score > bestScore) { bestScore = score; bestMoveSan = m.san; }
    if (bestScore > alpha) alpha = bestScore;
  }

  const actualMove = moves.find((m) => m.san === actualSan);
  if (!actualMove) {
    return {
      ply: chess.history().length + 1, san: actualSan, bestMoveSan,
      evalCpBefore: bestScore, evalCpAfter: bestScore,
      evalWhite: color === 1 ? bestScore : -bestScore,
      cpl: 0, classification: "best",
    };
  }

  chess.move(actualMove);
  const actualScore = -negamax(chess, depth - 1, -Infinity, Infinity, -color);
  const evalWhite = evaluate(chess);
  chess.undo();

  const cpl = Math.max(0, bestScore - actualScore);
  return {
    ply: chess.history().length + 1,
    san: actualSan,
    bestMoveSan,
    evalCpBefore: bestScore,
    evalCpAfter: actualScore,
    evalWhite,
    cpl,
    classification: classify(cpl, actualSan === bestMoveSan),
  };
}

// ── Worker message handler ──────────────────────────────────────────────────
let token = 0;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as
    | { type: "analyze"; sans: string[]; depth?: number }
    | { type: "eval"; fen: string; depth?: number }
    | { type: "abort" };

  if (msg.type === "abort") { token++; return; }

  const myToken = ++token;
  const depth = msg.type === "analyze" ? (msg.depth ?? 4) : (msg.depth ?? 4);

  if (msg.type === "analyze") {
    const chess = new Chess();
    const evals: number[] = [evaluate(chess)]; // position 0 = starting pos

    for (let i = 0; i < msg.sans.length; i++) {
      if (token !== myToken) return; // aborted
      const result = analyzePosition(chess, msg.sans[i], depth);
      if (!result) { chess.move(msg.sans[i]); evals.push(evaluate(chess)); continue; }
      chess.move(msg.sans[i]);
      evals.push(result.evalWhite);
      self.postMessage({ type: "move", data: result });
    }

    if (token === myToken) {
      self.postMessage({ type: "done", evals });
    }
    return;
  }

  if (msg.type === "eval") {
    const chess = new Chess(msg.fen);
    const color = chess.turn() === "w" ? 1 : -1;
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) {
      self.postMessage({ type: "eval_result", bestMoveSan: null, bestScore: 0, evalWhite: evaluate(chess) });
      return;
    }

    let bestMoveSan: string | null = null;
    let bestScore = -Infinity;
    let alpha = -Infinity;

    for (const m of orderMoves(moves)) {
      if (token !== myToken) return;
      chess.move(m);
      const score = -negamax(chess, depth - 1, -Infinity, -alpha, -color);
      chess.undo();
      if (score > bestScore) { bestScore = score; bestMoveSan = m.san; }
      if (bestScore > alpha) alpha = bestScore;
    }

    if (token === myToken) {
      // evalWhite: from white's perspective
      const evalWhite = color === 1 ? bestScore : -bestScore;
      self.postMessage({ type: "eval_result", bestMoveSan, bestScore, evalWhite });
    }
  }
};
