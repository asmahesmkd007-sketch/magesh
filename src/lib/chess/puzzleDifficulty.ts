// Difficulty banding, split out of puzzles.ts.
//
// puzzles.ts also holds the PUZZLES dataset — ~288 KB of source that
// bundles to a 229 KB chunk. Importing `difficultyOf` from there pulled
// that whole chunk onto the /puzzles route (PuzzleTrainer needs the
// function, not the data), so the tier lookup lives here on its own.
// puzzles.ts re-exports both names, so callers that legitimately want the
// dataset can keep importing everything from one place.
export type PuzzleDifficulty =
  | "Beginner"
  | "Easy"
  | "Intermediate"
  | "Advanced"
  | "Expert"
  | "Master"
  | "Grandmaster";

export const DIFFICULTY_BANDS: { label: PuzzleDifficulty; min: number; max: number }[] = [
  { label: "Beginner", min: 0, max: 500 },
  { label: "Easy", min: 500, max: 800 },
  { label: "Intermediate", min: 800, max: 1200 },
  { label: "Advanced", min: 1200, max: 1800 },
  { label: "Expert", min: 1800, max: 2200 },
  { label: "Master", min: 2200, max: 2600 },
  { label: "Grandmaster", min: 2600, max: 9999 },
];

export function difficultyOf(rating: number): PuzzleDifficulty {
  return DIFFICULTY_BANDS.find((b) => rating >= b.min && rating < b.max)?.label ?? "Master";
}
