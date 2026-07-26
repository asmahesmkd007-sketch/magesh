import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Construction } from "lucide-react";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/events")({
  head: () =>
    seo({
      title: "Online Chess Events — ChessOx Platform Events",
      description:
        "ChessOx platform events: exhibitions, anniversaries and community festivals. Online chess tournaments you can enter today are listed on the tournaments page.",
      keywords: ["online chess events", "chess events", "chess competition online"],
      // The events calendar has no content yet. Keeping it out of the index
      // avoids publishing a "coming soon" page as though it were finished —
      // remove this once the calendar ships.
      robots: "noindex, follow",
      jsonLd: [
        webPageLd({
          name: "Platform Events — ChessOx",
          description:
            "The ChessOx events page, where the global chess events calendar covering exhibitions, anniversaries and community festivals will be published.",
          path: "/events",
          primaryTopic: "Online chess events",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Events", path: "/events" },
        ]),
      ],
    }),
  component: EventsPage,
});

function EventsPage() {
  return (
    <PageShell title="Platform Events">
      <Card className="max-w-2xl mx-auto mt-12 p-8 text-center border-gold/20">
        <div className="grid h-20 w-20 mx-auto place-items-center rounded-full bg-gold/10 text-gold mb-6">
          <Construction className="h-10 w-10" />
        </div>
        {/* h2 — PageShell renders this page's h1 ("Platform Events"). */}
        <h2 className="font-display text-4xl mb-4 text-gradient-gold">Coming Soon</h2>
        <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
          Stay tuned for grandmasters' exhibitions, platform anniversaries, and community festivals.
        </p>
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8 text-left">
          <h3 className="font-display text-xl mb-2 text-gold">Feature in Development</h3>
          <p className="text-sm text-ivory/80">
            Our global events calendar is currently being synchronized. Stay tuned for upcoming
            platform updates.
          </p>
        </div>
        <Link to="/home">
          <GoldButton>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
          </GoldButton>
        </Link>
      </Card>
    </PageShell>
  );
}
