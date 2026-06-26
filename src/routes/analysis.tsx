import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/site/Primitives";
import { AnalysisBoard } from "@/components/site/AnalysisBoard";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Analysis Board — ChessOx" },
      {
        name: "description",
        content:
          "Import PGNs, step through games with arrow keys, and explore lines with engine evaluation.",
      },
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
