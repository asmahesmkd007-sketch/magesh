import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card } from "@/components/site/Primitives";
import { useEffect, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { UserAvatar } from "@/components/site/UserAvatar";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({ meta: [{ title: "Leaderboards — ChessOx" }] }),
  component: LB,
});

type Entry = {
  user_id: string;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  peak_rating: number;
  profiles: {
    username: string;
    display_name: string;
    country: string | null;
    avatar_url?: string | null;
    premium_active?: boolean;
    premium_expires_at?: string | null;
  } | null;
};

const TABS = ["iq", "blitz", "rapid", "bullet", "classical"] as const;
type Tab = (typeof TABS)[number];

function LB() {
  const [tab, setTab] = useState<Tab>("rapid");
  const [data, setData] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (tab === "iq") {
      (supabase as any)
        .from("profiles")
        .select("id, username, display_name, country, avatar_url, premium_active, premium_expires_at, iq_rating")
        .order("iq_rating", { ascending: false })
        .limit(50)
        .then(({ data: d }) => {
          // Map to standard Entry shape
          const mapped = (d ?? []).map((p: any) => ({
            user_id: p.id,
            rating: p.iq_rating ?? 100,
            games_played: 0, // Not perfectly aligned with IQ, but we can hide it in UI
            wins: 0,
            losses: 0,
            peak_rating: p.iq_rating ?? 100,
            profiles: p,
          })) as unknown as Entry[];
          setData(mapped);
          setLoading(false);
        });
    } else {
      supabase
        .from("ratings")
        .select(
          "user_id, rating, games_played, wins, losses, peak_rating, profiles(username, display_name, country, avatar_url, premium_active, premium_expires_at)",
        )
        .eq("time_class", tab)
        .gte("games_played", 1)
        .order("rating", { ascending: false })
        .limit(50)
        .then(({ data: d }) => {
          setData((d ?? []) as unknown as Entry[]);
          setLoading(false);
        });
    }
  }, [tab]);

  const winRate = (e: Entry) =>
    e.games_played > 0 ? Math.round((e.wins / e.games_played) * 100) : 0;

  return (
    <PageShell
      eyebrow="Hall of Kings"
      title="Leaderboards"
      subtitle="Where royalty is ranked, and legends are born."
    >
      <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/[0.02] p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-5 py-2 text-sm capitalize transition-colors ${tab === t ? "gradient-gold text-[#0B0D10]" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : data.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No rated players yet for {tab}. Be the first!
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Rank</th>
                <th className="px-4 py-3 text-left">Player</th>
                <th className="px-4 py-3 text-right">{tab === "iq" ? "IQ" : "Rating"}</th>
                {tab !== "iq" && <th className="hidden px-4 py-3 text-right md:table-cell">Peak</th>}
                {tab !== "iq" && <th className="hidden px-4 py-3 text-right md:table-cell">Games</th>}
                {tab !== "iq" && <th className="hidden px-4 py-3 text-right md:table-cell">Win %</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((e, i) => (
                <tr key={e.user_id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`grid h-7 w-7 place-items-center rounded-full text-xs ${i < 3 ? "gradient-gold text-[#0B0D10]" : "bg-white/5"}`}
                      >
                        {i + 1}
                      </span>
                      {i === 0 && <Crown className="h-4 w-4 text-gold" />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        avatarUrl={e.profiles?.avatar_url}
                        displayName={e.profiles?.display_name ?? e.profiles?.username}
                        size="sm"
                      />
                      <div>
                        <Link
                          to="/profile"
                          search={{ id: e.user_id }}
                          className="hover:text-gold flex items-center"
                        >
                          {e.profiles?.display_name ?? e.profiles?.username ?? "Unknown"}
                          <PremiumBadge
                            premiumActive={e.profiles?.premium_active}
                            premiumExpiresAt={e.profiles?.premium_expires_at}
                          />
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {e.profiles?.country ?? ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-display text-gold">{e.rating}</td>
                  {tab !== "iq" && (
                    <>
                      <td className="hidden px-4 py-3 text-right text-muted-foreground md:table-cell">
                        {e.peak_rating}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-muted-foreground md:table-cell">
                        {e.games_played}
                      </td>
                      <td className="hidden px-4 py-3 text-right md:table-cell">{winRate(e)}%</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PageShell>
  );
}
