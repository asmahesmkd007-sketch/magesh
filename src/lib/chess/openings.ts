// =====================================================================
// Lightweight opening (ECO) detection
// ---------------------------------------------------------------------
// Matches the longest known opening line that is a prefix of the game's
// SAN move list. Used to label games in history/profile and to mark the
// covered plies as "book" moves during engine review. This is a curated
// subset of common openings — not a full ECO database — but it covers the
// overwhelming majority of games played at club level.
// =====================================================================

export type Opening = { eco: string; name: string; moves: string[] };

// Ordered roughly shortest→longest; detection picks the longest match so
// order is not significant, but grouping by first move aids readability.
const OPENINGS: Opening[] = [
  // 1. e4 …
  { eco: "B00", name: "King's Pawn Opening", moves: ["e4"] },
  { eco: "B00", name: "Nimzowitsch Defense", moves: ["e4", "Nc6"] },
  { eco: "B01", name: "Scandinavian Defense", moves: ["e4", "d5"] },
  { eco: "B02", name: "Alekhine Defense", moves: ["e4", "Nf6"] },
  { eco: "B07", name: "Pirc Defense", moves: ["e4", "d6"] },
  { eco: "B10", name: "Caro-Kann Defense", moves: ["e4", "c6"] },
  { eco: "B20", name: "Sicilian Defense", moves: ["e4", "c5"] },
  { eco: "B21", name: "Sicilian, Smith-Morra Gambit", moves: ["e4", "c5", "d4"] },
  { eco: "B23", name: "Sicilian, Closed", moves: ["e4", "c5", "Nc3"] },
  { eco: "B27", name: "Sicilian Defense", moves: ["e4", "c5", "Nf3"] },
  { eco: "B30", name: "Sicilian, Rossolimo", moves: ["e4", "c5", "Nf3", "Nc6", "Bb5"] },
  { eco: "B50", name: "Sicilian, Najdorf-style", moves: ["e4", "c5", "Nf3", "d6"] },
  { eco: "B22", name: "Sicilian, Alapin", moves: ["e4", "c5", "c3"] },
  { eco: "C00", name: "French Defense", moves: ["e4", "e6"] },
  { eco: "C02", name: "French, Advance", moves: ["e4", "e6", "d4", "d5", "e5"] },
  { eco: "C10", name: "French, Paulsen", moves: ["e4", "e6", "d4", "d5", "Nc3"] },
  { eco: "C20", name: "King's Pawn Game", moves: ["e4", "e5"] },
  { eco: "C23", name: "Bishop's Opening", moves: ["e4", "e5", "Bc4"] },
  { eco: "C25", name: "Vienna Game", moves: ["e4", "e5", "Nc3"] },
  { eco: "C30", name: "King's Gambit", moves: ["e4", "e5", "f4"] },
  { eco: "C40", name: "King's Knight Opening", moves: ["e4", "e5", "Nf3"] },
  { eco: "C41", name: "Philidor Defense", moves: ["e4", "e5", "Nf3", "d6"] },
  { eco: "C42", name: "Petrov's Defense", moves: ["e4", "e5", "Nf3", "Nf6"] },
  { eco: "C44", name: "Scotch Game", moves: ["e4", "e5", "Nf3", "Nc6", "d4"] },
  { eco: "C44", name: "Ponziani Opening", moves: ["e4", "e5", "Nf3", "Nc6", "c3"] },
  { eco: "C45", name: "Scotch Game", moves: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4"] },
  { eco: "C46", name: "Three Knights Game", moves: ["e4", "e5", "Nf3", "Nc6", "Nc3"] },
  { eco: "C47", name: "Four Knights Game", moves: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6"] },
  { eco: "C50", name: "Italian Game", moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"] },
  { eco: "C50", name: "Giuoco Piano", moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"] },
  { eco: "C55", name: "Two Knights Defense", moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"] },
  { eco: "C60", name: "Ruy Lopez", moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"] },
  {
    eco: "C68",
    name: "Ruy Lopez, Exchange",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6"],
  },
  {
    eco: "C78",
    name: "Ruy Lopez, Morphy Defense",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4"],
  },
  // 1. d4 …
  { eco: "A40", name: "Queen's Pawn Opening", moves: ["d4"] },
  { eco: "A45", name: "Indian Defense", moves: ["d4", "Nf6"] },
  { eco: "A80", name: "Dutch Defense", moves: ["d4", "f5"] },
  { eco: "D00", name: "Queen's Pawn Game", moves: ["d4", "d5"] },
  { eco: "D06", name: "Queen's Gambit", moves: ["d4", "d5", "c4"] },
  { eco: "D20", name: "Queen's Gambit Accepted", moves: ["d4", "d5", "c4", "dxc4"] },
  { eco: "D30", name: "Queen's Gambit Declined", moves: ["d4", "d5", "c4", "e6"] },
  { eco: "D10", name: "Slav Defense", moves: ["d4", "d5", "c4", "c6"] },
  { eco: "E00", name: "Catalan / Indian", moves: ["d4", "Nf6", "c4", "e6", "g3"] },
  { eco: "E20", name: "Nimzo-Indian Defense", moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"] },
  { eco: "E60", name: "King's Indian Defense", moves: ["d4", "Nf6", "c4", "g6"] },
  { eco: "E12", name: "Queen's Indian Defense", moves: ["d4", "Nf6", "c4", "e6", "Nf3", "b6"] },
  { eco: "D70", name: "Grünfeld Defense", moves: ["d4", "Nf6", "c4", "g6", "Nc3", "d5"] },
  // Flank & others
  { eco: "A04", name: "Réti Opening", moves: ["Nf3"] },
  { eco: "A10", name: "English Opening", moves: ["c4"] },
  { eco: "A00", name: "Bird's Opening", moves: ["f4"] },
  { eco: "B00", name: "Owen / Nimzo-Larsen", moves: ["b3"] },
  { eco: "A00", name: "Larsen's Opening", moves: ["b3"] },
];

/** Strip check/mate/annotation glyphs so SAN strings compare cleanly. */
function normalizeSan(san: string): string {
  return san.replace(/[+#!?]/g, "");
}

export type OpeningMatch = { eco: string; name: string; plies: number };

/**
 * Find the longest known opening that is a prefix of the given SAN list.
 * Returns the opening plus how many plies it covers (used to mark those
 * moves as "book"), or null when nothing matches.
 */
export function detectOpening(sans: string[]): OpeningMatch | null {
  const game = sans.map(normalizeSan);
  let best: OpeningMatch | null = null;
  for (const op of OPENINGS) {
    if (op.moves.length > game.length) continue;
    let ok = true;
    for (let i = 0; i < op.moves.length; i++) {
      if (normalizeSan(op.moves[i]) !== game[i]) {
        ok = false;
        break;
      }
    }
    if (ok && (!best || op.moves.length > best.plies)) {
      best = { eco: op.eco, name: op.name, plies: op.moves.length };
    }
  }
  return best;
}

export type BookContinuation = { san: string; eco: string; name: string };

/**
 * Theory continuations from the current line: every book opening whose
 * moves extend the given SAN prefix by at least one ply, keyed by that
 * next move. Feeds the "Theory" tab of the opening explorer.
 */
export function bookContinuations(sans: string[]): BookContinuation[] {
  const game = sans.map(normalizeSan);
  const byMove = new Map<string, BookContinuation>();
  for (const op of OPENINGS) {
    if (op.moves.length <= game.length) continue;
    let ok = true;
    for (let i = 0; i < game.length; i++) {
      if (normalizeSan(op.moves[i]) !== game[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const next = op.moves[game.length];
    // Prefer the most specific (longest) named line for each move.
    const existing = byMove.get(next);
    if (!existing || op.moves.length === game.length + 1) {
      byMove.set(next, { san: next, eco: op.eco, name: op.name });
    }
  }
  return [...byMove.values()];
}
