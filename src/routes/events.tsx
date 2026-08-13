import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Sparkles,
  Trophy,
  Zap,
  Shield,
  CheckCircle2,
  Bell,
} from "lucide-react";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";
import { toast } from "sonner";

export const Route = createFileRoute("/events")({
  head: () =>
    seo({
      title: "Online Chess Events — ChessOx Platform Events",
      description:
        "ChessOx platform events: exhibitions, anniversaries and community festivals. Online chess tournaments you can enter today are listed on the tournaments page.",
      keywords: ["online chess events", "chess events", "chess competition online"],
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
  const [subscribed, setSubscribed] = useState(false);

  function handleSubscribe() {
    setSubscribed(true);
    toast.success("You're on the VIP notification list! We'll notify you when Events launcher ships.");
  }

  return (
    <PageShell title="Platform Events">
      <div className="mx-auto max-w-4xl py-6 px-4">
        {/* Header card with glow */}
        <Card className="relative overflow-hidden p-8 sm:p-12 text-center border-gold/25 bg-gradient-to-b from-gold/10 via-background/90 to-background shadow-2xl">
          {/* Subtle background glow element */}
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />

          {/* Icon Badge */}
          <div className="relative z-10 mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold shadow-lg shadow-gold/10 backdrop-blur-md">
            <Calendar className="h-10 w-10 animate-pulse" />
          </div>

          {/* Title & Tag */}
          <div className="relative z-10 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-gold mb-4">
            <Sparkles className="h-3.5 w-3.5" /> Coming Soon
          </div>

          <h1 className="relative z-10 font-display text-4xl sm:text-5xl text-gradient-gold mb-4 tracking-tight">
            ChessOx Global Events
          </h1>

          <p className="relative z-10 mx-auto max-w-xl text-muted-foreground text-base sm:text-lg mb-8 leading-relaxed">
            Get ready for exclusive grandmaster exhibitions, platform anniversary blitzes, and inter-clan championships.
          </p>

          {/* Action buttons */}
          <div className="relative z-10 flex flex-wrap items-center justify-center gap-4 mb-10">
            <button
              onClick={handleSubscribe}
              disabled={subscribed}
              className={`flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all ${
                subscribed
                  ? "border border-emerald/40 bg-emerald/15 text-emerald cursor-default"
                  : "gradient-gold text-background shadow-lg shadow-gold/20 hover:scale-105 active:scale-95"
              }`}
            >
              {subscribed ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> VIP Alert Set
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4" /> Get Notified
                </>
              )}
            </button>

            <Link to="/home">
              <GoldButton className="rounded-full px-6 py-3">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
              </GoldButton>
            </Link>
          </div>

          {/* Upcoming Event Teasers Grid */}
          <div className="relative z-10 grid gap-4 text-left sm:grid-cols-3 pt-6 border-t border-gold/15">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-gold/30">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-lg bg-gold/10 p-2 text-gold">
                  <Trophy className="h-5 w-5" />
                </div>
                <h2 className="font-display text-sm font-semibold text-foreground">GM Exhibitions</h2>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Watch & challenge titled Grandmasters in simultaneous exhibition matches with live analysis.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-gold/30">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-lg bg-gold/10 p-2 text-gold">
                  <Zap className="h-5 w-5" />
                </div>
                <h2 className="font-display text-sm font-semibold text-foreground">Anniversary Festivals</h2>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Platform-wide arena marathons featuring boosted Season Points and exclusive avatar badges.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-gold/30">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-lg bg-gold/10 p-2 text-gold">
                  <Shield className="h-5 w-5" />
                </div>
                <h2 className="font-display text-sm font-semibold text-foreground">Clan Supremacy</h2>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Inter-clan tournaments where top chess clans compete for the monthly ChessOx Trophy.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
