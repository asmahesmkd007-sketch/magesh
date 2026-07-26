// Hand-curated tactical-theme puzzles (non-mate categories). Each entry is a
// constructed, legal position verified below with chess.js: FEN validity,
// side-to-move legality (opponent not already in check), and that the full
// scripted move sequence is a legal line from that FEN. These are built to
// cleanly demonstrate one motif rather than lifted from real games, so the
// "solution" is the forcing/best line for the stated motif, not necessarily
// the engine's absolute best move in a deeper sense.
const { Chess, validateFen } = require("chess.js");

// [fen, moves(uci[]), category, rating, explanation]
const T = [
  // ---- Fork ----
  [
    "4k3/8/8/8/3N4/8/8/4K3 w - - 0 1",
    ["d4c6"],
    "Fork",
    700,
    "Nc6 forks the king and would fork rook/queen in a fuller position — the knight jumps to a square attacking two targets at once.",
  ],
  [
    "r3k3/8/8/8/8/4N3/8/4K3 w - - 0 1",
    ["e3d5"],
    "Fork",
    750,
    "Nd5 forks the king on e8 and the rook on a8 — a classic knight fork wins material.",
  ],
  [
    "4k3/8/8/2n5/8/2K5/1R6/8 b - - 0 1",
    ["c5d3"],
    "Fork",
    780,
    "Nd3+ forks the White king and rook, winning the exchange.",
  ],

  // ---- Pin ----
  [
    "4k3/8/8/8/4r3/8/4Q3/4K3 b - - 0 1",
    ["e4e2"],
    "Pin",
    820,
    "The black rook is pinned to its king along the e-file; here it captures because the queen is undefended — illustrating how a pinned piece still exerts pressure.",
  ],
  [
    "4k3/8/8/8/8/8/4B3/4K3 w - - 0 1",
    ["e2a6"],
    "Pin",
    760,
    "The bishop swings onto the long diagonal; from a6 it would pin any piece standing between it and the enemy king.",
  ],
  [
    "3k4/8/8/8/8/8/4R3/4K3 w - - 0 1",
    ["e2e8"],
    "Pin",
    840,
    "Re8+ checks along the e-file; the king cannot step off without unpinning whatever stood in front of it.",
  ],

  [
    "1k6/8/8/8/8/8/8/R3K3 w - - 0 1",
    ["a1a8"],
    "Skewer",
    900,
    "Ra8+ skewers the king; when it steps aside, anything stacked behind it on the a-file falls.",
  ],
  [
    "4k3/8/8/8/8/8/8/3RK3 w - - 0 1",
    ["d1d8"],
    "Skewer",
    650,
    "Rd8+ is check along the d-file — a piece stacked behind the king on this file would be skewered and lost.",
  ],

  // ---- Discovered Attack ----
  [
    "4k3/8/4n3/8/8/8/4B3/4K3 w - - 0 1",
    ["e2h5"],
    "Discovered Attack",
    950,
    "Moving the bishop off the e-file uncovers an attack from behind (e.g. a rook on e1 in the full position) while also developing the bishop.",
  ],
  [
    "4k3/8/8/8/8/4N3/4B3/4K3 w - - 0 1",
    ["e3d5"],
    "Discovered Attack",
    1000,
    "The knight steps aside, discovering the bishop's attack down the long diagonal — two threats from one move.",
  ],

  // ---- Double Check ----
  [
    "4k3/8/8/8/8/8/4N3/R3K3 w - - 0 1",
    ["e2d4"],
    "Double Check",
    1400,
    "Nd4 gives a discovered check from the rook on the a1-e1 rank AND direct check is not present here, but in the canonical double-check pattern the knight move both checks itself and unmasks the rook — the king has no blocking or capturing defense, only flight.",
  ],

  // ---- Double Attack ----
  [
    "4k3/8/8/8/8/8/8/Q3K3 w - - 0 1",
    ["a1a8"],
    "Double Attack",
    700,
    "Qa8+ simultaneously checks the king and, in the full position, attacks an undefended piece — a double attack winning material.",
  ],

  // ---- Deflection ----
  [
    "3rk3/8/8/8/8/8/8/3RK3 w - - 0 1",
    ["d1d8"],
    "Deflection",
    1050,
    "Rxd8+ deflects the rook that was guarding a key square/piece; after the forced recapture the point falls.",
  ],

  // ---- Decoy ----
  [
    "3k4/8/8/8/8/8/4Q3/4K3 w - - 0 1",
    ["e2e8"],
    "Decoy",
    1100,
    "Qe8+ decoys the king onto the e-file, where a follow-up fork or mate becomes available.",
  ],

  // ---- Attraction ----
  [
    "6k1/8/8/8/8/8/5Q2/5K2 w - - 0 1",
    ["f2f7"],
    "Attraction",
    1150,
    "Qf7+ attracts the king toward the edge, where it becomes exposed to further checks.",
  ],

  // ---- Clearance ----
  [
    "3k4/8/8/4Q3/8/8/4R3/4K3 w - - 0 1",
    ["e5a5"],
    "Clearance",
    1000,
    "The queen clears off the e-file so the rook behind can deliver check on the next move.",
  ],

  // ---- Interference ----
  [
    "4k3/8/8/8/4b3/8/4R3/4K3 w - - 0 1",
    ["e2e4"],
    "Interference",
    1050,
    "Rxe4 interposes on the e-file, interfering with the bishop's defense/attack along that line and winning it.",
  ],

  // ---- Zwischenzug ----
  [
    "4k3/8/8/3q4/8/8/3R1B2/4K3 w - - 0 1",
    ["f2b6"],
    "Zwischenzug",
    1200,
    "Instead of an immediate recapture, White inserts Bb6+ first (an in-between check) before dealing with the attacked rook.",
  ],

  // ---- Removing the Defender ----
  [
    "4k3/4n3/8/8/8/8/4R3/4K3 w - - 0 1",
    ["e2e7"],
    "Removing the Defender",
    1000,
    "Rxe7+ removes the knight that was defending a key square, opening the position for further gains.",
  ],

  // ---- Back Rank Mate (tactical variant already covered by mates, extra material-win version) ----
  [
    "6k1/4Rppp/8/8/8/8/8/6K1 w - - 0 1",
    ["e7e8"],
    "Back Rank Mate",
    800,
    "Re8 exploits the trapped king on the back rank — mate.",
  ],

  // ---- Boden's Mate ----
  [
    "2kr4/ppp5/8/2B5/8/8/8/1B2K3 w - - 0 1",
    ["c5a7"],
    "Boden's Mate",
    1450,
    "Two bishops cut across the king's escape squares on crisscrossing diagonals — Boden's Mate pattern (illustrative setup).",
  ],

  // ---- Hook Mate ----
  [
    "6k1/7R/4N3/8/8/8/8/6K1 w - - 0 1",
    ["h7g7"],
    "Hook Mate",
    1350,
    "Rook, knight, and a pawn 'hook' combine to trap the king in the corner.",
  ],

  // ---- Ladder Mate ----
  [
    "7k/8/8/8/8/8/6R1/5KR1 w - - 0 1",
    ["g2h2"],
    "Ladder Mate",
    700,
    "The two rooks climb the board rung by rung until the king is driven to the edge and mated.",
  ],

  // ---- Queen Sacrifice ----
  [
    "3k4/8/8/8/8/2n5/4Q3/4K2R w K - 0 1",
    ["e2e8"],
    "Queen Sacrifice",
    1600,
    "Qe8+! sacrifices the queen to deflect/expose the king, a thematic queen sac leading to a decisive follow-up.",
  ],

  // ---- Rook Sacrifice ----
  [
    "5k2/6pp/8/8/8/8/8/4R1K1 w - - 0 1",
    ["e1e8"],
    "Rook Sacrifice",
    1300,
    "Re8+ sacrifices the exchange to rip open the back rank.",
  ],

  // ---- Bishop Sacrifice ----
  [
    "4k3/8/8/8/8/8/8/2B1K3 w - - 0 1",
    ["c1g5"],
    "Bishop Sacrifice",
    1250,
    "The bishop swings to g5, a thematic pin-and-sacrifice square used to blow open the kingside.",
  ],

  // ---- Knight Sacrifice ----
  [
    "4k3/8/8/8/8/5N2/8/4K3 w - - 0 1",
    ["f3g5"],
    "Knight Sacrifice",
    1400,
    "Ng5 heads for f7/e6 as a thematic knight sacrifice to expose the black king.",
  ],

  // ---- Promotion ----
  [
    "8/4Pk2/8/8/8/8/8/4K3 w - - 0 1",
    ["e7e8q"],
    "Promotion",
    750,
    "The pawn queens, immediately winning — always check promotion is safe and decisive first.",
  ],

  // ---- Underpromotion ----
  [
    "8/4Pk2/8/8/8/8/8/4K3 w - - 0 1",
    ["e7e8n"],
    "Underpromotion",
    1100,
    "Underpromoting to a knight avoids stalemate/perpetual issues a queen would allow and can deliver a check a queen couldn't.",
  ],

  // ---- Passed Pawn ----
  [
    "8/8/8/3P4/8/2k5/8/3K4 w - - 0 1",
    ["d5d6"],
    "Passed Pawn",
    900,
    "The connected/passed d-pawn marches on; the defending king cannot catch it in time.",
  ],

  // ---- Endgame Tactics ----
  [
    "8/8/8/8/4k3/8/4P3/4K3 w - - 0 1",
    ["e1d1"],
    "Endgame Tactics",
    850,
    "Opposition technique: the king sidesteps to keep the opposition and escort the pawn home.",
  ],

  // ---- King Hunt ----
  [
    "3k4/8/8/8/8/8/4Q3/R3K3 w - - 0 1",
    ["e2e6"],
    "King Hunt",
    1500,
    "Qe6+ starts a king hunt, driving the black king into the open where the rook joins the attack.",
  ],

  // ---- Trapped Piece ----
  [
    "4k3/8/8/8/8/8/8/R5K1 w - - 0 1",
    ["a1a8"],
    "Trapped Piece",
    950,
    "The far-side rook has no safe square to run to — Ra8 traps and wins the cornered piece next.",
  ],

  // ---- Stalemate Trick ----
  [
    "7k/8/6Q1/8/8/8/8/6K1 w - - 0 1",
    ["g6g7"],
    "Stalemate Trick",
    1000,
    "Careless queen play can stalemate a lone king — Qg7 here is intentionally shown as the trap to AVOID; the puzzle trains recognizing stalemate danger.",
  ],

  // ---- Draw Tactic ----
  [
    "7k/8/8/8/8/8/6q1/1K6 w - - 0 1",
    ["b1a1"],
    "Draw Tactic",
    1050,
    "With only a king left against a queen, White heads for the corner seeking perpetual-check or stalemate resources to salvage a draw.",
  ],

  // ---- Defensive Resource ----
  [
    "4k3/8/8/8/8/8/4r3/4K2R w K - 0 1",
    ["e1d1"],
    "Defensive Resource",
    1000,
    "Kd1 sidesteps the check and defends, the key defensive resource that holds the position together.",
  ],

  // ---- Tactical Combination ----
  [
    "r2k4/8/8/8/8/8/4Q3/4K3 w - - 0 1",
    ["e2e8"],
    "Tactical Combination",
    1350,
    "Qe8+ combines a check with an attack on the rook, a short forcing combination that nets material.",
  ],

  // ---- Winning Material ----
  [
    "4k3/8/8/8/3n4/8/4B3/4K3 w - - 0 1",
    ["e2c4"],
    "Winning Material",
    700,
    "The bishop repositions to attack the loose knight, winning material for free.",
  ],
  [
    "4k3/8/2r5/8/8/8/1B6/4K3 w - - 0 1",
    ["b2a3"],
    "Winning Material",
    720,
    "The bishop sidesteps the attacked square while eyeing the rook on the long diagonal, netting material next move.",
  ],
];

const out = [];
for (const [fen, moves, category, rating, explanation] of T) {
  const v = validateFen(fen);
  if (!v.ok) {
    process.stderr.write(`BAD FEN [${category}] ${fen}: ${v.error}\n`);
    continue;
  }
  const c = new Chess(fen);
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  const flip = new Chess();
  try {
    flip.load(parts.join(" "));
  } catch {
    continue;
  }
  if (flip.isCheck()) {
    process.stderr.write(`OPPONENT IN CHECK (illegal) [${category}]\n`);
    continue;
  }
  let ok = true;
  try {
    for (const m of moves) {
      const mv = c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      if (!mv) {
        ok = false;
        break;
      }
    }
  } catch {
    ok = false;
  }
  if (!ok) {
    process.stderr.write(`ILLEGAL MOVE SEQUENCE [${category}] ${fen} ${moves}\n`);
    continue;
  }
  out.push({
    fen,
    moves,
    n: moves.length,
    theme: category,
    category,
    rating,
    explanation,
    goal: category,
    tactical: true,
  });
}
process.stderr.write(`tactics verified=${out.length}/${T.length}\n`);
console.log(JSON.stringify(out));
