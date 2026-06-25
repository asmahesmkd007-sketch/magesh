import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, GoldButton } from "@/components/site/Primitives";
import { PuzzleTrainer } from "@/components/site/PuzzleTrainer";
import { Flame } from "lucide-react";

export const Route = createFileRoute("/puzzles")({
  head: () => ({
    meta: [
      { title: "Puzzles — ChessOx" },
      { name: "description", content: "Solve verified tactical puzzles with hints, solutions, streaks, and daily goals." },
    ],
  }),
  component: Puzzles,
});

function Puzzles() {
  return (
    <PageShell eyebrow="The Riddle Hall" title="Puzzles" subtitle="Sharpen your blade — one square at a time.">
      <div className="mb-4 flex justify-end">
        <Link to="/puzzles/rush"><GoldButton><Flame className="h-4 w-4" /> Puzzle Rush</GoldButton></Link>
      </div>
      <PuzzleTrainer />
    </PageShell>
  );
}
