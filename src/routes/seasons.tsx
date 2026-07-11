import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Construction } from "lucide-react";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";

export const Route = createFileRoute("/seasons")({
  head: () => ({ meta: [{ title: "Seasons — ChessOx" }] }),
  component: SeasonsPage,
});

function SeasonsPage() {
  return (
    <PageShell title="Season Arena">
      <Card className="max-w-2xl mx-auto mt-12 p-8 text-center border-gold/20">
        <div className="grid h-20 w-20 mx-auto place-items-center rounded-full bg-gold/10 text-gold mb-6">
          <Construction className="h-10 w-10" />
        </div>
        <h1 className="font-display text-4xl mb-4 text-gradient-gold">Coming Soon</h1>
        <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
          Climb the ranks. Prove your dominance. Every season, legends rise.
        </p>
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8 text-left">
          <h3 className="font-display text-xl mb-2 text-gold">Feature in Development</h3>
          <p className="text-sm text-ivory/80">
            The competitive seasons system is currently being built. You will soon be able to compete in structured seasons for exclusive rewards, badges, and prizes.
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
