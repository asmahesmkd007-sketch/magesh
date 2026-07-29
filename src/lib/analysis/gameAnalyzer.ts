// =====================================================================
// Game analyzer — batch Stockfish review of a full game
// ---------------------------------------------------------------------
// Walks every position of the mainline, evaluates each once at a fixed
// depth with MultiPV 2 (rank 2 feeds only-move detection), then derives
// per-move classification and accuracy. Runs on the shared engine —
// user options are saved and restored around the batch. Evaluations are
// memoised in a small LRU keyed by FEN+depth, so re-reviews and
// navigation-triggered re-analysis are close to free.
// =====================================================================
import { Chess } from "chess.js";

import { getSharedEngine, type StockfishEngine } from "@/lib/engine/stockfishEngine";
import { scoreForWhite, scoreToCp, MATE_CP, type UciInfoLine } from "@/lib/engine/uci";
import { logger } from "@/lib/logger";

import { moveAccuracy, winProbability } from "./accuracy";
import { classifyMove, isSacrifice, isTacticalMove, moverHasMate } from "./classify";
import type { AnalyzedMove, EvalPoint, ReviewProgress } from "./types";

export type GameMoveInput = {
  ply: number;
  san: string;
  uci: string;
  color: "w" | "b";
  fenBefore: string;
  fenAfter: string;
};

export type AnalyzeGameOptions = {
  /** Search depth per position (default 14 — ~1s/position on WASM lite). */
  depth?: number;
  /** Plies covered by opening theory (classified as book). */
  bookPlies?: number;
  onProgress?: (p: ReviewProgress) => void;
  signal?: AbortSignal;
};

export const REVIEW_DEPTH_DEFAULT = 14;

/** One evaluated position: top lines from the side to move. */
type PositionEval = {
  cpWhite: number;
  mateIn: number | null;
  depth: number;
  bestUci: string | null;
  secondCpWhite: number | null;
  pv: string[];
};

// ── Position cache (LRU) ─────────────────────────────────────────────
const CACHE_MAX = 600;
const cache = new Map<string, PositionEval>();

function cacheGet(key: string): PositionEval | undefined {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // refresh recency
  }
  return hit;
}

function cachePut(key: string, value: PositionEval): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/** Exposed for tests and for the workspace's "engine cache" indicator. */
export function reviewCacheSize(): number {
  return cache.size;
}

// ── Terminal positions ───────────────────────────────────────────────
function terminalEval(chess: Chess): PositionEval | null {
  if (chess.isCheckmate()) {
    // Side to move is mated.
    const cpWhite = chess.turn() === "w" ? -MATE_CP : MATE_CP;
    return { cpWhite, mateIn: 0, depth: 0, bestUci: null, secondCpWhite: null, pv: [] };
  }
  if (chess.isDraw() || chess.isStalemate()) {
    return { cpWhite: 0, mateIn: null, depth: 0, bestUci: null, secondCpWhite: null, pv: [] };
  }
  return null;
}

function lineToEval(
  line: UciInfoLine,
  turn: "w" | "b",
): { cpWhite: number; mateIn: number | null } {
  const whiteScore = scoreForWhite(line.score, turn);
  return {
    cpWhite: scoreToCp(whiteScore),
    mateIn: whiteScore.type === "mate" ? whiteScore.value : null,
  };
}

