import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Construction } from "lucide-react";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";

export const Route = createFileRoute("/community-guidelines")({
  head: () => ({ meta: [{ title: "Community Guidelines — ChessOx" }] }),
  component: GuidelinesPage,
});

function GuidelinesPage() {
  return (
    <PageShell title="Community Guidelines">
      <Card className="max-w-2xl mx-auto mt-12 p-8 text-center border-gold/20">
        <div className="grid h-20 w-20 mx-auto place-items-center rounded-full bg-gold/10 text-gold mb-6">
          <Construction className="h-10 w-10" />
        </div>
        <h1 className="font-display text-4xl mb-4 text-gradient-gold">Community Guidelines</h1>
        <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
          Chess is a game of honor. Read our guidelines on sportsmanship, chat etiquette, and fair
          play expectations for all members of the royal community.
        </p>
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8 text-left">
          <h3 className="font-display text-xl mb-2 text-gold">Future Feature Integration</h3>
          <p className="text-sm text-ivory/80">
            Our comprehensive Community Guidelines are currently being drafted by our moderation
            team. Stay tuned for upcoming platform updates.
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
