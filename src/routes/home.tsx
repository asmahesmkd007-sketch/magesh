import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
  Loader2,
  Monitor,
  History,
  Zap,
  Timer,
  Rocket,
  Hourglass,
  Copy,
} from "lucide-react";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/site/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { StreakCard } from "@/components/site/StreakCard";
import { noindexSeo } from "@/lib/seo";

import { RequireAuth } from "@/components/auth/RequireAuth";

export const Route = createFileRoute("/home")({
  // Personalised dashboard — kept out of the index, but crawlers still follow
  // its links through to the public play, puzzle and tournament pages.
  head: () =>
    noindexSeo(
      "Your Chess Dashboard — ChessOx",
      "Your ChessOx dashboard: ratings, recent games, daily streak and quick links to play chess online, solve puzzles and enter tournaments.",
    ),
  component: () => (
    <RequireAuth>
      <HomePage />
    </RequireAuth>
  ),
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
    if (!authLoading && !user) {
      navigate({ to: "/auth" });
      return;
    }
    if (user && !profileLoading) {
      const metadataCompleted = !!user.user_metadata?.profile_completed;
      const hasBasicProfile = !!profile?.full_name && profile?.username?.length === 11;
      if (!metadataCompleted && !hasBasicProfile) {
        navigate({ to: "/onboarding" });
      }
    }
  }, [user, authLoading, profile, profileLoading, navigate]);

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
      <Card className="relative overflow-hidden p-5 sm:p-8">
        <div className="pointer-events-none absolute inset-0 gradient-gold opacity-10" />
        <div className="pointer-events-none absolute inset-0 mandala-bg" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-4">
            {profileLoading ? (
              <div className="h-16 w-16 grid place-items-center rounded-full gradient-gold">
                <Loader2 className="h-5 w-5 animate-spin text-background" />
              </div>
            ) : (
              <UserAvatar
                avatarUrl={
                  profile?.avatar_url ||
                  (user?.user_metadata?.avatar_url as string | undefined) ||
                  (user?.user_metadata?.picture as string | undefined)
                }
                displayName={displayName}
                size="lg"
              />
            )}
            <div>
              <div className="font-display text-xs uppercase tracking-[0.3em] text-gold">
                Welcome back
              </div>
              <h1 className="mt-1 font-display text-2xl sm:text-4xl">
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
              {username && (
                <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  @{username}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(username);
                      toast.success("Username copied!");
                    }}
                    className="text-muted-foreground/60 hover:text-gold transition-colors"
                    title="Copy Username"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <Link to="/play" className="flex-1 sm:flex-initial">
              <GoldButton className="w-full justify-center">
                <Swords className="h-4 w-4" /> Play Now
              </GoldButton>
            </Link>
            <Link to="/puzzles" className="flex-1 sm:flex-initial">
              <GhostButton className="w-full justify-center">Daily Puzzle</GhostButton>
            </Link>
          </div>
        </div>
      </Card>

      {/* Daily Streak */}
      <div className="mt-6">
        <StreakCard userId={user!.id} />
      </div>

      {/* Live Ratings */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { cls: "blitz", icon: Zap },
          { cls: "rapid", icon: Timer },
          { cls: "bullet", icon: Rocket },
          { cls: "classical", icon: Hourglass },
        ].map(({ cls, icon: Icon }) => (
          <Card key={cls} className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground capitalize">
              <Icon className="h-4 w-4 text-gold/70" />
              {cls}
            </div>
            <div className="mt-2 font-display text-2xl sm:text-3xl text-gradient-gold">
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
            <Card className="p-4 sm:p-5 h-full transition-transform hover:-translate-y-1 cursor-pointer">
              <div className="grid h-10 w-10 place-items-center rounded-lg gradient-gold text-[#0B0D10]">
                <a.icon className="h-5 w-5" />
              </div>
              <div className="mt-3 font-display text-base sm:text-lg">{a.t}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">{a.d}</div>
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
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 items-center gap-6">
            {/* Round SVG Win Rate Gauge */}
            <div className="flex items-center gap-4 shrink-0 justify-center sm:justify-start">
              <div className="relative flex items-center justify-center h-24 w-24 shrink-0">
                <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 90 90">
                  <circle
                    cx="45"
                    cy="45"
                    r="36"
                    className="stroke-white/10"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    cx="45"
                    cy="45"
                    r="36"
                    className="stroke-gold transition-all duration-1000 ease-out"
                    strokeWidth="7"
                    strokeDasharray={226.19}
                    strokeDashoffset={226.19 - (winRate / 100) * 226.19}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-display text-xl font-bold text-gradient-gold leading-none">
                    {statsLoading ? "—" : `${winRate}%`}
                  </span>
                  <span className="mt-1 text-[9px] uppercase tracking-widest font-semibold text-gold/80">
                    Win Rate
                  </span>
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-widest text-gold font-semibold">
                  Status
                </div>
                <div className="text-sm font-medium text-foreground">
                  {statsLoading
                    ? "Calculating..."
                    : winRate >= 50
                      ? "🔥 Winning Record"
                      : "⚡ Keep Training"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {totalWins}W / {totalGames}G
                </div>
              </div>
            </div>

            {/* Stat Item 1: Total Games */}
            <div className="flex flex-col items-center justify-center text-center">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-gold mb-1 text-sm font-bold">
                ♟️
              </div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Total Games
              </div>
              <div className="font-display text-2xl text-foreground mt-0.5">
                {statsLoading ? "—" : totalGames}
              </div>
            </div>

            {/* Stat Item 2: Total Wins */}
            <div className="flex flex-col items-center justify-center text-center">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500/10 text-emerald-400 mb-1 text-sm font-bold">
                🏆
              </div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Total Wins
              </div>
              <div className="font-display text-2xl text-emerald-400 mt-0.5">
                {statsLoading ? "—" : totalWins}
              </div>
            </div>

            {/* Stat Item 3: Best Rapid */}
            <div className="flex flex-col items-center justify-center text-center">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-gold mb-1 text-sm font-bold">
                ⚡
              </div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Best Rapid
              </div>
              <div className="font-display text-2xl text-gradient-gold mt-0.5">
                {statsLoading ? "—" : rating("rapid")}
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