async function evaluatePosition(
  engine: StockfishEngine,
  fen: string,
  depth: number,
): Promise<PositionEval> {
  const key = `${fen}#${depth}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const chess = new Chess(fen);
  const terminal = terminalEval(chess);
  if (terminal) return terminal;

  const snapshot = await engine.evaluate({ fen, depth });
  const turn = chess.turn();
  const top = snapshot.lines[0];
  if (!top) {
    // Engine returned nothing scoreable (shouldn't happen off-terminal);
    // treat as balanced rather than failing the whole review.
    logger.warn("review: no engine line for position", { fen });
    return {
      cpWhite: 0,
      mateIn: null,
      depth: 0,
      bestUci: snapshot.bestMove?.move ?? null,
      secondCpWhite: null,
      pv: [],
    };
  }

  const first = lineToEval(top, turn);
  const second = snapshot.lines[1] ? lineToEval(snapshot.lines[1], turn).cpWhite : null;
  const result: PositionEval = {
    cpWhite: first.cpWhite,
    mateIn: first.mateIn,
    depth: top.depth,
    bestUci: top.pv[0] ?? snapshot.bestMove?.move ?? null,
    secondCpWhite: second,
    pv: top.pv.slice(0, 12),
  };
  cachePut(key, result);
  return result;
}

/** Convert a UCI PV into SAN from a starting FEN (stops at first illegal). */
export function pvToSan(fen: string, pv: string[], limit = 8): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, limit)) {
    try {
      const m = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: (uci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
      });
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

const CPL_CAP = 1000;

/**
 * Analyse a full game. Resolves with one AnalyzedMove per input move;
 * throws `Error("aborted")` if the signal fires mid-review.
 */
export async function analyzeGame(
  moves: GameMoveInput[],
  opts: AnalyzeGameOptions = {},
): Promise<AnalyzedMove[]> {
  const depth = opts.depth ?? REVIEW_DEPTH_DEFAULT;
  const bookPlies = opts.bookPlies ?? 0;
  const engine = getSharedEngine();
  const savedOptions = engine.currentOptions;

  const total = moves.length + 1;
  const report = (done: number, lastMove: AnalyzedMove | null) =>
    opts.onProgress?.({ done, total, lastMove });

  engine.setOptions({ multiPv: 2 });
  try {
    const out: AnalyzedMove[] = [];
    let evalBefore: PositionEval | null = null;

    for (let i = 0; i < moves.length; i++) {
      if (opts.signal?.aborted) throw new Error("aborted");
      const mv = moves[i];

      const before = evalBefore ?? (await evaluatePosition(engine, mv.fenBefore, depth));
      if (opts.signal?.aborted) throw new Error("aborted");
      const after = await evaluatePosition(engine, mv.fenAfter, depth);
      evalBefore = after; // next move's "before" is this move's "after"

      const chessBefore = new Chess(mv.fenBefore);
      const legalMoveCount = chessBefore.moves().length;
      const isBook = mv.ply <= bookPlies;
      const isBest = before.bestUci !== null && before.bestUci === mv.uci;
      const sacrifice = isSacrifice(mv.fenBefore, mv.uci);
      const bestIsTactical = isTacticalMove(mv.fenBefore, before.bestUci);

      const classification = classifyMove({
        color: mv.color,
        cpBeforeWhite: before.cpWhite,
        cpAfterWhite: after.cpWhite,
        secondCpWhite: before.secondCpWhite,
        isBest,
        legalMoveCount,
        isBook,
        sacrifice,
        bestIsTactical,
        hadMateBefore: moverHasMate(before.cpWhite, mv.color),
        hasMateAfter: moverHasMate(after.cpWhite, mv.color),
      });

      const moverBefore = mv.color === "w" ? before.cpWhite : -before.cpWhite;
      const moverAfter = mv.color === "w" ? after.cpWhite : -after.cpWhite;
      const cpl = Math.min(CPL_CAP, Math.max(0, moverBefore - moverAfter));
      const winBefore = winProbability(moverBefore);
      const winAfter = winProbability(moverAfter);

      const evalBeforePoint: EvalPoint = {
        cpWhite: before.cpWhite,
        mateIn: before.mateIn,
        depth: before.depth,
      };
      const evalAfterPoint: EvalPoint = {
        cpWhite: after.cpWhite,
        mateIn: after.mateIn,
        depth: after.depth,
      };

      const analyzed: AnalyzedMove = {
        ply: mv.ply,
        san: mv.san,
        uci: mv.uci,
        color: mv.color,
        fenBefore: mv.fenBefore,
        fenAfter: mv.fenAfter,
        evalBefore: evalBeforePoint,
        evalAfter: evalAfterPoint,
        bestUci: before.bestUci,
        bestSan: before.bestUci ? (pvToSan(mv.fenBefore, [before.bestUci], 1)[0] ?? null) : null,
        bestLineSan: pvToSan(mv.fenBefore, before.pv),
        secondCpWhite: before.secondCpWhite,
        cpl,
        accuracy: Math.round(moveAccuracy(winBefore, winAfter) * 10) / 10,
        classification,
        legalMoveCount,
        isBook,
        sacrifice,
      };
      out.push(analyzed);
      report(i + 2, analyzed);
    }

    return out;
  } finally {
    engine.setOptions(savedOptions);
  }
}
