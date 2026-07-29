// =====================================================================
// Shared types for the engine review pipeline
// =====================================================================
import type { Classification } from "@/lib/chess/classification";

/** A single evaluation, always from White's perspective. */
export type EvalPoint = {
  /** Folded centipawns (mate = ±100000 − distance). */
  cpWhite: number;
  /** Moves to mate; positive = White delivers, negative = Black does. */
  mateIn: number | null;
  /** Search depth that produced this evaluation. */
  depth: number;
};

/** One fully analysed move of the reviewed game. */
export type AnalyzedMove = {
  ply: number;
  san: string;
  uci: string;
  color: "w" | "b";
  fenBefore: string;
  fenAfter: string;
  /** Best-play evaluation of the position before the move. */
  evalBefore: EvalPoint;
  /** Evaluation of the position after the move was played. */
  evalAfter: EvalPoint;
  /** Engine's preferred move from the position before (UCI + SAN). */
  bestUci: string | null;
  bestSan: string | null;
  /** Top engine line from the position before, in SAN. */
  bestLineSan: string[];
  /** Second-best line's eval (White perspective), for only-move detection. */
  secondCpWhite: number | null;
  /** Centipawn loss from the mover's perspective (≥ 0). */
  cpl: number;
  /** Move accuracy 0–100. */
  accuracy: number;
  classification: Classification;
  legalMoveCount: number;
  isBook: boolean;
  sacrifice: boolean;
};

export type ReviewProgress = {
  /** Positions evaluated so far (including the root). */
  done: number;
  total: number;
  /** The move most recently classified, if any. */
  lastMove: AnalyzedMove | null;
};

export type GamePhase = "opening" | "middlegame" | "endgame";

export type PhaseSummary = {
  phase: GamePhase;
  /** First and last ply of the phase (inclusive); null when absent. */
  fromPly: number;
  toPly: number;
  accuracyWhite: number | null;
  accuracyBlack: number | null;
  comment: string;
};

export type CriticalMoment = {
  ply: number;
  san: string;
  color: "w" | "b";
  /** Win-probability swing (percentage points, absolute). */
  swing: number;
  classification: Classification;
  kind: "turning-point" | "blunder" | "missed-chance" | "brilliancy";
  description: string;
};

/** The complete result of a game review. */
export type GameReview = {
  moves: AnalyzedMove[];
  accuracyWhite: number | null;
  accuracyBlack: number | null;
  acplWhite: number | null;
  acplBlack: number | null;
  classCountsWhite: Partial<Record<Classification, number>>;
  classCountsBlack: Partial<Record<Classification, number>>;
  phases: PhaseSummary[];
  criticalMoments: CriticalMoment[];
  /** Win probability for White (0–100) per position, index 0 = start. */
  winProbabilities: number[];
  /** White-perspective eval per position (folded cp), index 0 = start. */
  evals: number[];
  /** Material balance (White − Black, in pawns) per position. */
  materialBalance: number[];
  openingName: string | null;
  openingEco: string | null;
  /** Depth the review ran at. */
  depth: number;
};
