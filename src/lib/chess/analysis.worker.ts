import { Chess, type Move } from "chess.js";

import type { Classification } from "./classification";
import { PIECE_VALUE, evaluate, negamax, orderMoves } from "./evaluation";

export type { Classification };

// ── Public types ────────────────────────────────────────────────────────────
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

const MATE = 90000; // negamax returns ~100000 for forced mate

function classify(ctx: {
  cpl: number;
  isBest: boolean;
  gapToSecond: number; // bestScore − secondBestScore (≥ 0)
  sacrifice: boolean;
  isBook: boolean;
  bestScore: number; // mover's perspective, before the move
  actualScore: number; // mover's perspective, after the move
}): Classification {
  const { cpl, isBest, gapToSecond, sacrifice, isBook, bestScore, actualScore } = ctx;

  // Opening theory takes precedence — a "book" move is by definition sound.
  if (isBook) return "book";

  const mateBefore = bestScore >= MATE;
  const winningBefore = bestScore >= 300;

  // Missed a forced mate, or let a clearly winning position slip toward equality.
  if (mateBefore && actualScore < MATE && cpl > 50) return "miss";
  if (winningBefore && actualScore < 100 && cpl >= 200) return "miss";

  if (isBest || cpl <= 5) {
    // A sound piece sacrifice that keeps the game alive → brilliant.
    if (sacrifice && actualScore >= -50) return "brilliant";
    // The only move that holds (a big gap to the second-best) → great.
    if (gapToSecond >= 150 && actualScore > -300) return "great";
    return "best";
  }
  if (cpl <= 20) return "excellent";
  if (cpl <= 50) return "good";
  if (cpl <= 100) return "inaccuracy";
  if (cpl <= 200) return "mistake";
  return "blunder";
}

/**
 * Heuristic sacrifice detector: the played move parts with a minor piece or
 * more, gains less material than it gives, and leaves that piece capturable by
 * the opponent on its new square. `chess` must already have the move applied.
 */
function isSacrifice(chess: Chess, move: Move): boolean {
  const movedVal = PIECE_VALUE[move.promotion ? "q" : move.piece] ?? 0;
  if (movedVal < 300) return false;
  const gained = move.captured ? PIECE_VALUE[move.captured] : 0;
  if (gained >= movedVal) return false; // favourable/equal trade, not a sacrifice
  return chess.moves({ verbose: true }).some((r) => r.to === move.to && r.captured);
}

// ── Analyse one position ────────────────────────────────────────────────────
function analyzePosition(
  chess: Chess,
  actualSan: string,
  depth: number,
  isBook: boolean,
): MoveAnalysis | null {
  const color = chess.turn() === "w" ? 1 : -1;
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  let bestMoveSan: string | null = null;
  let bestScore = -Infinity;
  let secondScore = -Infinity;
  let alpha = -Infinity;

  for (const m of orderMoves(moves)) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -Infinity, -alpha, -color);
    chess.undo();
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestMoveSan = m.san;
    } else if (score > secondScore) {
      secondScore = score;
    }
    if (bestScore > alpha) alpha = bestScore;
  }

  const gapToSecond = secondScore === -Infinity ? Infinity : Math.max(0, bestScore - secondScore);

  const actualMove = moves.find((m) => m.san === actualSan);
  if (!actualMove) {
    return {
      ply: chess.history().length + 1,
      san: actualSan,
      bestMoveSan,
      evalCpBefore: bestScore,
      evalCpAfter: bestScore,
      evalWhite: color === 1 ? bestScore : -bestScore,
      cpl: 0,
      classification: isBook ? "book" : "best",
    };
  }

  chess.move(actualMove);
  const actualScore = -negamax(chess, depth - 1, -Infinity, Infinity, -color);
  const evalWhite = evaluate(chess);
  const sacrifice = isSacrifice(chess, actualMove);
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
    classification: classify({
      cpl,
      isBest: actualSan === bestMoveSan,
      gapToSecond,
      sacrifice,
      isBook,
      bestScore,
      actualScore,
    }),
  };
}

// ── Worker message handler ──────────────────────────────────────────────────
let token = 0;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as
    | { type: "analyze"; sans: string[]; depth?: number; bookPlies?: number }
    | { type: "eval"; fen: string; depth?: number }
    | { type: "abort" };

  if (msg.type === "abort") {
    token++;
    return;
  }

  const myToken = ++token;
  const depth = msg.type === "analyze" ? (msg.depth ?? 4) : (msg.depth ?? 4);

  if (msg.type === "analyze") {
    const chess = new Chess();
    const evals: number[] = [evaluate(chess)]; // position 0 = starting pos
    const bookPlies = msg.bookPlies ?? 0;

    for (let i = 0; i < msg.sans.length; i++) {
      if (token !== myToken) return; // aborted
      const result = analyzePosition(chess, msg.sans[i], depth, i + 1 <= bookPlies);
      if (!result) {
        chess.move(msg.sans[i]);
        evals.push(evaluate(chess));
        continue;
      }
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
      self.postMessage({
        type: "eval_result",
        bestMoveSan: null,
        bestScore: 0,
        evalWhite: evaluate(chess),
      });
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
      if (score > bestScore) {
        bestScore = score;
        bestMoveSan = m.san;
      }
      if (bestScore > alpha) alpha = bestScore;
    }

    if (token === myToken) {
      // evalWhite: from white's perspective
      const evalWhite = color === 1 ? bestScore : -bestScore;
      self.postMessage({ type: "eval_result", bestMoveSan, bestScore, evalWhite });
    }
  }
};
