// =====================================================================
// Position insights — static features of a single position
// ---------------------------------------------------------------------
// Everything the "Position" panel shows: material, mobility, king
// safety, pawn-structure features (passed / isolated / doubled /
// backward / islands), weak squares, centre control, space, development
// and immediate tactical threats. Pure computation over chess.js —
// results are memoised per FEN by the caller.
// =====================================================================
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const PIECE_PAWNS: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };
const CENTER: Square[] = ["d4", "e4", "d5", "e5"];

export type PawnStructure = {
  passed: Square[];
  isolated: Square[];
  doubled: Square[];
  backward: Square[];
  islands: number;
};

export type KingSafety = {
  kingSquare: Square | null;
  /** Own pawns on the three squares diagonally/directly in front. */
  shieldPawns: number;
  /** Adjacent files (incl. own) with no own pawn in front of the king. */
  openFilesNearKing: number;
  /** Enemy pieces bearing on the 8 squares around the king. */
  zoneAttackers: number;
  rating: "safe" | "wary" | "exposed";
};

export type SideInsights = {
  materialPawns: number;
  pieceCounts: Record<Exclude<PieceSymbol, "k">, number>;
  /** Legal moves available (piece activity proxy). */
  mobility: number;
  kingSafety: KingSafety;
  pawns: PawnStructure;
  /** Attacks on d4/e4/d5/e5 by this side. */
  centerControl: number;
  /** Squares in the opponent's half this side attacks. */
  space: number;
  /** Minor pieces + queen developed off their home squares (max 5). */
  developed: number;
  castled: boolean;
};

export type Threat = { san: string; description: string };

export type PositionInsights = {
  white: SideInsights;
  black: SideInsights;
  /** Weak squares (holes) each side suffers from. */
  weakSquares: { white: Square[]; black: Square[] };
  /** Immediate ideas for the side to move. */
  threats: Threat[];
  sideToMove: Color;
};

type PieceMap = Map<Square, { type: PieceSymbol; color: Color }>;

function boardMap(chess: Chess): PieceMap {
  const map: PieceMap = new Map();
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell) map.set(cell.square, { type: cell.type, color: cell.color });
    }
  }
  return map;
}

function sq(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return `${FILES[file]}${rank}` as Square;
}

function fileOf(s: Square): number {
  return s.charCodeAt(0) - 97;
}
function rankOf(s: Square): number {
  return Number(s[1]);
}

// ── Pawn structure ───────────────────────────────────────────────────

function pawnStructure(pieces: PieceMap, color: Color): PawnStructure {
  const own: Square[] = [];
  const enemy: Square[] = [];
  for (const [square, p] of pieces) {
    if (p.type !== "p") continue;
    (p.color === color ? own : enemy).push(square);
  }
  const dir = color === "w" ? 1 : -1;
  const ownByFile = new Map<number, number[]>();
  for (const s of own) {
    const f = fileOf(s);
    ownByFile.set(f, [...(ownByFile.get(f) ?? []), rankOf(s)]);
  }

  const passed: Square[] = [];
  const isolated: Square[] = [];
  const doubled: Square[] = [];
  const backward: Square[] = [];

  for (const s of own) {
    const f = fileOf(s);
    const r = rankOf(s);

    // Passed: no enemy pawn ahead on this or adjacent files.
    const blocked = enemy.some((e) => {
      const ef = fileOf(e);
      const er = rankOf(e);
      return Math.abs(ef - f) <= 1 && (color === "w" ? er > r : er < r);
    });
    if (!blocked) passed.push(s);

    // Isolated: no own pawn on adjacent files at all.
    const hasNeighbour = own.some((o) => o !== s && Math.abs(fileOf(o) - f) === 1);
    if (!hasNeighbour) isolated.push(s);

    // Doubled: another own pawn on the same file.
    if ((ownByFile.get(f) ?? []).length > 1) doubled.push(s);

    // Backward: all adjacent-file own pawns are ahead of it, and the
    // square in front is covered by an enemy pawn.
    if (hasNeighbour) {
      const allAhead = own
        .filter((o) => Math.abs(fileOf(o) - f) === 1)
        .every((o) => (color === "w" ? rankOf(o) > r : rankOf(o) < r));
      const front = sq(f, r + dir);
      const frontCovered =
        front !== null &&
        enemy.some((e) => {
          const ef = fileOf(e);
          const er = rankOf(e);
          return Math.abs(ef - f) === 1 && er === rankOf(front) + dir;
        });
      if (allAhead && frontCovered) backward.push(s);
    }
  }

  // Islands: contiguous runs of files containing own pawns.
  let islands = 0;
  let inIsland = false;
  for (let f = 0; f < 8; f++) {
    const has = (ownByFile.get(f) ?? []).length > 0;
    if (has && !inIsland) islands++;
    inIsland = has;
  }

  return { passed, isolated, doubled, backward, islands };
}

