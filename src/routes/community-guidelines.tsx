import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Construction } from "lucide-react";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/community-guidelines")({
  head: () =>
    seo({
      title: "Community Guidelines — ChessOx Chess Community",
      description:
        "ChessOx community guidelines on sportsmanship, chat etiquette and fair play expectations for every member of the online chess community.",
      keywords: ["chess community", "online chess community", "chess etiquette"],
      path: "/community-guidelines",
      jsonLd: [
        webPageLd({
          name: "Community Guidelines — ChessOx",
          description:
            "Sportsmanship, chat etiquette and fair play expectations for members of the ChessOx chess community.",
          path: "/community-guidelines",
          primaryTopic: "Chess community guidelines",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Community Guidelines", path: "/community-guidelines" },
        ]),
      ],
    }),
  component: GuidelinesPage,
});

function GuidelinesPage() {
  return (
    <PageShell title="Community Guidelines">
      <Card className="max-w-2xl mx-auto mt-12 p-8 text-center border-gold/20">
        <div className="grid h-20 w-20 mx-auto place-items-center rounded-full bg-gold/10 text-gold mb-6">
          <Construction className="h-10 w-10" />
        </div>
        {/* h2 — PageShell renders this page's h1. */}
        <h2 className="font-display text-4xl mb-4 text-gradient-gold">Community Guidelines</h2>
        <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
          Chess is a game of honor. Read our guidelines on sportsmanship, chat etiquette, and fair
          play expectations for all members of the royal community.
        </p>
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8 text-left">
          <h3 className="font-display text-xl mb-2 text-gold">The Short Version</h3>
          <ul className="space-y-2 text-sm text-ivory/80">
            <li>Be civil — disagree about chess, not about people.</li>
            <li>No insults after a loss, and no gloating after a win.</li>
            <li>No harassment, hate speech, threats or sexual content.</li>
            <li>No spam, scams, or buying and selling accounts, ratings or results.</li>
            <li>Never share engine analysis to help a player during a live game.</li>
            <li>Respect privacy — do not post personal information, including your own.</li>
            <li>Report problems instead of retaliating, and let moderators handle them.</li>
          </ul>
          <p className="mt-4 text-sm text-ivory/80">
            Breaking these rules can lead to content removal, a mute, a suspension, or a permanent
            ban depending on how serious it is. The full rules, the reporting process and how to
            appeal a decision are set out in our{" "}
            <Link to="/community-policy" className="text-gold hover:underline">
              Community Policy
            </Link>
            , and competitive integrity is covered in the{" "}
            <Link to="/fair-play-anti-cheating-policy" className="text-gold hover:underline">
              Fair Play &amp; Anti-Cheating Policy
            </Link>
            . To report something, email <span className="text-gold">contact@chessox.com</span>.
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
