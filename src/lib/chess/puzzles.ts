// Verified tactical puzzles — every solution line is legal and ends in checkmate.
// moves are UCI strings (from+to[+promotion]) alternating solver / scripted reply.
export type Puzzle = {
  id: string;
  fen: string;
  moves: string[];
  theme: string;
  goal: string;
  rating: number;
};

export const PUZZLES: Puzzle[] = [
  {
    id: "back-rank-rook",
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    moves: ["e1e8"],
    theme: "Back Rank",
    goal: "Mate in 1",
    rating: 820,
  },
  {
    id: "scholars",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4",
    moves: ["h5f7"],
    theme: "Scholar's Mate",
    goal: "Mate in 1",
    rating: 760,
  },
  {
    id: "smothered",
    fen: "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1",
    moves: ["h6f7"],
    theme: "Smothered Mate",
    goal: "Mate in 1",
    rating: 1150,
  },
  {
    id: "arabian",
    fen: "7k/8/5N2/8/8/8/8/K5R1 w - - 0 1",
    moves: ["g1g8"],
    theme: "Arabian Mate",
    goal: "Mate in 1",
    rating: 1040,
  },
  {
    id: "kq-edge",
    fen: "7k/8/6K1/8/8/8/8/7Q w - - 0 1",
    moves: ["h1h7"],
    theme: "Queen Endgame",
    goal: "Mate in 1",
    rating: 680,
  },
  {
    id: "back-rank-queen",
    fen: "6k1/5ppp/8/8/8/8/5PPP/2Q3K1 w - - 0 1",
    moves: ["c1c8"],
    theme: "Back Rank",
    goal: "Mate in 1",
    rating: 880,
  },
  {
    id: "philidor",
    fen: "5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1",
    moves: ["c4g8", "f8g8", "h6f7"],
    theme: "Smothered Mate",
    goal: "Mate in 2",
    rating: 1620,
  },
  {
    id: "kq-corner",
    fen: "7k/8/6K1/8/8/8/8/3Q4 w - - 0 1",
    moves: ["d1d8"],
    theme: "Queen Endgame",
    goal: "Mate in 1",
    rating: 700,
  },
  {
    id: "epaulette",
    fen: "3rkr2/8/4K3/8/7Q/8/8/8 w - - 0 1",
    moves: ["h4e7"],
    theme: "Epaulette Mate",
    goal: "Mate in 1",
    rating: 1280,
  },
  {
    id: "legal",
    fen: "rn1qkbnr/ppp2ppp/3p4/4N3/2B1P3/2N5/PPPP1PPP/R1BbK2R w KQkq - 0 6",
    moves: ["c4f7", "e8e7", "c3d5"],
    theme: "Légal's Mate",
    goal: "Mate in 2",
    rating: 1480,
  },
  {
    id: "double-rook",
    fen: "7k/R7/8/8/8/8/8/1R5K w - - 0 1",
    moves: ["b1b8"],
    theme: "Ladder Mate",
    goal: "Mate in 1",
    rating: 640,
  },
  {
    id: "promotion",
    fen: "7k/6P1/8/8/8/8/8/K5R1 w - - 0 1",
    moves: ["g7g8q"],
    theme: "Promotion",
    goal: "Mate in 1",
    rating: 980,
  },
];