// ── King safety ──────────────────────────────────────────────────────

function kingSafety(chess: Chess, pieces: PieceMap, color: Color): KingSafety {
  let king: Square | null = null;
  for (const [square, p] of pieces) {
    if (p.type === "k" && p.color === color) {
      king = square;
      break;
    }
  }
  if (!king) {
    return {
      kingSquare: null,
      shieldPawns: 0,
      openFilesNearKing: 0,
      zoneAttackers: 0,
      rating: "exposed",
    };
  }

  const f = fileOf(king);
  const r = rankOf(king);
  const dir = color === "w" ? 1 : -1;
  const enemy: Color = color === "w" ? "b" : "w";

  let shieldPawns = 0;
  for (const df of [-1, 0, 1]) {
    const s = sq(f + df, r + dir);
    if (s) {
      const p = pieces.get(s);
      if (p && p.type === "p" && p.color === color) shieldPawns++;
    }
  }

  let openFilesNearKing = 0;
  for (const df of [-1, 0, 1]) {
    const file = f + df;
    if (file < 0 || file > 7) continue;
    let hasOwnPawnAhead = false;
    for (let rank = r + dir; rank >= 1 && rank <= 8; rank += dir) {
      const s = sq(file, rank);
      const p = s ? pieces.get(s) : undefined;
      if (p && p.type === "p" && p.color === color) {
        hasOwnPawnAhead = true;
        break;
      }
    }
    if (!hasOwnPawnAhead) openFilesNearKing++;
  }

  const zoneAttackerSquares = new Set<Square>();
  for (const df of [-1, 0, 1]) {
    for (const dr of [-1, 0, 1]) {
      const s = sq(f + df, r + dr);
      if (!s) continue;
      for (const a of chess.attackers(s, enemy)) zoneAttackerSquares.add(a);
    }
  }
  const zoneAttackers = zoneAttackerSquares.size;

  const danger = zoneAttackers * 2 + openFilesNearKing + (2 - Math.min(2, shieldPawns));
  const rating = danger >= 8 ? "exposed" : danger >= 4 ? "wary" : "safe";

  return { kingSquare: king, shieldPawns, openFilesNearKing, zoneAttackers, rating };
}

// ── Weak squares ─────────────────────────────────────────────────────

/**
 * Holes: squares in a side's own half (central files c–f, the three
 * ranks in front of its pawn line's origin) that none of its pawns can
 * ever attack, because both adjacent files have no pawn behind the
 * square.
 */
function weakSquares(pieces: PieceMap, color: Color): Square[] {
  const own: Square[] = [];
  for (const [square, p] of pieces) {
    if (p.type === "p" && p.color === color) own.push(square);
  }
  const out: Square[] = [];
  const ranks = color === "w" ? [3, 4, 5] : [6, 5, 4];
  for (const r of ranks) {
    for (let f = 2; f <= 5; f++) {
      const s = sq(f, r);
      if (!s) continue;
      const coverable = own.some((o) => {
        const of = fileOf(o);
        const or = rankOf(o);
        if (Math.abs(of - f) !== 1) return false;
        // The pawn must be able to advance until it attacks s.
        return color === "w" ? or < r : or > r;
      });
      if (!coverable) out.push(s);
    }
  }
  return out;
}

