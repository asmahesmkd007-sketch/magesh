// =====================================================================
// Move classification vocabulary (single source of truth)
// ---------------------------------------------------------------------
// Shared by the engine review pipeline (which assigns a class to each
// move) and every UI that renders move quality (analysis room, game
// review page). Mirrors the CHECK constraint on game_moves.classification
// (see schema.sql — ANALYSIS MODULE section keeps the DB list in sync).
// =====================================================================

export type Classification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "forced"
  | "interesting"
  | "dubious"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "miss"
  | "missedWin"
  | "missedDraw"
  | "missedTactic"
  | "missedMate";

/** Display order (best → worst) for legends and per-class count summaries. */
export const CLASS_ORDER: Classification[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "forced",
  "interesting",
  "dubious",
  "inaccuracy",
  "mistake",
  "miss",
  "missedTactic",
  "missedDraw",
  "missedWin",
  "missedMate",
  "blunder",
];

export const CLASS_LABEL: Record<Classification, string> = {
  brilliant: "Brilliant",
  great: "Great",
  best: "Best",
  excellent: "Excellent",
  good: "Good",
  book: "Book",
  forced: "Forced",
  interesting: "Interesting",
  dubious: "Dubious",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
  miss: "Miss",
  missedWin: "Missed Win",
  missedDraw: "Missed Draw",
  missedTactic: "Missed Tactic",
  missedMate: "Missed Mate",
};

export const CLASS_ICON: Record<Classification, string> = {
  brilliant: "!!",
  great: "!",
  best: "★",
  excellent: "✓",
  good: "·",
  book: "B",
  forced: "□",
  interesting: "!?",
  dubious: "?!",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
  miss: "✗",
  missedWin: "✗",
  missedDraw: "✗",
  missedTactic: "✗",
  missedMate: "#✗",
};

export const CLASS_COLOR: Record<Classification, string> = {
  brilliant: "text-cyan-400",
  great: "text-blue-400",
  best: "text-emerald-400",
  excellent: "text-green-400",
  good: "text-lime-400",
  book: "text-amber-400",
  forced: "text-stone-400",
  interesting: "text-violet-400",
  dubious: "text-fuchsia-400",
  inaccuracy: "text-yellow-400",
  mistake: "text-orange-400",
  blunder: "text-red-500",
  miss: "text-rose-400",
  missedWin: "text-rose-400",
  missedDraw: "text-rose-300",
  missedTactic: "text-rose-400",
  missedMate: "text-red-400",
};

/** Background tint used for filled badges (e.g. on the board / chips). */
export const CLASS_BG: Record<Classification, string> = {
  brilliant: "bg-cyan-400/15",
  great: "bg-blue-400/15",
  best: "bg-emerald-400/15",
  excellent: "bg-green-400/15",
  good: "bg-lime-400/15",
  book: "bg-amber-400/15",
  forced: "bg-stone-400/15",
  interesting: "bg-violet-400/15",
  dubious: "bg-fuchsia-400/15",
  inaccuracy: "bg-yellow-400/15",
  mistake: "bg-orange-400/15",
  blunder: "bg-red-500/15",
  miss: "bg-rose-400/15",
  missedWin: "bg-rose-400/15",
  missedDraw: "bg-rose-300/15",
  missedTactic: "bg-rose-400/15",
  missedMate: "bg-red-400/15",
};

/** One-line explanations shown in move detail cards and tooltips. */
export const CLASS_EXPLANATION: Record<Classification, string> = {
  brilliant: "A sound sacrifice or stunning resource the engine approves of.",
  great: "The only move that keeps the position — everything else fails.",
  best: "The engine's first choice.",
  excellent: "Practically as strong as the best move.",
  good: "A solid move that keeps the position healthy.",
  book: "Established opening theory.",
  forced: "The only legal move.",
  interesting: "A speculative try — objectively imperfect but full of ideas.",
  dubious: "A risky choice that concedes part of the advantage.",
  inaccuracy: "A small slip — the position worsens noticeably.",
  mistake: "A serious error that changes the assessment.",
  blunder: "A grave error that throws away the game or major material.",
  miss: "A clear chance went unplayed.",
  missedWin: "A winning position slipped away.",
  missedDraw: "A drawing resource was available but not taken.",
  missedTactic: "A tactical blow was available and missed.",
  missedMate: "A forced checkmate was on the board and not played.",
};

/** Valid classification strings (for narrowing untyped DB values). */
export function isClassification(v: unknown): v is Classification {
  return typeof v === "string" && v in CLASS_LABEL;
}
