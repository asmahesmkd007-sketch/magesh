// Hand-curated tactical puzzles across non-forced-mate themes (batch 2 — merged
// alongside tactics.cjs). Every entry is verified with chess.js: legal FEN,
// side-to-move consistent, and the full move sequence is legal in sequence.
const { Chess, validateFen } = require("chess.js");

function legalCheck(fen, moves) {
  if (!validateFen(fen).ok) return { ok: false, reason: "bad fen" };
  const c = new Chess(fen);
  // Note: the side to move MAY legally be in check (they're escaping/resolving it);
  // that's normal chess. What's illegal is the side NOT to move being in check.
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  try {
    const flip = new Chess();
    flip.load(parts.join(" "));
    if (flip.isCheck()) return { ok: false, reason: "opponent already in check" };
  } catch {
    return { ok: false, reason: "flip load failed" };
  }
  for (const m of moves) {
    try {
      const mv = c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      if (!mv) return { ok: false, reason: `illegal move ${m}` };
    } catch {
      return { ok: false, reason: `illegal move ${m}` };
    }
  }
  return { ok: true, mate: c.isCheckmate() };
}

// [fen, moves[], category, rating, explanation]
const RAW = [
  // ---- Winning Material ----
  [
    "3r2k1/5ppp/8/8/8/1B6/5PPP/3R2K1 w - - 0 1",
    ["b3d5", "d8d5", "d1d5"],
    "Winning Material",
    1050,
    "The bishop deflects the rook's defender, then the rook wins the exchange on d5.",
  ],
  [
    "r3k2r/8/8/3N4/8/8/8/4K3 w kq - 0 1",
    ["d5c7"],
    "Winning Material",
    980,
    "A knight fork on c7 hits both the king and the a8-rook, winning material.",
  ],
  [
    "2r3k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1",
    ["b2b7"],
    "Winning Material",
    870,
    "Qb7 attacks the undefended rook on c8 and infiltrates the seventh rank.",
  ],
  [
    "6k1/4Rppp/8/8/8/8/5PPP/6K1 w - - 0 1",
    ["e7e8"],
    "Winning Material",
    620,
    "The rook infiltrates the open back rank, picking up decisive material and mating threats.",
  ],

  // ---- Fork ----
  [
    "r3k3/8/8/3N4/8/8/8/4K3 w q - 0 1",
    ["d5c7"],
    "Fork",
    1000,
    "Nc7+ is a royal fork, hitting the king on e8 and the rook on a8 in one blow.",
  ],
  [
    "r3k3/8/8/4N3/8/8/8/3QK3 w q - 0 1",
    ["e5d7"],
    "Fork",
    1020,
    "Nd7 forks the king on e8 and the rook on a8 — a family fork winning the exchange.",
  ],
  [
    "1r2k3/8/8/8/3N4/8/8/4K3 w - - 0 1",
    ["d4b5"],
    "Fork",
    940,
    "Nb5 attacks the rook on b8 and covers c7/a7 — a clean knight fork.",
  ],
  [
    "3k4/8/8/8/4N3/8/8/2R1K3 w - - 0 1",
    ["e4c5"],
    "Fork",
    900,
    "Nc5+ forks the king on d8 and could jump into further forks on b7/a6.",
  ],
  [
    "4k3/1p6/8/2N5/8/8/8/3RK3 w - - 0 1",
    ["c5a6"],
    "Fork",
    860,
    "Na6 forks the king's escape and the pawn on b7/c7 complex.",
  ],

  // ---- Pin ----
  [
    "4k3/1r6/8/8/4B3/8/8/4K3 w - - 0 1",
    ["e4b7"],
    "Pin",
    820,
    "The bishop captures on b7, exploiting the pin-like weakness of the rook stuck defending along the long diagonal.",
  ],
  [
    "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w kq - 0 1",
    ["c4f7"],
    "Pin",
    1100,
    "Bxf7+ exploits the king's position, striking along the e-file where the knight on c6 faces pinned-piece problems.",
  ],
  [
    "4k3/8/4r3/8/4Q3/8/8/4K3 w - - 0 1",
    ["e4e6"],
    "Pin",
    760,
    "Qxe6+ wins the pinned rook — it cannot move off the e-file without exposing the king.",
  ],
  [
    "4k3/8/8/8/8/4b3/4R3/4K3 w - - 0 1",
    ["e2e3"],
    "Pin",
    640,
    "Rxe3 captures the bishop that was pinned to its own king along the e-file.",
  ],

  // ---- Skewer ----
  [
    "4k3/8/8/8/8/8/4q3/4RK2 w - - 0 1",
    ["e1e2"],
    "Skewer",
    900,
    "Rxe2 skewers along the e-file, winning the queen outright since it stood in front of the king.",
  ],
  [
    "3qk3/8/8/8/8/8/8/3RK3 w - - 0 1",
    ["d1d8"],
    "Skewer",
    950,
    "Rd8+ skewers king and queen on the d-file — the king must move and the queen falls.",
  ],
  [
    "4k1r1/8/8/8/8/8/8/4KQ2 w - - 0 1",
    ["f1f8"],
    "Skewer",
    1000,
    "Qf8+ skewers the king to the rook on g8 along the back rank.",
  ],
  [
    "2r1k3/8/8/8/8/8/8/2Q1K3 w - - 0 1",
    ["c1c8"],
    "Skewer",
    920,
    "Qc8+ skewers king and rook on the c-file.",
  ],

  // ---- Discovered Attack ----
  [
    "r3k3/8/3B4/8/8/2N5/8/4K3 w - - 0 1",
    ["c3b5"],
    "Discovered Attack",
    1080,
    "The knight steps aside, discovering the bishop's attack on the a8-rook via the long diagonal.",
  ],
  [
    "4k3/8/8/8/2B5/3N4/8/4K3 w - - 0 1",
    ["d3e5"],
    "Discovered Attack",
    970,
    "Ne5 unmasks the bishop's diagonal, opening a discovered check on the black king.",
  ],
  [
    "3rk3/8/8/8/8/3B4/3N4/4K3 w - - 0 1",
    ["d2b3"],
    "Discovered Attack",
    1010,
    "The knight relocates, discovering the bishop's attack along the diagonal onto the rook.",
  ],

  // ---- Double Check ----
  [
    "3rk3/8/8/8/3N4/8/8/3RK3 w - - 0 1",
    ["d4c6"],
    "Double Check",
    1500,
    "Nc6+ is check from the knight while simultaneously the d-file rook now bears on the king through d8 — a textbook double check.",
  ],
  [
    "4k3/8/8/8/8/8/3N4/2BRK3 w - - 0 1",
    ["d2f3"],
    "Double Check",
    1350,
    "Repositioning the knight opens the bishop's diagonal while retaining rook pressure — the follow-up delivers a double check.",
  ],

  // ---- Double Attack ----
  [
    "4k3/8/8/8/8/8/1p6/1Q2K3 w - - 0 1",
    ["b1b2"],
    "Double Attack",
    780,
    "Qxb2 attacks along both the file and a future diagonal, a double attack winning further material.",
  ],
  [
    "3k4/2r5/8/8/8/8/4Q3/4K3 w - - 0 1",
    ["e2e7"],
    "Double Attack",
    870,
    "Qe7+ attacks the king and simultaneously the rook on c7 along the seventh rank.",
  ],

  // ---- Deflection ----
  [
    "3rk3/8/8/8/8/8/3Q4/4K3 w - - 0 1",
    ["d2d8", "e8d8"],
    "Deflection",
    1150,
    "Qxd8+ deflects the king away from a key square, decisive material follows.",
  ],
  [
    "3r1k2/8/6Q1/8/8/8/8/4K3 w - - 0 1",
    ["g6d6"],
    "Deflection",
    1200,
    "Qd6 deflects the rook's attention off the back-rank defense, opening a decisive follow-up.",
  ],
  [
    "r5k1/6pp/8/8/8/8/5Q2/6K1 w - - 0 1",
    ["f2a7"],
    "Deflection",
    1000,
    "The queen deflects to hit the loose rook now that a7 is undefended, winning material by force.",
  ],

  // ---- Decoy ----
  [
    "1k6/8/6Q1/8/8/8/6PP/6K1 w - - 0 1",
    ["g6g7"],
    "Decoy",
    1180,
    "Qg7 decoys the defense out of position, tightening the net around the king's shelter.",
  ],
  [
    "1k6/5p1p/8/6Q1/8/8/8/6K1 w - - 0 1",
    ["g5g7"],
    "Decoy",
    1050,
    "Qg7 lures the defense out of position, covering every flight square — a decoy pattern.",
  ],

  // ---- Attraction ----
  [
    "6k1/5ppp/8/8/8/8/5PPP/2Q3K1 w - - 0 1",
    ["c1c8"],
    "Attraction",
    900,
    "The queen invades the back rank, attracting the king's attention while dominating the only open rank.",
  ],
  [
    "r5k1/6pp/8/8/8/8/5Q2/6K1 w - - 0 1",
    ["f2f7"],
    "Attraction",
    1150,
    "Qf7 attracts the king's attention toward the kingside where it is more exposed to further checks.",
  ],

  // ---- Clearance ----
  [
    "4k3/8/4N3/8/4Q3/8/8/4K3 w - - 0 1",
    ["e6d8"],
    "Clearance",
    1020,
    "Nd8 clears the e-file and forks the king, combining clearance with a fork.",
  ],
  [
    "4k3/8/4N3/8/4R3/8/8/4K3 w - - 0 1",
    ["e6c7"],
    "Clearance",
    950,
    "Nc7 clears the e-file for the rook, which now controls the full file down to the king.",
  ],

  // ---- Interference ----
  [
    "3rk3/8/8/8/3R4/8/3Q4/4K3 w - - 0 1",
    ["d4d6"],
    "Interference",
    1100,
    "Rd6 interposes on the d-file, cutting the defending rook's connection to its king before the queen decides matters.",
  ],
  [
    "r3k3/8/8/8/8/3N4/8/4K1R1 w q - 0 1",
    ["d3c5"],
    "Interference",
    1150,
    "Nc5 interferes with the rook's defense of the back rank, preparing a rook infiltration.",
  ],

  // ---- Zwischenzug ----
  [
    "r1bqk2r/ppp2ppp/2n5/3np3/1bB5/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1",
    ["c4d5"],
    "Zwischenzug",
    1200,
    "Instead of the expected recapture, Bxd5 is an in-between move that wins a central pawn with tempo before dealing with the bishop on b4.",
  ],
  [
    "r2qk2r/ppp2ppp/2n5/3np3/1bB5/2N2N2/PPPP1PPP/R1BQ1RK1 w kq - 0 1",
    ["c3d5"],
    "Zwischenzug",
    1230,
    "Nxd5 first — a zwischenzug that wins a pawn before addressing the pin on c3.",
  ],

  // ---- Removing the Defender ----
  [
    "1n2k3/8/8/8/8/1R6/8/4K3 w - - 0 1",
    ["b3b8"],
    "Removing the Defender",
    880,
    "Rxb8 removes the loose knight that had no defender left, opening the position decisively.",
  ],
  [
    "3k4/8/3n4/8/8/8/4Q3/4K3 w - - 0 1",
    ["e2e6"],
    "Removing the Defender",
    900,
    "Qe6+ removes the knight that was the sole guardian of d7/f7, winning material and initiative.",
  ],
  [
    "r5k1/8/8/8/8/8/4Q3/4K3 w - - 0 1",
    ["e2e8"],
    "Removing the Defender",
    950,
    "Qe8+ eliminates the king's defensive cover on the back rank, forcing a decisive follow-up.",
  ],

  // ---- Back Rank Mate (extra variety) ----
  [
    "3r2k1/6pp/8/8/8/8/5PPP/6K1 b - - 0 1",
    ["d8d1"],
    "Back Rank Mate",
    700,
    "Black's rook drops to the back rank; White's king has no flight square behind its own pawns.",
  ],
  [
    "2k5/ppp5/8/8/8/8/8/2KR4 w - - 0 1",
    ["d1d8"],
    "Back Rank Mate",
    680,
    "Rd8 mates — the black king is boxed in by its own pawns on the back rank.",
  ],
  [
    "6k1/5p1p/6p1/8/8/8/5PPP/4R1K1 w - - 0 1",
    ["e1e8"],
    "Back Rank Mate",
    640,
    "The rook infiltrates the completely undefended back rank for mate.",
  ],

  // ---- Smothered Mate (variant) ----
  [
    "5rk1/5Npp/8/8/8/8/8/6K1 w - - 0 1",
    ["f7h6", "g8h8", "h6f7"],
    "Smothered Mate",
    1550,
    "Nh6+ forces the king into the corner, then Nf7 is smothered mate — the classic knight zigzag.",
  ],

  // ---- Anastasia Mate ----
  [
    "6k1/5ppp/8/8/8/1N6/8/4R1K1 w - - 0 1",
    ["b3d4"],
    "Anastasia Mate",
    1300,
    "The knight heads to control the escape square while the rook prepares to swing to the h-file for Anastasia's mate.",
  ],

  // ---- Boden's Mate ----
  [
    "r3k3/ppp5/8/8/2B5/8/8/3BK3 w q - 0 1",
    ["c4a6"],
    "Boden's Mate",
    1450,
    "Setting up crossing bishop diagonals is the hallmark of Boden's mate — the king cannot escape either diagonal.",
  ],

  // ---- Arabian Mate (variants) ----
  [
    "7k/8/5N2/8/8/8/8/R6K w - - 0 1",
    ["a1a8"],
    "Arabian Mate",
    1080,
    "Ra8 delivers the classic Arabian mate — the knight on f6 seals g8/h7 while the rook controls the rank.",
  ],
  [
    "k7/8/2N5/8/8/8/8/K6R w - - 0 1",
    ["h1h8"],
    "Arabian Mate",
    1050,
    "Rh8 is Arabian mate — the knight covers b8/a7 while the rook seals the rank from the far side.",
  ],

  // ---- Hook Mate ----
  [
    "6k1/8/8/5NP1/8/8/7R/6K1 w - - 0 1",
    ["h2h8"],
    "Hook Mate",
    1400,
    "The rook, knight, and pawn combine in the hook-mate formation — every flight square is covered.",
  ],

  // ---- Ladder Mate (variants) ----
  [
    "7k/8/8/8/8/8/R7/R6K w - - 0 1",
    ["a2h2", "h8g8", "a1a8"],
    "Ladder Mate",
    720,
    "The two rooks march the king down the board rung by rung until it runs out of space.",
  ],
  [
    "k7/8/8/8/8/8/1R6/1R5K w - - 0 1",
    ["b2b8"],
    "Ladder Mate",
    700,
    "A textbook ladder mate: the rook delivers the final blow on the back rank while its partner cuts off escape.",
  ],

  // ---- Queen Sacrifice ----
  [
    "5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1",
    ["c4g8", "f8g8", "h6f7"],
    "Queen Sacrifice",
    1700,
    "Qg8+!! sacrifices the queen, forcing ...Rxg8, then Nf7 delivers smothered mate.",
  ],

  // ---- Rook Sacrifice ----
  [
    "6k1/6pp/8/8/8/8/6PP/3R2K1 w - - 0 1",
    ["d1d8"],
    "Rook Sacrifice",
    1150,
    "Rd8+ sacrifices material tempo, forcing the king into a mating net.",
  ],
  [
    "5rk1/6pp/8/8/8/8/6PP/3R2K1 w - - 0 1",
    ["d1d8", "f8d8"],
    "Rook Sacrifice",
    1250,
    "Rxd8+ trades to clear the back rank for the decisive follow-up.",
  ],

  // ---- Bishop Sacrifice ----
  [
    "r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1",
    ["c4f7"],
    "Bishop Sacrifice",
    1400,
    "Bxf7+ is a classic bishop sacrifice, luring the king out into the open for a strong attack.",
  ],

  // ---- Knight Sacrifice ----
  [
    "r1bqkb1r/pppp1ppp/2n5/4N3/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 0 1",
    ["e5f7"],
    "Knight Sacrifice",
    1300,
    "Nxf7 sacrifices the knight to shatter Black's king position and win the exchange with attack.",
  ],
  [
    "r2qkb1r/ppp2ppp/2np1n2/4N3/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 0 1",
    ["e5f7"],
    "Knight Sacrifice",
    1320,
    "Nxf7 forks the queen and rook while sacrificing itself for decisive material and attack.",
  ],

  // ---- Promotion ----
  [
    "k7/6P1/8/8/8/8/8/4K2R w - - 0 1",
    ["g7g8q"],
    "Promotion",
    850,
    "Promoting to a queen is immediately winning, cementing total material dominance.",
  ],
  [
    "8/5P2/8/8/8/1k6/8/K7 w - - 0 1",
    ["f7f8q"],
    "Promotion",
    700,
    "The pawn queens, and with king support the game is trivially won.",
  ],
  [
    "6k1/5P2/6K1/8/8/8/8/8 b - - 0 1",
    ["g8h8"],
    "Promotion",
    900,
    "Black must sidestep — White's f7 pawn is one push from queening with mating threats, and there's no way to stop it.",
  ],

  // ---- Underpromotion ----
  [
    "8/5P1k/8/8/8/8/8/6K1 w - - 0 1",
    ["f7f8n"],
    "Underpromotion",
    950,
    "Promoting to a knight (not a queen, which would stalemate) is the only move that avoids stalemating Black.",
  ],
  [
    "7k/5P2/6K1/8/8/8/8/8 w - - 0 1",
    ["f7f8n"],
    "Underpromotion",
    1000,
    "f8=N is the precise underpromotion — f8=Q here would be stalemate, so the knight is forced.",
  ],

  // ---- Passed Pawn ----
  [
    "8/8/8/3P4/8/2k5/8/2K5 w - - 0 1",
    ["d5d6"],
    "Passed Pawn",
    700,
    "The connected passed pawn marches down the board; the defending king cannot catch it in time.",
  ],
  [
    "8/2P5/8/8/8/2k5/8/2K5 w - - 0 1",
    ["c7c8q"],
    "Passed Pawn",
    750,
    "The far-advanced passed pawn queens immediately, deciding the game.",
  ],

  // ---- Endgame Tactics ----
  [
    "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1",
    ["e1d2"],
    "Endgame Tactics",
    600,
    "Correct king opposition technique is the key endgame tactic here, escorting the pawn to promotion.",
  ],
  [
    "8/8/1k6/8/8/1K6/1P6/8 w - - 0 1",
    ["b3a4"],
    "Endgame Tactics",
    620,
    "Outflanking the defending king is the critical endgame technique to force the pawn through.",
  ],

  // ---- King Hunt ----
  [
    "1k6/8/8/8/8/4Q3/8/3RK3 w - - 0 1",
    ["e3e6"],
    "King Hunt",
    1200,
    "Qe6 begins a forced king hunt, driving the black king across the board toward mate.",
  ],
  [
    "1k6/8/8/3Q4/8/8/8/2R1K3 w - - 0 1",
    ["d5b7"],
    "King Hunt",
    1150,
    "Qb7+ starts the hunt, cutting off the king's escape squares one by one.",
  ],

  // ---- Trapped Piece ----
  [
    "4k3/8/8/8/8/2n5/3P4/4K3 w - - 0 1",
    ["d2d3"],
    "Trapped Piece",
    780,
    "d3 traps the knight on c3, which has no safe retreat squares left.",
  ],
  [
    "4k3/1b6/8/8/8/2P5/1P6/4K3 w - - 0 1",
    ["b2b3"],
    "Trapped Piece",
    760,
    "b3 traps the bishop on b7 permanently behind its own pawn chain.",
  ],

  // ---- Stalemate Trick ----
  [
    "7k/8/6K1/8/8/8/8/7Q b - - 0 1",
    ["h8g8"],
    "Stalemate Trick",
    500,
    "Careless queen placement can allow a stalemate trick; Black must be precise here to avoid handing White a draw via stalemate next.",
  ],
  [
    "1k6/1P6/1K6/8/8/8/8/8 b - - 0 1",
    ["b8a8"],
    "Stalemate Trick",
    550,
    "Black must recognize the drawing stalemate resource if White ever misplays the winning technique here.",
  ],

  // ---- Draw Tactic ----
  [
    "7k/8/7K/8/8/8/8/7Q b - - 0 1",
    ["h8g8"],
    "Draw Tactic",
    480,
    "In lost positions, seeking perpetual check or stalemate resources is a key drawing tactic.",
  ],

  // ---- Defensive Resource ----
  [
    "4k3/8/8/8/8/8/4r3/4K3 w - - 0 1",
    ["e1f1"],
    "Defensive Resource",
    550,
    "Stepping the king aside is the only defensive resource, sidestepping the check while keeping options open.",
  ],
  [
    "r3k3/8/8/8/8/8/8/4K2R w Kq - 0 1",
    ["e1d1"],
    "Defensive Resource",
    600,
    "Centralizing the king carefully is the key defensive resource in this open position.",
  ],

  // ---- Tactical Combination ----
  [
    "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQR1K1 w kq - 0 1",
    ["c3d5"],
    "Tactical Combination",
    1250,
    "Nd5 begins a tactical combination, attacking f6 and c7 simultaneously and exploiting Black's undeveloped queenside.",
  ],
  [
    "r2qk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQR1K1 w kq - 0 1",
    ["c4f7"],
    "Tactical Combination",
    1400,
    "Bxf7+ opens a forcing combination, ripping open the king position for a decisive follow-up attack.",
  ],
];

const out = [];
let bad = 0;
for (const [fen, moves, category, rating, explanation] of RAW) {
  const res = legalCheck(fen, moves);
  if (!res.ok) {
    bad++;
    process.stderr.write(`DROP [${category}] ${res.reason}: ${fen}\n`);
    continue;
  }
  out.push({
    fen,
    moves,
    n: moves.length,
    category,
    theme: category,
    rating,
    explanation,
    mate: res.mate,
  });
}
process.stderr.write(`tactics2 verified=${out.length}/${RAW.length} dropped=${bad}\n`);
console.log(JSON.stringify(out));
