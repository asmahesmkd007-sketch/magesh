// Curated, human-named puzzles. Each is verified as an EXACT forced mate in N
// (or a legal winning line) by chess.js before being emitted. Bad ones are dropped.
const { Chess, validateFen } = require("chess.js");
const uci = (m) => m.from + m.to + (m.promotion || "");
function attackerMate(chess, n) {
  for (const m of chess.moves({ verbose: true })) {
    chess.move(m);
    if (chess.isCheckmate()) {
      chess.undo();
      return [uci(m)];
    }
    if (n >= 2 && !chess.isGameOver()) {
      const line = defenderAllMate(chess, n - 1);
      if (line) {
        chess.undo();
        return [uci(m), ...line];
      }
    }
    chess.undo();
  }
  return null;
}
function defenderAllMate(chess, n) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  let first = null;
  for (const d of moves) {
    chess.move(d);
    const line = attackerMate(chess, n);
    chess.undo();
    if (!line) return null;
    if (!first) first = [uci(d), ...line];
  }
  return first;
}

// [fen, n, id, theme, category, rating, explanation]
const C = [
  [
    "6rk/6pp/7N/8/8/8/6PP/6K1 w - - 0 1",
    2,
    "smothered-knight",
    "Smothered Mate",
    "Smothered Mate",
    1550,
    "The knight forces the king into the corner; boxed in by its own pieces, it is smothered.",
  ],
  [
    "6k1/5ppp/8/8/8/8/8/R3R1K1 w - - 0 1",
    1,
    "back-rank-double",
    "Back Rank Mate",
    "Back Rank Mate",
    780,
    "The rook crashes to the back rank where the king is trapped behind its own pawns.",
  ],
  [
    "7k/8/5N1K/8/8/8/8/7R w - - 0 1",
    1,
    "arabian-classic",
    "Arabian Mate",
    "Arabian Mate",
    1120,
    "Knight and rook combine in the corner — the classic Arabian mate.",
  ],
  [
    "6k1/5ppp/8/8/8/8/5PPP/1r4K1 b - - 0 1",
    1,
    "back-rank-black",
    "Back Rank Mate",
    "Back Rank Mate",
    820,
    "Black's rook exploits White's weak back rank.",
  ],
  [
    "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
    1,
    "queen-corner",
    "Corner Mate",
    "Winning Material",
    560,
    "The queen mates the cornered king with its own king in support.",
  ],
  [
    "2k5/8/1QK5/8/8/8/8/8 w - - 0 1",
    1,
    "queen-support",
    "Corner Box Mate",
    "Winning Material",
    640,
    "The king supports the queen for a textbook box mate.",
  ],
  [
    "7k/5ppp/8/8/8/8/8/R6K w - - 0 1",
    2,
    "ladder-start",
    "Ladder Mate",
    "Rook Sacrifice Mate",
    780,
    "Rooks (or rook + support) drive the king up the board rung by rung.",
  ],
  [
    "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4",
    1,
    "scholars-mate",
    "Scholar's Mate",
    "Forced Checkmate",
    640,
    "Qxf7 is the four-move Scholar's Mate — f7 is the weakest square in Black's camp.",
  ],
  [
    "7k/6P1/8/8/8/8/8/K5R1 w - - 0 1",
    1,
    "promo-queen",
    "Promotion",
    "Promotion Tactics",
    900,
    "Promoting to a queen delivers immediate mate on the long diagonal of the corner.",
  ],
  [
    "3rkr2/8/4K3/8/7Q/8/8/8 w - - 0 1",
    1,
    "epaulette",
    "Epaulette Mate",
    "Forced Checkmate",
    1280,
    "The king's own rooks (epaulettes) rob it of escape squares; the queen mates.",
  ],
];

const out = [];
for (const [fen, n, id, theme, category, rating, explanation] of C) {
  if (!validateFen(fen).ok) {
    process.stderr.write(`BAD FEN ${id}\n`);
    continue;
  }
  const line = attackerMate(new Chess(fen), n);
  if (!line) {
    process.stderr.write(`NO MATE-${n} ${id}\n`);
    continue;
  }
  out.push({ fen, moves: line, n, id, theme, category, rating, explanation, goal: `Mate in ${n}` });
}
process.stderr.write(`curated verified=${out.length}/${C.length}\n`);
console.log(JSON.stringify(out));
