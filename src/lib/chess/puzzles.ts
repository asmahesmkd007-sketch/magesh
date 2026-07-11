// AUTO-GENERATED + curated chess puzzles — every line is engine-verified (chess.js)
// to be a legal position ending in checkmate. Regenerate via scripts/generate-puzzles.
// Each puzzle: FEN, UCI move sequence (solver / scripted reply / solver …), theme,
// category, goal, rating, difficulty tier, theme tags, and a teaching explanation.
export type Puzzle = {
  id: string;
  fen: string;
  moves: string[];
  theme: string;
  goal: string;
  rating: number;
  // Optional so lightweight DB projections (e.g. Puzzle Rush) can build partial rows.
  category?: string;
  difficulty?: "Easy" | "Beginner" | "Intermediate" | "Advanced" | "Expert" | "Master";
  themes?: string[];
  explanation?: string;
};

export const DIFFICULTY_BANDS: { label: Puzzle["difficulty"]; min: number; max: number }[] = [
  { label: "Easy", min: 100, max: 500 },
  { label: "Beginner", min: 500, max: 800 },
  { label: "Intermediate", min: 800, max: 1200 },
  { label: "Advanced", min: 1200, max: 1800 },
  { label: "Expert", min: 1800, max: 2400 },
  { label: "Master", min: 2400, max: 4000 },
];

export function difficultyOf(rating: number): Puzzle["difficulty"] {
  return DIFFICULTY_BANDS.find((b) => rating >= b.min && rating < b.max)?.label ?? "Master";
}

