import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/site/Primitives";
import { AnalysisBoard } from "@/components/site/AnalysisBoard";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Analysis Board — ChessOx" },
      { name: "description", content: "Import PGNs, step through games with arrow keys, and explore lines with engine evaluation." },
    ],
  }),
  component: Analysis,
});

function Analysis() {
  return (
    <PageShell eyebrow="Engine Room" title="Analysis Board">
      <AnalysisBoard />
    </PageShell>
  );
}
