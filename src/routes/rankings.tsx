import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PageShell } from "@/components/site/Primitives";
import { HallOfFame } from "@/components/ranking/HallOfFame";
import { RankCard } from "@/components/ranking/RankCard";
import { RankingLeaderboard } from "@/components/ranking/RankingLeaderboard";
import { SeasonRules } from "@/components/ranking/SeasonRules";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { seo, breadcrumbLd, collectionPageLd } from "@/lib/seo";

export const Route = createFileRoute("/rankings")({
  head: () =>
    seo({
      title: "Chess Rankings — ELO Ratings & Season Points | ChessOx",
      description:
        "Two chess ranking systems on ChessOx: permanent ELO ratings that measure long-term strength, and monthly Season Points with Bronze to Grandmaster tiers. Compare globally or by country, state, district and friends.",
      keywords: [
        "chess rankings",
        "chess elo rating",
        "chess season points",
        "chess tiers",
        "chess leaderboard",
        "grandmaster rank chess",
      ],
      path: "/rankings",
      jsonLd: [
        collectionPageLd({
          name: "Chess Rankings — ChessOx",
          description:
            "Permanent ELO ratings and seasonal tier rankings for ChessOx players, with global, country, state, district and friends leaderboards.",
          path: "/rankings",
          about: ["Chess rankings", "Chess ELO rating", "Competitive chess seasons"],
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Rankings", path: "/rankings" },
        ]),
      ],
    }),
  component: Rankings,
});

type Tab = "boards" | "hall" | "rules";

const TABS: { id: Tab; label: string }[] = [
  { id: "boards", label: "Leaderboards" },
  { id: "hall", label: "Hall of Fame" },
  { id: "rules", label: "How it works" },
];

function Rankings() {
  const { user } = useAuth();
  const { profile } = useProfile(user?.id);
  const [tab, setTab] = useState<Tab>("boards");

  return (
    <PageShell eyebrow="Competition" title="Rankings">
      {/* The viewer's own standing, when signed in */}
      {user && (
        <div className="mb-6">
          <RankCard userId={user.id} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1" role="tablist" aria-label="Rankings sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-gold/20 text-gold"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "boards" && (
        <RankingLeaderboard
          viewer={{
            userId: user?.id ?? null,
            country: profile?.country ?? null,
            state: profile?.state ?? null,
            district: profile?.district ?? null,
          }}
        />
      )}
      {tab === "hall" && <HallOfFame />}
      {tab === "rules" && <SeasonRules />}
    </PageShell>
  );
}
