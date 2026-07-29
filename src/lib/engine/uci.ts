// =====================================================================
// UCI protocol parsing (pure functions — no worker, no side effects)
// ---------------------------------------------------------------------
// Stockfish speaks UCI over plain text lines. This module turns those
// lines into typed structures the engine controller and UI can consume.
// Kept free of DOM/worker references so it is unit-testable in Node.
// =====================================================================

/** Engine score for a line. `cp` is centipawns from the side to move. */
export type UciScore = { type: "cp"; value: number } | { type: "mate"; value: number };

/** One parsed `info … pv …` line (a single MultiPV candidate). */
export type UciInfoLine = {
  depth: number;
  seldepth: number | null;
  multipv: number;
  score: UciScore;
  /** True when the score is a bound (fail-high/low), not an exact value. */
  bound: "lower" | "upper" | null;
  nodes: number | null;
  nps: number | null;
  timeMs: number | null;
  hashfull: number | null;
  tbhits: number | null;
  /** Principal variation as UCI long-algebraic moves (e2e4, e7e8q, …). */
  pv: string[];
};

export type UciBestMove = {
  /** UCI move, or null when the position is terminal (`bestmove (none)`). */
  move: string | null;
  ponder: string | null;
};

const UCI_MOVE_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** True for a syntactically valid UCI long-algebraic move. */
export function isUciMove(token: string): boolean {
  return UCI_MOVE_RE.test(token);
}

/**
 * Parse a single `info` line. Returns null for info lines that carry no
 * pv/score payload (e.g. `info string …`, currmove progress lines) — the
 * controller only needs scored candidate lines.
 */
export function parseInfoLine(line: string): UciInfoLine | null {
  if (!line.startsWith("info ")) return null;
  const tokens = line.trim().split(/\s+/);

  let depth: number | null = null;
  let seldepth: number | null = null;
  let multipv = 1;
  let score: UciScore | null = null;
  let bound: "lower" | "upper" | null = null;
  let nodes: number | null = null;
  let nps: number | null = null;
  let timeMs: number | null = null;
  let hashfull: number | null = null;
  let tbhits: number | null = null;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t) {
      case "depth":
        depth = Number(tokens[++i]);
        break;
      case "seldepth":
        seldepth = Number(tokens[++i]);
        break;
      case "multipv":
        multipv = Number(tokens[++i]);
        break;
      case "score": {
        const kind = tokens[++i];
        const value = Number(tokens[++i]);
        if (kind === "cp") score = { type: "cp", value };
        else if (kind === "mate") score = { type: "mate", value };
        if (tokens[i + 1] === "lowerbound") {
          bound = "lower";
          i++;
        } else if (tokens[i + 1] === "upperbound") {
          bound = "upper";
          i++;
        }
        break;
      }
      case "nodes":
        nodes = Number(tokens[++i]);
        break;
      case "nps":
        nps = Number(tokens[++i]);
        break;
      case "time":
        timeMs = Number(tokens[++i]);
        break;
      case "hashfull":
        hashfull = Number(tokens[++i]);
        break;
      case "tbhits":
        tbhits = Number(tokens[++i]);
        break;
      case "string":
        // `info string …` — free text, never a candidate line.
        return null;
      case "pv":
        pv = tokens.slice(i + 1).filter(isUciMove);
        i = tokens.length;
        break;
      default:
        break; // unknown token — skip (forward-compatible)
    }
  }

  if (depth === null || score === null || pv.length === 0) return null;
  if (!Number.isFinite(depth) || depth < 1) return null;

  return { depth, seldepth, multipv, score, bound, nodes, nps, timeMs, hashfull, tbhits, pv };
}

/** Parse a `bestmove …` line; null if the line is not a bestmove. */
export function parseBestMove(line: string): UciBestMove | null {
  if (!line.startsWith("bestmove")) return null;
  const tokens = line.trim().split(/\s+/);
  const move = tokens[1] && isUciMove(tokens[1]) ? tokens[1] : null;
  const ponderIdx = tokens.indexOf("ponder");
  const ponder =
    ponderIdx !== -1 && tokens[ponderIdx + 1] && isUciMove(tokens[ponderIdx + 1])
      ? tokens[ponderIdx + 1]
      : null;
  return { move, ponder };
}

// ── Score helpers ────────────────────────────────────────────────────

/** Sentinel magnitude used to fold mate scores onto the cp scale. */
export const MATE_CP = 100_000;

/**
 * Fold a UCI score into a single centipawn number (mate = ±MATE_CP minus
 * distance, so nearer mates compare greater). Perspective is unchanged:
 * positive = good for the side to move.
 */
export function scoreToCp(score: UciScore): number {
  if (score.type === "cp") return score.value;
  return score.value > 0 ? MATE_CP - score.value : -MATE_CP - score.value;
}

/** Convert a side-to-move score into White's perspective. */
export function scoreForWhite(score: UciScore, sideToMove: "w" | "b"): UciScore {
  if (sideToMove === "w") return score;
  return { type: score.type, value: -score.value };
}

/** Human display for a White-perspective score: "+1.4", "-0.3", "M5", "-M2". */
export function formatScore(score: UciScore): string {
  if (score.type === "mate") {
    if (score.value === 0) return "#";
    return score.value > 0 ? `M${score.value}` : `-M${-score.value}`;
  }
  const pawns = score.value / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}
