import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/site/Primitives";
import { AnalysisBoard } from "@/components/site/AnalysisBoard";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/analysis")({
  head: () =>
    seo({
      title: "Chess Analysis Board — Free PGN Game Analysis | ChessOx",
      description:
        "Analyse chess games free on ChessOx. Import a PGN, step through moves with the arrow keys and explore variations with engine evaluation to find your mistakes.",
      keywords: [
        "chess analysis board",
        "chess game analysis",
        "pgn viewer",
        "chess improvement",
        "chess strategy",
      ],
      path: "/analysis",
      jsonLd: [
        webPageLd({
          name: "Chess Analysis Board — ChessOx",
          description:
            "A free online chess analysis board with PGN import, move-by-move replay and engine evaluation for reviewing games and studying variations.",
          path: "/analysis",
          primaryTopic: "Chess game analysis",
          about: ["Chess analysis", "Chess improvement", "Chess strategy"],
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Analysis Board", path: "/analysis" },
        ]),
      ],
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    gameId: typeof search.gameId === "string" ? search.gameId : undefined,
  }),
  component: Analysis,
});

function Analysis() {
  const { gameId } = Route.useSearch();
  return (
    <PageShell eyebrow="Engine Room" title="Analysis Board">
      <AnalysisBoard gameId={gameId} />
    </PageShell>
  );
}
