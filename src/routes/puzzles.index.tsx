import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, GoldButton } from "@/components/site/Primitives";
import { PuzzleTrainer } from "@/components/site/PuzzleTrainer";
import { Flame } from "lucide-react";
import { seo, breadcrumbLd, collectionPageLd } from "@/lib/seo";

export const Route = createFileRoute("/puzzles/")({
  head: () =>
    seo({
      title: "Chess Puzzles — Free Online Chess Tactics Training | ChessOx",
      description:
        "Solve free online chess puzzles on ChessOx. Verified tactics positions with hints, solutions, streaks and daily goals — train forks, pins, skewers and mating patterns.",
      keywords: [
        "chess puzzles",
        "online chess puzzles",
        "free chess puzzles",
        "daily chess puzzle",
        "chess tactics puzzles",
        "chess tactics training",
      ],
      path: "/puzzles",
      jsonLd: [
        collectionPageLd({
          name: "Chess Puzzles — ChessOx",
          description:
            "A library of verified chess puzzles on ChessOx covering tactical motifs such as forks, pins, skewers, discovered attacks and forced mates, with hints and full solutions.",
          path: "/puzzles",
          about: ["Chess puzzles", "Chess tactics", "Chess tactics training"],
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Chess Puzzles", path: "/puzzles" },
        ]),
      ],
    }),
  component: Puzzles,
});

function Puzzles() {
  return (
    <PageShell
      eyebrow="The Riddle Hall"
      title="Puzzles"
      subtitle="Sharpen your blade — one square at a time."
    >
      <div className="mb-4 flex justify-end">
        <Link to="/puzzles/rush">
          <GoldButton>
            <Flame className="h-4 w-4" /> Puzzle Rush
          </GoldButton>
        </Link>
      </div>
      <PuzzleTrainer />
    </PageShell>
  );
}