// ── Threats ──────────────────────────────────────────────────────────

function threats(chess: Chess): Threat[] {
  const out: Threat[] = [];
  const moves = chess.moves({ verbose: true });
  const seen = new Set<string>();

  for (const m of moves) {
    if (out.length >= 5) break;
    const test = new Chess(chess.fen());
    test.move(m);
    if (test.isCheckmate()) {
      if (!seen.has("mate")) {
        out.unshift({ san: m.san, description: `${m.san} is checkmate.` });
        seen.add("mate");
      }
      continue;
    }
    if (m.captured) {
      const victim = PIECE_PAWNS[m.captured];
      const attacker = PIECE_PAWNS[m.piece];
      const defenders = chess.attackers(m.to as Square, chess.turn() === "w" ? "b" : "w");
      const winning = defenders.length === 0 || victim > attacker;
      if (winning && !seen.has(m.to)) {
        const label = m.captured === "p" ? "a pawn" : `the ${pieceName(m.captured)}`;
        out.push({ san: m.san, description: `${m.san} wins ${label}.` });
        seen.add(m.to);
      }
    }
  }
  return out;
}

function pieceName(p: PieceSymbol): string {
  return { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }[p];
}

// ── Per-side aggregation ─────────────────────────────────────────────

function sideInsights(chess: Chess, pieces: PieceMap, color: Color): SideInsights {
  const counts: Record<Exclude<PieceSymbol, "k">, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  let material = 0;
  for (const [, p] of pieces) {
    if (p.color !== color || p.type === "k") continue;
    counts[p.type]++;
    material += PIECE_PAWNS[p.type];
  }

  // Mobility: legal moves with the turn forced to `color`. Flipping the
  // turn can produce an illegal position (opponent in check) — fall
  // back to 0 rather than crash.
  let mobility = 0;
  try {
    if (chess.turn() === color) {
      mobility = chess.moves().length;
    } else {
      const parts = chess.fen().split(" ");
      parts[1] = color;
      parts[3] = "-"; // en passant square is only valid for the real turn
      mobility = new Chess(parts.join(" ")).moves().length;
    }
  } catch {
    mobility = 0;
  }

  let centerControl = 0;
  for (const c of CENTER) centerControl += chess.attackers(c, color).length;

  let space = 0;
  const oppRanks = color === "w" ? [5, 6, 7, 8] : [1, 2, 3, 4];
  for (const r of oppRanks) {
    for (let f = 0; f < 8; f++) {
      const s = sq(f, r);
      if (s && chess.attackers(s, color).length > 0) space++;
    }
  }

  const home = color === "w" ? 1 : 8;
  const homeSquares: { square: Square; type: PieceSymbol }[] = [
    { square: `b${home}` as Square, type: "n" },
    { square: `g${home}` as Square, type: "n" },
    { square: `c${home}` as Square, type: "b" },
    { square: `f${home}` as Square, type: "b" },
    { square: `d${home}` as Square, type: "q" },
  ];
  let developed = 0;
  for (const h of homeSquares) {
    const p = pieces.get(h.square);
    if (!p || p.color !== color || p.type !== h.type) developed++;
  }

  const king = [...pieces.entries()].find(([, p]) => p.type === "k" && p.color === color)?.[0];
  const castled =
    king !== undefined && ["g", "c", "b", "h"].includes(king[0]) && rankOf(king) === home;

  return {
    materialPawns: Math.round(material * 10) / 10,
    pieceCounts: counts,
    mobility,
    kingSafety: kingSafety(chess, pieces, color),
    pawns: pawnStructure(pieces, color),
    centerControl,
    space,
    developed,
    castled,
  };
}

/** Compute all insights for one position. */
export function analyzePositionInsights(fen: string): PositionInsights {
  const chess = new Chess(fen);
  const pieces = boardMap(chess);
  return {
    white: sideInsights(chess, pieces, "w"),
    black: sideInsights(chess, pieces, "b"),
    weakSquares: { white: weakSquares(pieces, "w"), black: weakSquares(pieces, "b") },
    threats: threats(chess),
    sideToMove: chess.turn(),
  };
}