export const PUZZLES: Puzzle[] = [
  {
    "id": "p-mate-in-1-88",
    "fen": "8/8/8/1R6/8/5K1k/8/3R4 w - - 0 1",
    "moves": [
      "b5h5"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 250,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-51",
    "fen": "8/k1K5/8/4R3/8/8/8/3B4 w - - 0 1",
    "moves": [
      "e5a5"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 254,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-39",
    "fen": "7k/8/8/4K3/6R1/6R1/8/8 w - - 0 1",
    "moves": [
      "g4h4"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 258,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-113",
    "fen": "k7/8/2K5/8/8/2R5/7Q/8 w - - 0 1",
    "moves": [
      "c3a3"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 259,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-98",
    "fen": "8/k7/8/1Q6/7K/1R6/8/8 w - - 0 1",
    "moves": [
      "b5b7"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 261,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-82",
    "fen": "8/8/1K4R1/3R4/8/8/7k/8 w - - 0 1",
    "moves": [
      "d5h5"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 268,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-141",
    "fen": "6k1/8/5QK1/8/8/8/8/5R2 w - - 0 1",
    "moves": [
      "f6d8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 268,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-41",
    "fen": "k7/8/8/8/1R5K/5R2/8/8 w - - 0 1",
    "moves": [
      "f3a3"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 273,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-129",
    "fen": "2K1k3/2R5/8/8/3R4/8/8/8 w - - 0 1",
    "moves": [
      "d4d8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 276,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-28",
    "fen": "3Q4/8/8/8/8/8/k1K5/8 w - - 0 1",
    "moves": [
      "d8a5"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 280,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-67",
    "fen": "1R6/6K1/8/5Q2/8/k7/8/8 w - - 0 1",
    "moves": [
      "f5a5"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 283,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-29",
    "fen": "K1k5/8/8/8/5R2/8/3R4/8 w - - 0 1",
    "moves": [
      "f4c4"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 299,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-100",
    "fen": "8/8/8/3R4/1K4Q1/8/8/7k w - - 0 1",
    "moves": [
      "d5h5"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 307,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-11",
    "fen": "5k2/8/6K1/8/8/8/Q7/8 w - - 0 1",
    "moves": [
      "a2f7"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 309,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-121",
    "fen": "8/8/2K5/k7/2R2R2/8/8/8 w - - 0 1",
    "moves": [
      "c4a4"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 316,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-38",
    "fen": "4Q3/1R6/8/8/2K5/8/8/k7 w - - 0 1",
    "moves": [
      "e8a4"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 324,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-30",
    "fen": "8/8/8/7R/8/5Q2/4K3/6k1 w - - 0 1",
    "moves": [
      "h5h1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 329,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-80",
    "fen": "7k/8/5R1K/8/8/8/8/6R1 w - - 0 1",
    "moves": [
      "f6f8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 331,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-104",
    "fen": "8/7k/8/3K4/6R1/8/3R4/8 w - - 0 1",
    "moves": [
      "d2h2"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 332,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-78",
    "fen": "8/8/8/2KQ4/8/8/R7/5k2 w - - 0 1",
    "moves": [
      "d5h1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 337,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-144",
    "fen": "8/8/k7/8/1R6/4K3/8/6R1 w - - 0 1",
    "moves": [
      "g1a1"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 338,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-64",
    "fen": "7k/2K5/6Q1/8/8/8/B7/8 w - - 0 1",
    "moves": [
      "g6g8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 342,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-84",
    "fen": "4B3/8/8/8/5K2/4Q3/8/3k4 w - - 0 1",
    "moves": [
      "e8a4"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 343,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-47",
    "fen": "8/8/8/7R/8/8/5B2/k1K5 w - - 0 1",
    "moves": [
      "h5a5"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 347,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-123",
    "fen": "8/8/8/6K1/2R5/8/1R6/7k w - - 0 1",
    "moves": [
      "c4c1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 355,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-95",
    "fen": "8/8/8/7K/5N2/8/5Q2/7k w - - 0 1",
    "moves": [
      "f2g2"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 359,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-32",
    "fen": "8/8/8/8/8/2Q1K3/5R2/3k4 w - - 0 1",
    "moves": [
      "c3d2"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 368,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-147",
    "fen": "8/3Q4/5R2/8/8/3K4/8/3k4 w - - 0 1",
    "moves": [
      "f6f1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 377,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-81",
    "fen": "8/R7/8/8/8/8/8/5K1k w - - 0 1",
    "moves": [
      "a7h7"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 378,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-149",
    "fen": "2N2K1k/8/1R6/8/8/8/8/8 w - - 0 1",
    "moves": [
      "b6h6"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 381,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-9",
    "fen": "3K4/8/6R1/8/8/4Q3/8/5k2 w - - 0 1",
    "moves": [
      "g6g1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 382,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-158",
    "fen": "1k6/8/1K5R/8/8/8/8/8 w - - 0 1",
    "moves": [
      "h6h8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 386,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-62",
    "fen": "7k/Q7/6K1/8/8/8/8/8 w - - 0 1",
    "moves": [
      "a7a8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 388,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-130",
    "fen": "8/8/6B1/2K5/8/6Q1/8/7k w - - 0 1",
    "moves": [
      "g6e4"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 391,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-103",
    "fen": "7k/4N3/8/8/8/7K/Q7/8 w - - 0 1",
    "moves": [
      "a2g8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 393,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-12",
    "fen": "k7/8/1K6/8/8/7N/4Q3/8 w - - 0 1",
    "moves": [
      "e2e8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 394,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-137",
    "fen": "6R1/1K6/1Q6/8/8/8/8/k7 w - - 0 1",
    "moves": [
      "g8a8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 396,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-152",
    "fen": "8/8/8/8/8/2R5/8/k1K5 w - - 0 1",
    "moves": [
      "c3a3"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 406,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-92",
    "fen": "3K4/8/8/6QN/8/7k/8/8 w - - 0 1",
    "moves": [
      "g5g3"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 409,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-83",
    "fen": "8/3B4/8/8/8/Q7/2k1K3/8 w - - 0 1",
    "moves": [
      "d7f5"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 421,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-35",
    "fen": "1k6/3Q4/8/6R1/8/K7/8/8 w - - 0 1",
    "moves": [
      "g5g8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 423,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-72",
    "fen": "8/8/8/1K4R1/8/7k/8/6Q1 w - - 0 1",
    "moves": [
      "g5h5"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 424,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-114",
    "fen": "k7/1R6/8/8/8/8/2Q5/K7 w - - 0 1",
    "moves": [
      "c2c8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 426,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-136",
    "fen": "2k5/Q7/8/8/7R/6K1/8/8 w - - 0 1",
    "moves": [
      "h4h8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 456,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-128",
    "fen": "8/8/8/8/4B3/3Q4/8/k5K1 w - - 0 1",
    "moves": [
      "d3b1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 457,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-155",
    "fen": "k7/3Q4/2N5/8/6K1/8/8/8 w - - 0 1",
    "moves": [
      "d7c8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 461,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-110",
    "fen": "7k/8/7K/8/1N6/R7/8/8 w - - 0 1",
    "moves": [
      "a3a8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 462,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-50",
    "fen": "7k/8/6K1/8/8/2R3Q1/8/8 w - - 0 1",
    "moves": [
      "c3c8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 466,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-57",
    "fen": "1Q6/8/k7/8/8/8/3R2K1/8 w - - 0 1",
    "moves": [
      "d2a2"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 471,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-19",
    "fen": "1Q6/8/6R1/5K2/7k/8/8/8 w - - 0 1",
    "moves": [
      "b8h8"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 475,
    "difficulty": "Easy",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-25",
    "fen": "8/8/5K2/8/8/8/4RQ2/1k6 w - - 0 1",
    "moves": [
      "e2e1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 476,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-70",
    "fen": "3Q4/8/K7/8/1R6/8/8/k7 w - - 0 1",
    "moves": [
      "d8a5"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 478,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-65",
    "fen": "K3k3/2R5/8/1R6/8/8/8/8 w - - 0 1",
    "moves": [
      "b5b8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 496,
    "difficulty": "Easy",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-124",
    "fen": "8/7k/8/7N/8/8/1Q6/5K2 w - - 0 1",
    "moves": [
      "b2g7"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 503,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-40",
    "fen": "4k3/8/4K3/8/8/8/7R/8 w - - 0 1",
    "moves": [
      "h2h8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 512,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-52",
    "fen": "7k/8/8/8/8/1Q6/4K3/6R1 w - - 0 1",
    "moves": [
      "b3g8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 516,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-77",
    "fen": "8/8/8/K2R4/8/k7/4Q3/8 w - - 0 1",
    "moves": [
      "d5d3"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 521,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-119",
    "fen": "8/8/k7/2Q5/8/7B/8/2K5 w - - 0 1",
    "moves": [
      "h3c8"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 523,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-139",
    "fen": "8/8/8/1R6/8/5R2/8/5K1k w - - 0 1",
    "moves": [
      "b5h5"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 523,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-24",
    "fen": "8/8/8/5B2/8/K7/4R3/k7 w - - 0 1",
    "moves": [
      "e2e1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 529,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-131",
    "fen": "1Q6/8/8/8/8/3N4/k7/5K2 w - - 0 1",
    "moves": [
      "b8b2"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 534,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-132",
    "fen": "8/8/8/8/Q7/8/8/5K1k w - - 0 1",
    "moves": [
      "a4h4"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 535,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-21",
    "fen": "7k/8/5N2/2Q5/8/2K5/8/8 w - - 0 1",
    "moves": [
      "c5f8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 536,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-148",
    "fen": "6K1/8/8/8/6Q1/2R5/8/7k w - - 0 1",
    "moves": [
      "c3h3"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 538,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-37",
    "fen": "3Q4/6N1/8/8/8/8/2K5/k7 w - - 0 1",
    "moves": [
      "d8a5"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 544,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-109",
    "fen": "k7/2Q5/8/1K6/8/3B4/8/8 w - - 0 1",
    "moves": [
      "d3e4"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 545,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-49",
    "fen": "1R6/8/8/8/k7/2K5/8/4R3 w - - 0 1",
    "moves": [
      "e1a1"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 546,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-59",
    "fen": "7k/4Q3/8/7N/K7/8/8/8 w - - 0 1",
    "moves": [
      "e7g7"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 548,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-93",
    "fen": "k7/3R4/8/5R2/8/6K1/8/8 w - - 0 1",
    "moves": [
      "f5f8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 553,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-79",
    "fen": "5k2/8/5K2/8/7Q/3N4/8/8 w - - 0 1",
    "moves": [
      "h4h8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 556,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "queen-corner",
    "fen": "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
    "moves": [
      "f7e8"
    ],
    "theme": "Corner Mate",
    "category": "Winning Material",
    "goal": "Mate in 1",
    "rating": 560,
    "difficulty": "Beginner",
    "themes": [
      "corner",
      "mate",
      "queen"
    ],
    "explanation": "The queen mates the cornered king with its own king in support."
  },
  {
    "id": "p-back-rank-mate-34",
    "fen": "8/8/8/8/Q7/2K5/8/2k5 w - - 0 1",
    "moves": [
      "a4c2"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 569,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-69",
    "fen": "5k2/8/8/8/K1Q5/8/B7/8 w - - 0 1",
    "moves": [
      "c4f7"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 575,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-151",
    "fen": "7k/R7/8/8/8/8/3R4/1K6 w - - 0 1",
    "moves": [
      "d2d8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 579,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-66",
    "fen": "k7/7Q/8/8/8/8/1R6/2K5 w - - 0 1",
    "moves": [
      "h7b7"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 588,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-71",
    "fen": "8/8/8/6Q1/8/5K2/8/5k2 w - - 0 1",
    "moves": [
      "g5c1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 594,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-48",
    "fen": "k7/4R3/2K5/6R1/8/8/8/8 w - - 0 1",
    "moves": [
      "g5g8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 596,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-99",
    "fen": "8/8/8/2K5/2R5/8/7R/k7 w - - 0 1",
    "moves": [
      "c4c1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 600,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-140",
    "fen": "8/8/8/8/8/4K2Q/2R5/k7 w - - 0 1",
    "moves": [
      "h3h1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 611,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-118",
    "fen": "k1K5/8/8/8/8/1Q6/8/8 w - - 0 1",
    "moves": [
      "b3a4"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 617,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-97",
    "fen": "5k2/2R5/4K3/8/4Q3/8/8/8 w - - 0 1",
    "moves": [
      "e4a8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 618,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-60",
    "fen": "4k3/5R2/3K4/8/8/8/8/6Q1 w - - 0 1",
    "moves": [
      "g1g8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 628,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-20",
    "fen": "6k1/1R6/8/8/8/3Q4/2K5/8 w - - 0 1",
    "moves": [
      "d3d8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 629,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-87",
    "fen": "7k/Q7/1K6/8/4B3/8/8/8 w - - 0 1",
    "moves": [
      "a7h7"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 629,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-55",
    "fen": "8/5K2/7k/8/8/3Q4/7N/8 w - - 0 1",
    "moves": [
      "d3g6"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 631,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-108",
    "fen": "5k2/7R/8/8/6K1/8/8/1R6 w - - 0 1",
    "moves": [
      "b1b8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 633,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-44",
    "fen": "5k2/7K/6B1/8/8/7Q/8/8 w - - 0 1",
    "moves": [
      "h3a3"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 634,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "queen-support",
    "fen": "2k5/8/1QK5/8/8/8/8/8 w - - 0 1",
    "moves": [
      "b6c7"
    ],
    "theme": "Corner Box Mate",
    "category": "Winning Material",
    "goal": "Mate in 1",
    "rating": 640,
    "difficulty": "Beginner",
    "themes": [
      "box",
      "mate",
      "queen"
    ],
    "explanation": "The king supports the queen for a textbook box mate."
  },
  {
    "id": "scholars-mate",
    "fen": "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4",
    "moves": [
      "h5f7"
    ],
    "theme": "Scholar's Mate",
    "category": "Forced Checkmate",
    "goal": "Mate in 1",
    "rating": 640,
    "difficulty": "Beginner",
    "themes": [
      "opening",
      "mate",
      "queen"
    ],
    "explanation": "Qxf7 is the four-move Scholar's Mate — f7 is the weakest square in Black's camp."
  },
  {
    "id": "p-ladder-mate-8",
    "fen": "7k/R7/8/8/8/8/8/1R5K w - - 0 1",
    "moves": [
      "b1b8"
    ],
    "theme": "Ladder Mate",
    "category": "Rook Sacrifice Mate",
    "goal": "Mate in 1",
    "rating": 640,
    "difficulty": "Beginner",
    "themes": [
      "ladder",
      "mate",
      "rook"
    ],
    "explanation": "The two rooks form a ladder; Rb8 is mate."
  },
  {
    "id": "p-mate-in-1-63",
    "fen": "8/k7/8/8/1R6/2K5/8/2R5 w - - 0 1",
    "moves": [
      "c1a1"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 645,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-135",
    "fen": "8/8/8/8/8/2N2R2/2K5/k7 w - - 0 1",
    "moves": [
      "f3f1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 645,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-17",
    "fen": "8/3K4/8/8/5R2/8/R7/7k w - - 0 1",
    "moves": [
      "f4f1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 655,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-105",
    "fen": "k7/2K5/8/8/4R3/8/3Q4/8 w - - 0 1",
    "moves": [
      "e4a4"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 658,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-68",
    "fen": "5K1k/8/4Q3/8/8/8/8/8 w - - 0 1",
    "moves": [
      "e6g8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 673,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-117",
    "fen": "8/8/6Q1/5R2/8/4K3/8/7k w - - 0 1",
    "moves": [
      "f5h5"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 677,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-27",
    "fen": "1K6/8/1R6/8/8/8/2R5/7k w - - 0 1",
    "moves": [
      "b6b1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 688,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-150",
    "fen": "k7/3N4/4Q3/8/8/8/1K6/8 w - - 0 1",
    "moves": [
      "e6a6"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 694,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-queen-endgame-6",
    "fen": "7k/8/6K1/8/8/8/8/3Q4 w - - 0 1",
    "moves": [
      "d1d8"
    ],
    "theme": "Queen Endgame",
    "category": "Endgame Tactics",
    "goal": "Mate in 1",
    "rating": 700,
    "difficulty": "Beginner",
    "themes": [
      "queen",
      "endgame",
      "mate"
    ],
    "explanation": "Qd8 mate — the king on g6 covers the flight squares."
  },
  {
    "id": "p-back-rank-mate-156",
    "fen": "8/8/6R1/8/8/8/1R6/K3k3 w - - 0 1",
    "moves": [
      "g6g1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 702,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-101",
    "fen": "4K3/8/8/8/1R6/8/R7/5k2 w - - 0 1",
    "moves": [
      "b4b1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 713,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-53",
    "fen": "8/8/8/6R1/8/7k/4K3/1Q6 w - - 0 1",
    "moves": [
      "b1h7"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 714,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-153",
    "fen": "6k1/2Q5/5K2/8/5N2/8/8/8 w - - 0 1",
    "moves": [
      "c7g7"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 716,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-76",
    "fen": "8/1Q6/8/8/5K1k/8/8/3B4 w - - 0 1",
    "moves": [
      "b7h7"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 721,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-126",
    "fen": "8/2K5/k7/1N6/8/1Q6/8/8 w - - 0 1",
    "moves": [
      "b3a4"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 727,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-85",
    "fen": "8/8/4K3/8/7k/6R1/2Q5/8 w - - 0 1",
    "moves": [
      "c2h2"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 731,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-94",
    "fen": "4K3/7k/8/6R1/8/8/8/1R6 w - - 0 1",
    "moves": [
      "b1h1"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 731,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-111",
    "fen": "8/8/3K2R1/8/8/8/5Q2/7k w - - 0 1",
    "moves": [
      "g6h6"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 737,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-116",
    "fen": "1k6/8/1K6/4N3/8/8/8/5R2 w - - 0 1",
    "moves": [
      "f1f8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 742,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-13",
    "fen": "8/K7/8/1R6/1R6/8/8/k7 w - - 0 1",
    "moves": [
      "b5a5"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 755,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-15",
    "fen": "8/8/8/1Q6/6B1/6K1/8/6k1 w - - 0 1",
    "moves": [
      "b5b1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 775,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-143",
    "fen": "8/4R3/8/8/1R6/K7/8/k7 w - - 0 1",
    "moves": [
      "e7e1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 776,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "back-rank-double",
    "fen": "6k1/5ppp/8/8/8/8/8/R3R1K1 w - - 0 1",
    "moves": [
      "a1a8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 780,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The rook crashes to the back rank where the king is trapped behind its own pawns."
  },
  {
    "id": "ladder-start",
    "fen": "7k/5ppp/8/8/8/8/8/R6K w - - 0 1",
    "moves": [
      "a1a8"
    ],
    "theme": "Ladder Mate",
    "category": "Rook Sacrifice Mate",
    "goal": "Mate in 2",
    "rating": 780,
    "difficulty": "Beginner",
    "themes": [
      "ladder",
      "mate",
      "rook"
    ],
    "explanation": "Rooks (or rook + support) drive the king up the board rung by rung."
  },
  {
    "id": "p-mate-in-1-145",
    "fen": "8/3K4/8/8/k7/8/N7/1Q6 w - - 0 1",
    "moves": [
      "b1b4"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 791,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-102",
    "fen": "7k/4R3/6K1/8/8/8/8/6R1 w - - 0 1",
    "moves": [
      "e7e8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 792,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-115",
    "fen": "8/B7/8/Q7/8/1K6/8/1k6 w - - 0 1",
    "moves": [
      "a5e1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 794,
    "difficulty": "Beginner",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-122",
    "fen": "8/8/8/8/k7/2R5/1Q6/6K1 w - - 0 1",
    "moves": [
      "c3a3"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 796,
    "difficulty": "Beginner",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-106",
    "fen": "K2k4/R7/8/8/6Q1/8/8/8 w - - 0 1",
    "moves": [
      "g4d7"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 804,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-134",
    "fen": "5K1k/8/4R3/3R4/8/8/8/8 w - - 0 1",
    "moves": [
      "e6h6"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 805,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-14",
    "fen": "8/7R/1R6/8/8/7K/k7/8 w - - 0 1",
    "moves": [
      "h7a7"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 812,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-75",
    "fen": "1K6/8/8/8/3B4/8/5Q2/1k6 w - - 0 1",
    "moves": [
      "f2b2"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 817,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-1",
    "fen": "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    "moves": [
      "e1e8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 820,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The rook lands on the back rank; the g/h pawns leave the king no escape."
  },
  {
    "id": "p-back-rank-mate-33",
    "fen": "7k/2K5/8/8/8/8/4R3/6R1 w - - 0 1",
    "moves": [
      "e2h2"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 826,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-90",
    "fen": "8/8/6N1/8/8/5K2/Q7/4k3 w - - 0 1",
    "moves": [
      "a2e2"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 832,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-120",
    "fen": "8/3B4/8/8/8/4K3/2R5/4k3 w - - 0 1",
    "moves": [
      "c2c1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 834,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-107",
    "fen": "8/8/5Q2/8/2K5/8/7R/2k5 w - - 0 1",
    "moves": [
      "f6f1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 836,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-96",
    "fen": "1k4K1/8/Q7/2N5/8/8/8/8 w - - 0 1",
    "moves": [
      "a6b7"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 837,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-26",
    "fen": "4R3/8/8/8/8/2KB4/8/k7 w - - 0 1",
    "moves": [
      "e8a8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 838,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-133",
    "fen": "8/5R1Q/8/8/8/2K5/8/k7 w - - 0 1",
    "moves": [
      "f7a7"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 838,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-42",
    "fen": "5K2/8/4Q3/8/8/8/4R3/k7 w - - 0 1",
    "moves": [
      "e6a2"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 840,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-10",
    "fen": "2Q5/6N1/8/8/8/8/8/5K1k w - - 0 1",
    "moves": [
      "c8h8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 841,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-138",
    "fen": "7k/1K6/5N2/8/6Q1/8/8/8 w - - 0 1",
    "moves": [
      "g4g8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 841,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-45",
    "fen": "8/8/5R2/2K5/8/8/3R4/k7 w - - 0 1",
    "moves": [
      "f6f1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 848,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-31",
    "fen": "8/8/5K1k/8/8/1R3R2/8/8 w - - 0 1",
    "moves": [
      "f3h3"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 855,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-91",
    "fen": "8/8/8/8/R7/2K5/8/2k5 w - - 0 1",
    "moves": [
      "a4a1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 855,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-56",
    "fen": "6k1/5R2/7K/8/5Q2/8/8/8 w - - 0 1",
    "moves": [
      "f7f8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 857,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-86",
    "fen": "8/2K5/k7/8/8/5Q2/3B4/8 w - - 0 1",
    "moves": [
      "f3b7"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 863,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-22",
    "fen": "8/5Q2/8/5K2/8/8/6R1/k7 w - - 0 1",
    "moves": [
      "f7a2"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 867,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-142",
    "fen": "8/8/6Q1/3R4/k7/2K5/8/8 w - - 0 1",
    "moves": [
      "g6a6"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 872,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-173",
    "fen": "3B4/3k4/8/1K4Q1/8/8/8/8 w - - 0 1",
    "moves": [
      "g5e7",
      "d7c8",
      "e7c7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 872,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-74",
    "fen": "1Q6/6R1/1K6/8/7k/8/8/8 w - - 0 1",
    "moves": [
      "b8h8"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 873,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-112",
    "fen": "8/8/8/1K4R1/8/k7/5R2/8 w - - 0 1",
    "moves": [
      "g5g3"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 873,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-4",
    "fen": "6k1/5ppp/8/8/8/8/5PPP/2Q3K1 w - - 0 1",
    "moves": [
      "c1c8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 880,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The queen infiltrates the undefended back rank."
  },
  {
    "id": "p-mate-in-2-188",
    "fen": "8/2R5/8/3Q4/8/7k/8/6K1 w - - 0 1",
    "moves": [
      "d5g2",
      "h3h4",
      "c7h7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 887,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-18",
    "fen": "4k3/8/5K2/3R4/1R6/8/8/8 w - - 0 1",
    "moves": [
      "b4b8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 893,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-2-196",
    "fen": "8/8/KB6/8/4Q3/8/8/5k2 w - - 0 1",
    "moves": [
      "e4f3",
      "f1e1",
      "b6a5"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 893,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-193",
    "fen": "2K5/4Q3/1k6/2R5/8/8/8/8 w - - 0 1",
    "moves": [
      "e7d6",
      "b6a7",
      "c5a5"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 895,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-89",
    "fen": "8/3K4/7k/8/8/3R4/8/6Q1 w - - 0 1",
    "moves": [
      "d3h3"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 897,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-154",
    "fen": "8/8/8/4R3/8/8/1N6/5K1k w - - 0 1",
    "moves": [
      "e5h5"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 899,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-146",
    "fen": "8/8/B7/8/5K1k/8/Q7/8 w - - 0 1",
    "moves": [
      "a2h2"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 903,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-36",
    "fen": "K7/8/8/8/8/2R5/1R6/6k1 w - - 0 1",
    "moves": [
      "c3c1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 906,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-2-203",
    "fen": "8/8/8/6Q1/6N1/8/2K5/4k3 w - - 0 1",
    "moves": [
      "g5h4",
      "e1e2",
      "h4f2"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 911,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-205",
    "fen": "8/3R4/8/3R4/8/2K5/k7/8 w - - 0 1",
    "moves": [
      "d7a7",
      "a2b1",
      "d5d1"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 916,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-46",
    "fen": "7k/4R3/8/1R5K/8/8/8/8 w - - 0 1",
    "moves": [
      "b5b8"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 920,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-23",
    "fen": "8/8/8/2R5/8/8/8/5K1k w - - 0 1",
    "moves": [
      "c5h5"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 921,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-54",
    "fen": "8/8/8/8/8/R7/5K2/7k w - - 0 1",
    "moves": [
      "a3h3"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 926,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-58",
    "fen": "1Q3K1k/8/8/8/8/8/8/8 w - - 0 1",
    "moves": [
      "b8h2"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 926,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-61",
    "fen": "8/8/8/8/5Q2/8/6K1/2B1k3 w - - 0 1",
    "moves": [
      "f4f1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 928,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-125",
    "fen": "k4K2/8/8/2R5/1Q6/8/8/8 w - - 0 1",
    "moves": [
      "c5a5"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 932,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-2-174",
    "fen": "8/5R2/8/4K3/1R6/8/8/6k1 w - - 0 1",
    "moves": [
      "b4g4",
      "g1h2",
      "f7h7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 933,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-1-43",
    "fen": "8/k5K1/8/4R3/8/8/1R6/8 w - - 0 1",
    "moves": [
      "e5a5"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 934,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-back-rank-mate-16",
    "fen": "8/K7/8/8/8/1R6/7R/3k4 w - - 0 1",
    "moves": [
      "b3b1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 941,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-73",
    "fen": "k7/8/1R6/8/8/8/1R6/K7 w - - 0 1",
    "moves": [
      "b6a6"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 945,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-back-rank-mate-127",
    "fen": "8/8/8/8/8/1R6/2Q5/5k1K w - - 0 1",
    "moves": [
      "b3b1"
    ],
    "theme": "Back Rank Mate",
    "category": "Back Rank Mate",
    "goal": "Mate in 1",
    "rating": 946,
    "difficulty": "Intermediate",
    "themes": [
      "back-rank",
      "mate",
      "rook"
    ],
    "explanation": "The back rank is fatally weak — the major piece invades where the king cannot flee."
  },
  {
    "id": "p-mate-in-1-157",
    "fen": "4B3/8/8/k7/8/7K/1Q6/8 w - - 0 1",
    "moves": [
      "b2b5"
    ],
    "theme": "Mate in 1",
    "category": "Mate in 1",
    "goal": "Mate in 1",
    "rating": 946,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-1"
    ],
    "explanation": "Forced checkmate in 1: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-172",
    "fen": "1k6/8/5K2/8/2Q5/8/8/6R1 w - - 0 1",
    "moves": [
      "g1b1",
      "b8a7",
      "c4a2"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 959,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-160",
    "fen": "8/2Q4K/8/8/8/5B2/8/k7 w - - 0 1",
    "moves": [
      "c7c1",
      "a1a2",
      "f3d5"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 960,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-166",
    "fen": "6R1/8/8/8/8/4R2K/k7/8 w - - 0 1",
    "moves": [
      "g8g2",
      "a2b1",
      "e3e1"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 965,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-206",
    "fen": "8/k7/2Q5/8/3R1K2/8/8/8 w - - 0 1",
    "moves": [
      "d4d7",
      "a7b8",
      "c6b7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 978,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-177",
    "fen": "8/8/8/7K/3Q4/2R5/8/k7 w - - 0 1",
    "moves": [
      "c3c2",
      "a1b1",
      "d4d1"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1000,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-211",
    "fen": "1k6/8/K7/8/8/2B5/4Q3/8 w - - 0 1",
    "moves": [
      "e2e8",
      "b8c7",
      "c3e5"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1001,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-195",
    "fen": "8/5R2/5Q2/8/8/8/1K6/6k1 w - - 0 1",
    "moves": [
      "f7g7",
      "g1h2",
      "f6h6"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1004,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-214",
    "fen": "8/8/8/8/2B5/8/Q7/1K5k w - - 0 1",
    "moves": [
      "c4d5",
      "h1g1",
      "a2g2"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1024,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-162",
    "fen": "8/8/8/5K1B/8/4Q3/8/k7 w - - 0 1",
    "moves": [
      "e3c1",
      "a1a2",
      "h5f7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1030,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-209",
    "fen": "4Q3/8/8/8/8/K7/4R3/7k w - - 0 1",
    "moves": [
      "e8h8",
      "h1g1",
      "h8a1"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1033,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-190",
    "fen": "8/8/7B/5K2/8/6Q1/8/7k w - - 0 1",
    "moves": [
      "g3h3",
      "h1g1",
      "h6e3"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1034,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-202",
    "fen": "4k3/8/8/6B1/8/8/Q1K5/8 w - - 0 1",
    "moves": [
      "a2e6",
      "e8f8",
      "g5h6"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1038,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-arabian-mate-3",
    "fen": "7k/8/5N2/8/8/8/8/K5R1 w - - 0 1",
    "moves": [
      "g1g8"
    ],
    "theme": "Arabian Mate",
    "category": "Arabian Mate",
    "goal": "Mate in 1",
    "rating": 1040,
    "difficulty": "Intermediate",
    "themes": [
      "arabian",
      "mate",
      "corner"
    ],
    "explanation": "Rook and knight cooperate in the corner for the Arabian mate."
  },
  {
    "id": "p-mate-in-2-189",
    "fen": "3B4/1Q6/8/7k/4K3/8/8/8 w - - 0 1",
    "moves": [
      "b7h7",
      "h5g4",
      "h7h4"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1046,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-163",
    "fen": "1B5k/Q7/8/8/5K2/8/8/8 w - - 0 1",
    "moves": [
      "b8e5",
      "h8g8",
      "a7g7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1086,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-212",
    "fen": "8/8/1K2B3/8/8/8/5Q2/3k4 w - - 0 1",
    "moves": [
      "e6b3",
      "d1c1",
      "f2c2"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1114,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "arabian-classic",
    "fen": "7k/8/5N1K/8/8/8/8/7R w - - 0 1",
    "moves": [
      "h6g6"
    ],
    "theme": "Arabian Mate",
    "category": "Arabian Mate",
    "goal": "Mate in 1",
    "rating": 1120,
    "difficulty": "Intermediate",
    "themes": [
      "arabian",
      "mate",
      "corner"
    ],
    "explanation": "Knight and rook combine in the corner — the classic Arabian mate."
  },
  {
    "id": "p-mate-in-2-169",
    "fen": "k7/8/2K5/8/8/4R3/8/2R5 w - - 0 1",
    "moves": [
      "e3e8",
      "a8a7",
      "c1a1"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1130,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-171",
    "fen": "k7/8/8/8/8/B7/K7/2Q5 w - - 0 1",
    "moves": [
      "c1c8",
      "a8a7",
      "a3c5"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1132,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-184",
    "fen": "8/2Q5/8/8/B6k/8/8/7K w - - 0 1",
    "moves": [
      "c7f4",
      "h4h5",
      "a4e8"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1133,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-smothered-mate-2",
    "fen": "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1",
    "moves": [
      "h6f7"
    ],
    "theme": "Smothered Mate",
    "category": "Smothered Mate",
    "goal": "Mate in 1",
    "rating": 1150,
    "difficulty": "Intermediate",
    "themes": [
      "smothered",
      "mate",
      "knight"
    ],
    "explanation": "Nf7 is smothered mate — the king is hemmed in by its own rook and pawns."
  },
  {
    "id": "p-mate-in-2-183",
    "fen": "3k4/8/5K2/8/8/2Q3B1/8/8 w - - 0 1",
    "moves": [
      "c3c7",
      "d8e8",
      "c7c8"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1152,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-185",
    "fen": "k2K4/5Q2/5R2/8/8/8/8/8 w - - 0 1",
    "moves": [
      "f6a6",
      "a8b8",
      "f7b3"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1159,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-194",
    "fen": "3R4/8/6K1/8/8/1R6/7k/8 w - - 0 1",
    "moves": [
      "d8d2",
      "h2h1",
      "b3b1"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1171,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-201",
    "fen": "7k/8/8/1B6/1K6/8/8/2Q5 w - - 0 1",
    "moves": [
      "c1h6",
      "h8g8",
      "b5c4"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1189,
    "difficulty": "Intermediate",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-210",
    "fen": "8/8/5K2/8/7k/2R5/R7/8 w - - 0 1",
    "moves": [
      "a2a4",
      "h4h5",
      "c3h3"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1209,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-159",
    "fen": "B6k/8/5K2/8/8/2Q5/8/8 w - - 0 1",
    "moves": [
      "f6f7",
      "h8h7",
      "c3g7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1253,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-191",
    "fen": "8/8/8/3B4/7k/5Q2/7K/8 w - - 0 1",
    "moves": [
      "f3f4",
      "h4h5",
      "d5f7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1255,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-175",
    "fen": "2K3k1/8/8/8/7R/8/5Q2/8 w - - 0 1",
    "moves": [
      "h4g4",
      "g8h8",
      "f2h4"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1260,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "epaulette",
    "fen": "3rkr2/8/4K3/8/7Q/8/8/8 w - - 0 1",
    "moves": [
      "h4e7"
    ],
    "theme": "Epaulette Mate",
    "category": "Forced Checkmate",
    "goal": "Mate in 1",
    "rating": 1280,
    "difficulty": "Advanced",
    "themes": [
      "epaulette",
      "mate",
      "queen"
    ],
    "explanation": "The king's own rooks (epaulettes) rob it of escape squares; the queen mates."
  },
  {
    "id": "p-mate-in-2-181",
    "fen": "8/8/8/8/B7/5K2/7k/4Q3 w - - 0 1",
    "moves": [
      "e1d2",
      "h2h3",
      "d2h6"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1294,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-180",
    "fen": "8/8/8/8/2Q5/3K4/8/3Nk3 w - - 0 1",
    "moves": [
      "c4e4",
      "e1f1",
      "e4h1"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1304,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-213",
    "fen": "8/5QR1/6K1/8/6k1/8/8/8 w - - 0 1",
    "moves": [
      "g6h6",
      "g4h4",
      "f7h5"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1318,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-167",
    "fen": "3K4/8/8/8/8/1QR5/7k/8 w - - 0 1",
    "moves": [
      "b3b2",
      "h2h1",
      "c3c1"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1329,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-179",
    "fen": "8/7k/2R5/8/R7/8/8/4K3 w - - 0 1",
    "moves": [
      "a4a7",
      "h7g8",
      "c6c8"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1342,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-204",
    "fen": "8/3Q4/8/8/8/4K3/3R4/7k w - - 0 1",
    "moves": [
      "d7h7",
      "h1g1",
      "h7b1"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1344,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-197",
    "fen": "k7/8/5B2/8/8/1K6/2Q5/8 w - - 0 1",
    "moves": [
      "c2c8",
      "a8a7",
      "f6d4"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1347,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-178",
    "fen": "8/8/8/2N5/6K1/3Q4/k7/8 w - - 0 1",
    "moves": [
      "d3c2",
      "a2a3",
      "c2b3"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1417,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-215",
    "fen": "2R5/3K4/6k1/8/8/7Q/8/8 w - - 0 1",
    "moves": [
      "c8g8",
      "g6f7",
      "h3e6"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1418,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-161",
    "fen": "7k/8/4N3/8/8/K7/Q7/8 w - - 0 1",
    "moves": [
      "a2b2",
      "h8h7",
      "b2g7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1421,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-198",
    "fen": "7k/8/Q6B/8/8/8/6K1/8 w - - 0 1",
    "moves": [
      "a6f6",
      "h8h7",
      "f6g7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1424,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-165",
    "fen": "8/8/8/2R5/8/2KR4/8/k7 w - - 0 1",
    "moves": [
      "c5a5",
      "a1b1",
      "d3d1"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1461,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-192",
    "fen": "7B/8/4Q3/8/8/8/8/3K3k w - - 0 1",
    "moves": [
      "e6h3",
      "h1g1",
      "h8d4"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1475,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-l-gal-s-mate-7",
    "fen": "rn1qkbnr/ppp2ppp/3p4/4N3/2B1P3/2N5/PPPP1PPP/R1BbK2R w KQkq - 0 6",
    "moves": [
      "c4f7",
      "e8e7",
      "c3d5"
    ],
    "theme": "Légal's Mate",
    "category": "Knight Sacrifice Mate",
    "goal": "Mate in 2",
    "rating": 1480,
    "difficulty": "Advanced",
    "themes": [
      "opening",
      "sacrifice",
      "mate"
    ],
    "explanation": "The famous Légal's Mate: Bxf7+ Ke7 Nd5#."
  },
  {
    "id": "p-mate-in-2-187",
    "fen": "8/8/2KR4/8/k7/5R2/8/8 w - - 0 1",
    "moves": [
      "d6d4",
      "a4a5",
      "f3a3"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1494,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-168",
    "fen": "8/8/8/8/8/3QB3/2K5/7k w - - 0 1",
    "moves": [
      "d3f1",
      "h1h2",
      "e3f4"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1521,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-208",
    "fen": "8/8/8/3N4/4Q3/8/1K6/3k4 w - - 0 1",
    "moves": [
      "d5c3",
      "d1d2",
      "e4e2"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1526,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-200",
    "fen": "k7/8/8/N7/K7/8/8/5Q2 w - - 0 1",
    "moves": [
      "f1a6",
      "a8b8",
      "a6b7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1545,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "smothered-knight",
    "fen": "6rk/6pp/7N/8/8/8/6PP/6K1 w - - 0 1",
    "moves": [
      "h6f7"
    ],
    "theme": "Smothered Mate",
    "category": "Smothered Mate",
    "goal": "Mate in 2",
    "rating": 1550,
    "difficulty": "Advanced",
    "themes": [
      "smothered",
      "mate",
      "knight"
    ],
    "explanation": "The knight forces the king into the corner; boxed in by its own pieces, it is smothered."
  },
  {
    "id": "p-mate-in-2-170",
    "fen": "2Q5/6K1/8/8/8/3B4/8/k7 w - - 0 1",
    "moves": [
      "c8c1",
      "a1a2",
      "d3c4"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1553,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-164",
    "fen": "1k6/4Q3/8/3N4/K7/8/8/8 w - - 0 1",
    "moves": [
      "e7c7",
      "b8a8",
      "d5b6"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1578,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-199",
    "fen": "8/8/4R3/8/2Q5/8/4K3/6k1 w - - 0 1",
    "moves": [
      "e6g6",
      "g1h2",
      "c4h4"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1578,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-182",
    "fen": "7k/2Q5/3B4/7K/8/8/8/8 w - - 0 1",
    "moves": [
      "d6e5",
      "h8g8",
      "c7g7"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1593,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-186",
    "fen": "1k2K3/8/R7/5Q2/8/8/8/8 w - - 0 1",
    "moves": [
      "a6b6",
      "b8c7",
      "f5c5"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1602,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-2-207",
    "fen": "6K1/k7/3R4/8/8/5R2/8/8 w - - 0 1",
    "moves": [
      "f3f7",
      "a7a8",
      "d6d8"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1608,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-smothered-mate-5",
    "fen": "5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1",
    "moves": [
      "c4g8",
      "f8g8",
      "h6f7"
    ],
    "theme": "Smothered Mate",
    "category": "Queen Sacrifice Mate",
    "goal": "Mate in 2",
    "rating": 1620,
    "difficulty": "Advanced",
    "themes": [
      "smothered",
      "mate",
      "knight"
    ],
    "explanation": "Qg8+! forces Rxg8, then Nf7 is the classic smothered mate."
  },
  {
    "id": "p-mate-in-2-176",
    "fen": "4R3/8/8/8/2R5/2K5/8/k7 w - - 0 1",
    "moves": [
      "e8e1",
      "a1a2",
      "c4a4"
    ],
    "theme": "Mate in 2",
    "category": "Mate in 2",
    "goal": "Mate in 2",
    "rating": 1640,
    "difficulty": "Advanced",
    "themes": [
      "mate",
      "mate-in-2"
    ],
    "explanation": "Forced checkmate in 2: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-3-219",
    "fen": "8/8/7k/R2R4/8/6K1/8/8 w - - 0 1",
    "moves": [
      "a5a6",
      "h6g7",
      "d5d7",
      "g7f8",
      "a6a8"
    ],
    "theme": "Mate in 3",
    "category": "Mate in 3",
    "goal": "Mate in 3",
    "rating": 2051,
    "difficulty": "Expert",
    "themes": [
      "mate",
      "mate-in-3"
    ],
    "explanation": "Forced checkmate in 3: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-3-222",
    "fen": "4Q3/8/8/7K/7N/7k/8/8 w - - 0 1",
    "moves": [
      "e8e3",
      "h3h2",
      "e3f2",
      "h2h3",
      "f2g2"
    ],
    "theme": "Mate in 3",
    "category": "Mate in 3",
    "goal": "Mate in 3",
    "rating": 2055,
    "difficulty": "Expert",
    "themes": [
      "mate",
      "mate-in-3"
    ],
    "explanation": "Forced checkmate in 3: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-3-217",
    "fen": "8/5B2/5K2/8/8/3Q4/8/7k w - - 0 1",
    "moves": [
      "d3f3",
      "h1h2",
      "f3f2",
      "h2h3",
      "f7e6"
    ],
    "theme": "Mate in 3",
    "category": "Mate in 3",
    "goal": "Mate in 3",
    "rating": 2065,
    "difficulty": "Expert",
    "themes": [
      "mate",
      "mate-in-3"
    ],
    "explanation": "Forced checkmate in 3: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-3-221",
    "fen": "8/8/6Q1/8/7K/1R6/8/3k4 w - - 0 1",
    "moves": [
      "g6b1",
      "d1d2",
      "b1a2",
      "d2e1",
      "b3b1"
    ],
    "theme": "Mate in 3",
    "category": "Mate in 3",
    "goal": "Mate in 3",
    "rating": 2135,
    "difficulty": "Expert",
    "themes": [
      "mate",
      "mate-in-3"
    ],
    "explanation": "Forced checkmate in 3: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-3-220",
    "fen": "6Q1/1k6/4K3/8/8/8/8/2R5 w - - 0 1",
    "moves": [
      "c1b1",
      "b7c7",
      "g8h7",
      "c7c8",
      "h7d7"
    ],
    "theme": "Mate in 3",
    "category": "Mate in 3",
    "goal": "Mate in 3",
    "rating": 2191,
    "difficulty": "Expert",
    "themes": [
      "mate",
      "mate-in-3"
    ],
    "explanation": "Forced checkmate in 3: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-3-223",
    "fen": "8/1K2R3/8/8/8/5Q2/8/2k5 w - - 0 1",
    "moves": [
      "e7e1",
      "c1b2",
      "e1e2",
      "b2c1",
      "f3h1"
    ],
    "theme": "Mate in 3",
    "category": "Mate in 3",
    "goal": "Mate in 3",
    "rating": 2224,
    "difficulty": "Expert",
    "themes": [
      "mate",
      "mate-in-3"
    ],
    "explanation": "Forced checkmate in 3: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-3-224",
    "fen": "8/8/2Q5/R7/5K2/8/8/3k4 w - - 0 1",
    "moves": [
      "a5d5",
      "d1e2",
      "c6c2",
      "e2f1",
      "d5d1"
    ],
    "theme": "Mate in 3",
    "category": "Mate in 3",
    "goal": "Mate in 3",
    "rating": 2271,
    "difficulty": "Expert",
    "themes": [
      "mate",
      "mate-in-3"
    ],
    "explanation": "Forced checkmate in 3: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-3-218",
    "fen": "8/8/k7/5B2/8/2Q5/3K4/8 w - - 0 1",
    "moves": [
      "c3c6",
      "a6a7",
      "c6c7",
      "a7a8",
      "f5e4"
    ],
    "theme": "Mate in 3",
    "category": "Mate in 3",
    "goal": "Mate in 3",
    "rating": 2514,
    "difficulty": "Master",
    "themes": [
      "mate",
      "mate-in-3"
    ],
    "explanation": "Forced checkmate in 3: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  },
  {
    "id": "p-mate-in-3-216",
    "fen": "8/8/8/2K2Q2/4R3/8/8/7k w - - 0 1",
    "moves": [
      "f5h3",
      "h1g1",
      "h3g3",
      "g1h1",
      "e4h4"
    ],
    "theme": "Mate in 3",
    "category": "Mate in 3",
    "goal": "Mate in 3",
    "rating": 2691,
    "difficulty": "Master",
    "themes": [
      "mate",
      "mate-in-3"
    ],
    "explanation": "Forced checkmate in 3: every defensive try is met by the same crushing idea. Calculate the forcing line to the end."
  }
];

export const PUZZLE_CATEGORIES = Array.from(new Set(PUZZLES.map((p) => p.category))).sort();
