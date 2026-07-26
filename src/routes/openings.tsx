import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle } from "@/components/site/Primitives";
import { Chessboard } from "@/components/site/Chessboard";
import { seo, breadcrumbLd, collectionPageLd } from "@/lib/seo";

export const Route = createFileRoute("/openings")({
  head: () =>
    seo({
      title: "Chess Openings Explorer — Best Chess Openings | ChessOx",
      description:
        "Explore chess openings on ChessOx: first-move statistics, popular lines such as the Sicilian Defense, Ruy Lopez, Italian Game and Caro-Kann, and opening strategy for beginners.",
      keywords: [
        "chess openings",
        "best chess openings",
        "chess openings for beginners",
        "chess opening strategy",
        "learn chess openings",
      ],
      path: "/openings",
      jsonLd: [
        collectionPageLd({
          name: "Chess Openings Explorer — ChessOx",
          description:
            "An opening explorer covering the most played first moves and popular chess openings, with win, draw and loss shares for each line.",
          path: "/openings",
          about: ["Chess openings", "Chess opening strategy", "Chess theory"],
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Chess Openings", path: "/openings" },
        ]),
      ],
    }),
  component: Openings,
});

// Approximate shares of each first move in master play, used here as a
// teaching reference. These are not counts from a ChessOx game database —
// the page states that, and no absolute game totals are claimed.
const LINES = [
  ["e4", "≈44%", "Open game", "Fights for the centre at once"],
  ["d4", "≈38%", "Closed game", "Slower, structure-first play"],
  ["c4", "≈8%", "English", "Flank pressure on d5"],
  ["Nf3", "≈7%", "Réti", "Flexible, delays committing"],
  ["g3", "≈2%", "King's Fianchetto", "Bishop on the long diagonal"],
];

// Approximate white win/draw/loss shares for each opening in master play,
// shown as a study reference rather than as ChessOx match results.
const POPULAR = [
  ["Sicilian Defense", "B20", 52, 28, 20],
  ["Ruy Lopez", "C60", 48, 32, 20],
  ["Italian Game", "C50", 46, 30, 24],
  ["French Defense", "C00", 44, 34, 22],
  ["Caro-Kann", "B10", 42, 36, 22],
  ["King's Indian", "E60", 50, 30, 20],
];

function Openings() {
  return (
    <PageShell
      eyebrow="The Library"
      title="Opening Explorer"
      subtitle="A reference guide to the most played chess openings — one move at a time."
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Chessboard size="md" />
        </div>
        <div className="space-y-4 lg:col-span-7">
          <Card className="p-5">
            <SectionTitle kicker="Move" title="Common First Moves" />
            <div className="space-y-2">
              {LINES.map(([m, w, n, g]) => (
                <div
                  key={m as string}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm"
                >
                  <span className="font-mono text-gold">{m}</span>
                  <div>
                    <div>{n}</div>
                    <div className="text-xs text-muted-foreground">{g}</div>
                  </div>
                  <span className="rounded-full bg-emerald/15 px-2.5 py-1 text-xs text-emerald">
                    {w}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle kicker="Reference" title="Popular Lines" />
            <div className="space-y-3">
              {POPULAR.map(([n, c, w, d, l]) => (
                <div
                  key={n as string}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-display">
                      {n} <span className="ml-1 text-xs text-muted-foreground">{c}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      W {w}% · D {d}% · L {l}%
                    </span>
                  </div>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full">
                    <div className="bg-emerald" style={{ width: `${w}%` }} />
                    <div className="bg-white/20" style={{ width: `${d}%` }} />
                    <div className="bg-destructive" style={{ width: `${l}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
