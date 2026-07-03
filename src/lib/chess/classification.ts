// =====================================================================
// Move classification vocabulary (single source of truth)
// ---------------------------------------------------------------------
// Shared by the analysis worker (which assigns a class to each move) and
// every UI that renders move quality (AnalysisBoard, game review page).
// Mirrors the CHECK constraint on game_moves.classification.
// =====================================================================

export type Classification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "miss";

/** Display order (best → worst) for legends and per-class count summaries. */
export const CLASS_ORDER: Classification[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "blunder",
  "miss",
];

export const CLASS_LABEL: Record<Classification, string> = {
  brilliant: "Brilliant",
  great: "Great",
  best: "Best",
  excellent: "Excellent",
  good: "Good",
  book: "Book",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
  miss: "Miss",
};

export const CLASS_ICON: Record<Classification, string> = {
  brilliant: "!!",
  great: "!",
  best: "★",
  excellent: "✓",
  good: "·",
  book: "B",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
  miss: "✗",
};

export const CLASS_COLOR: Record<Classification, string> = {
  brilliant: "text-cyan-400",
  great: "text-blue-400",
  best: "text-emerald-400",
  excellent: "text-green-400",
  good: "text-lime-400",
  book: "text-amber-400",
  inaccuracy: "text-yellow-400",
  mistake: "text-orange-400",
  blunder: "text-red-500",
  miss: "text-rose-400",
};

/** Background tint used for filled badges (e.g. on the board / chips). */
export const CLASS_BG: Record<Classification, string> = {
  brilliant: "bg-cyan-400/15",
  great: "bg-blue-400/15",
  best: "bg-emerald-400/15",
  excellent: "bg-green-400/15",
  good: "bg-lime-400/15",
  book: "bg-amber-400/15",
  inaccuracy: "bg-yellow-400/15",
  mistake: "bg-orange-400/15",
  blunder: "bg-red-500/15",
  miss: "bg-rose-400/15",
};

/** Valid classification strings (for narrowing untyped DB values). */
export function isClassification(v: unknown): v is Classification {
  return typeof v === "string" && v in CLASS_LABEL;
}
