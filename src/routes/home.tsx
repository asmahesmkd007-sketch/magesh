import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  PageShell,
  Card,
  GoldButton,
  GhostButton,
  SectionTitle,
} from "@/components/site/Primitives";
import { Chessboard } from "@/components/site/Chessboard";
import {
  Swords,
  Users,
  Brain,
  Flame,
  TrendingUp,
  Trophy,
  Loader2,
  Monitor,
  History,
  Zap,
  Timer,
  Rocket,
  Hourglass,
} from "lucide-react";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/site/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { StreakCard } from "@/components/site/StreakCard";

export const Route = createFileRoute("/home")({
  head: () => ({ meta: [{ title: "Home — ChessOx" }] }),
  component: HomePage,
});

type RatingRow = {
  time_class: string;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  peak_rating: number;
};
type GameRow = {
  id: string;
  white_id: string | null;
  black_id: string | null;
  white_username: string | null;
  black_username: string | null;
  result: string;
  time_class: string;
  ended_at: string | null;
  created_at: string;
};

function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile(user?.id);
  const navigate = useNavigate();
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    setStatsLoading(true);
    Promise.all([
      supabase
        .from("ratings")
        .select("time_class,rating,games_played,wins,losses,peak_rating")
        .eq("user_id", user.id),
      supabase
        .from("games")
        .select(
          "id,white_id,black_id,white_username,black_username,result,time_class,ended_at,created_at",
        )
        .or(`white_id.eq.${user.id},black_id.eq.${user.id}`)
        .not("ended_at", "is", null)
        .in("result", ["white", "black", "draw"])
        .order("ended_at", { ascending: false })
        .limit(6),
    ])
      .then(([{ data: r }, { data: g }]) => {
        setRatings((r ?? []) as RatingRow[]);
        setGames((g ?? []) as GameRow[]);
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [user]);

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  const displayName =
    profile?.full_name ?? profile?.username ?? user?.email?.split("@")[0] ?? "User";
  const username = profile?.username ?? "";
  const tier = profile?.premium_tier ?? "free";

  const rating = (cls: string) => ratings.find((r) => r.time_class === cls)?.rating ?? 100;
  const totalGames = ratings.reduce((s, r) => s + r.games_played, 0);
  const totalWins = ratings.reduce((s, r) => s + r.wins, 0);
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  function getOutcome(g: GameRow): "W" | "L" | "D" {
    if (g.result === "draw") return "D";
    if (
      (g.result === "white" && g.white_id === user!.id) ||
      (g.result === "black" && g.black_id === user!.id)
    )
      return "W";
    return "L";
  }

  function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <PageShell>
      {/* Welcome Card */}
      <Card className="relative overflow-hidden p-8">
        <div className="pointer-events-none absolute inset-0 gradient-gold opacity-10" />
        <div className="pointer-events-none absolute inset-0 mandala-bg" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {profileLoading ? (
              <div className="h-16 w-16 grid place-items-center rounded-full gradient-gold">
                <Loader2 className="h-5 w-5 animate-spin text-background" />
              </div>
            ) : (
              <UserAvatar avatarUrl={profile?.avatar_url} displayName={displayName} size="lg" />
            )}
            <div>
              <div className="font-display text-xs uppercase tracking-[0.3em] text-gold">
                Welcome back
              </div>
              <h1 className="mt-1 font-display text-4xl">
                {profileLoading ? (
                  <span className="inline-block h-8 w-48 animate-pulse rounded bg-gold/10" />
                ) : (
                  <span>
                    {displayName}
                    {tier !== "free" && (
                      <span className="ml-2 text-gradient-gold capitalize">{tier}</span>
                    )}
                  </span>
                )}
              </h1>
              {username && <div className="mt-1 text-sm text-muted-foreground">@{username}</div>}
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/play">
              <GoldButton>
                <Swords className="h-4 w-4" /> Play Now
              </GoldButton>
            </Link>
            <Link to="/puzzles">
              <GhostButton>Daily Puzzle</GhostButton>
            </Link>
          </div>
        </div>
      </Card>

      {/* Daily Streak */}
      <div className="mt-6">
        <StreakCard userId={user!.id} />
      </div>

      {/* Live Ratings */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { cls: "blitz", icon: Zap },
          { cls: "rapid", icon: Timer },
          { cls: "bullet", icon: Rocket },
          { cls: "classical", icon: Hourglass },
        ].map(({ cls, icon: Icon }) => (
          <Card key={cls} className="p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground capitalize">
              <Icon className="h-4 w-4 text-gold/70" />
              {cls}
            </div>
            <div className="mt-2 font-display text-3xl text-gradient-gold">
              {statsLoading ? (
                <span className="inline-block h-8 w-20 animate-pulse rounded bg-gold/10" />
              ) : (
                rating(cls)
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <SectionTitle kicker="Begin" title="Quick Actions" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Users, t: "Quick Match", d: "Find an opponent", to: "/play" as const },
          { icon: Swords, t: "Play Friend", d: "Challenge by link", to: "/play/friend" as const },
          {
            icon: Monitor,
            t: "Local Play",
            d: "Two players, one board",
            to: "/play/local" as const,
          },
          { icon: Brain, t: "Analysis", d: "Review your game", to: "/analysis" as const },
        ].map((a) => (
          <Link to={a.to} key={a.t}>
            <Card className="p-5 transition-transform hover:-translate-y-1 cursor-pointer">
              <div className="grid h-10 w-10 place-items-center rounded-lg gradient-gold text-[#0B0D10]">
                <a.icon className="h-5 w-5" />
              </div>
              <div className="mt-3 font-display text-lg">{a.t}</div>
              <div className="text-sm text-muted-foreground">{a.d}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {/* Recent Games */}
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle kicker="History" title="Recent Games" />
            <Link
              to="/play/history"
              className="flex items-center gap-1 text-xs text-gold hover:text-gold/80"
            >
              <History className="h-3.5 w-3.5" /> View all
            </Link>
          </div>
          {statsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No games yet.{" "}
              <Link to="/play" className="text-gold">
                Play your first!
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {games.map((g) => {
                const outcome = getOutcome(g);
                const iWasWhite = g.white_id === user!.id;
                const opp = iWasWhite ? g.black_username : g.white_username;
                return (
                  <div key={g.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${outcome === "W" ? "bg-emerald/20 text-emerald" : outcome === "L" ? "bg-destructive/20 text-destructive" : "bg-white/5 text-muted-foreground"}`}
                      >
                        {outcome}
                      </span>
                      <div>
                        <div className="text-sm">vs {opp ?? "Anonymous"}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {g.time_class} · {relTime(g.ended_at ?? g.created_at)}
                        </div>
                      </div>
                    </div>
                    <Link
                      to="/game/$id/review"
                      params={{ id: g.id }}
                      className="rounded-full bg-gold/10 px-3 py-1 text-xs text-gold hover:bg-gold/20"
                    >
                      Replay
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Daily Puzzle */}
        <Card className="p-6">
          <SectionTitle kicker="Daily" title="Today's Puzzle" />
          <Chessboard size="sm" />
          <div className="mt-3 text-sm text-muted-foreground">White to play · Tactical puzzle</div>
          <Link
            to="/puzzles"
            className="mt-3 inline-flex w-full justify-center rounded-full gradient-gold px-4 py-2 text-sm font-medium text-[#0B0D10]"
          >
            Solve
          </Link>
        </Card>
      </div>

      {/* Performance */}
      <div className="mt-6">
        <Card className="p-6">
          <SectionTitle kicker="Stats" title="Performance" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
              <div className="font-display text-2xl text-gradient-gold">
                {statsLoading ? "—" : `${winRate}%`}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Games</div>
              <div className="font-display text-2xl">{statsLoading ? "—" : totalGames}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Wins</div>
              <div className="font-display text-2xl text-emerald">
                {statsLoading ? "—" : totalWins}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Best Rapid</div>
              <div className="font-display text-2xl">
                {statsLoading
                  ? "—"
                  : (ratings.find((r) => r.time_class === "rapid")?.peak_rating ?? "—")}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Activity Feed */}
      <SectionTitle kicker="Feed" title="Activity" />
      <Card className="p-6">
        {statsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Play some games to see your activity here.
          </p>
        ) : (
          <ul className="space-y-3">
            {games.slice(0, 4).map((g) => {
              const outcome = getOutcome(g);
              const iWasWhite = g.white_id === user!.id;
              const opp = iWasWhite ? g.black_username : g.white_username;
              return (
                <li key={g.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full text-xs ${outcome === "W" ? "bg-emerald/15 text-emerald" : outcome === "L" ? "bg-destructive/15 text-destructive" : "bg-white/5 text-muted-foreground"}`}
                  >
                    {outcome === "W" ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <Flame className="h-4 w-4" />
                    )}
                  </span>
                  {outcome === "W"
                    ? `Won against ${opp ?? "Anonymous"}`
                    : outcome === "L"
                      ? `Lost to ${opp ?? "Anonymous"}`
                      : `Drew with ${opp ?? "Anonymous"}`}{" "}
                  · {g.time_class}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
