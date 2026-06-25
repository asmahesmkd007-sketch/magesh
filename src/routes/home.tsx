import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageShell, Card, Stat, GoldButton, GhostButton, SectionTitle } from "@/components/site/Primitives";
import { Chessboard } from "@/components/site/Chessboard";
import { Swords, Bot, Users, Brain, Flame, TrendingUp, Trophy, Loader2 } from "lucide-react";
import { useAuth, useProfile, initials } from "@/hooks/useAuth";

export const Route = createFileRoute("/home")({
  head: () => ({ meta: [{ title: "Home — ChessOx" }] }),
  component: HomePage,
});

function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile(user?.id);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/auth" });
    }
  }, [user, authLoading, navigate]);

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  const displayName = profile?.display_name ?? profile?.username ?? user?.email?.split("@")[0] ?? "Player";
  const username = profile?.username ?? user?.email?.split("@")[0] ?? "";
  const tier = profile?.premium_tier ?? "free";
  const avatarInitials = initials(displayName);

  return (
    <PageShell>
      {/* Welcome */}
      <Card className="relative overflow-hidden p-8">
        <div className="pointer-events-none absolute inset-0 gradient-gold opacity-10" />
        <div className="pointer-events-none absolute inset-0 mandala-bg" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="grid h-14 w-14 place-items-center rounded-full gradient-gold text-background text-xl font-bold shadow-gold-glow">
              {profileLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : avatarInitials}
            </div>
            <div>
              <div className="font-display text-xs uppercase tracking-[0.3em] text-gold">Welcome back</div>
              <h1 className="mt-1 font-display text-4xl">
                {profileLoading ? (
                  <span className="inline-block h-8 w-48 animate-pulse rounded bg-gold/10" />
                ) : (
                  <span>
                    {displayName}{" "}
                    {tier !== "free" && (
                      <span className="text-gradient-gold capitalize">{tier}</span>
                    )}
                  </span>
                )}
              </h1>
              {username && (
                <div className="mt-1 text-sm text-muted-foreground">@{username}</div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <GoldButton as={Link} to="/play"><Swords className="h-4 w-4" /> Play Now</GoldButton>
            <GhostButton as={Link} to="/puzzles">Daily Puzzle</GhostButton>
          </div>
        </div>
      </Card>

      {/* Ratings */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Blitz" value={1842} hint="↑ 12 this week" />
        <Stat label="Rapid" value={1925} hint="↑ 4 this week" />
        <Stat label="Bullet" value={1684} hint="↓ 8 this week" />
        <Stat label="Puzzle" value={2104} hint="Top 8% globally" />
      </div>

      {/* Quick Actions */}
      <SectionTitle kicker="Begin" title="Quick Actions" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Users, t: "Play Online", d: "Find your match", to: "/play" },
          { icon: Swords, t: "Play Friend", d: "Challenge a friend", to: "/play/friend" },
          { icon: Bot, t: "Play Computer", d: "Train vs AI", to: "/play" },
          { icon: Brain, t: "Analysis Board", d: "Review your game", to: "/analysis" },
        ].map((a) => (
          <Link to={a.to} key={a.t}>
            <Card className="p-5 transition-transform hover:-translate-y-1">
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
        <Card className="p-6 lg:col-span-2">
          <SectionTitle kicker="History" title="Recent Games" />
          <div className="divide-y divide-white/5">
            {[
              ["vs PriyaKnights", "1-0", "Rapid", "16m"],
              ["vs RookRanger", "0-1", "Blitz", "4m"],
              ["vs BishopBlaze", "1-0", "Bullet", "2m"],
              ["vs PawnSage", "½-½", "Classical", "1h 12m"],
              ["vs CheckMate99", "1-0", "Rapid", "20m"],
            ].map(([opp, r, m, t]) => (
              <div key={opp} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${r === "1-0" ? "bg-emerald/20 text-emerald" : r === "0-1" ? "bg-destructive/20 text-destructive" : "bg-white/5 text-muted-foreground"}`}>
                    {r === "1-0" ? "W" : r === "0-1" ? "L" : "D"}
                  </span>
                  <div>
                    <div className="text-sm">{opp}</div>
                    <div className="text-xs text-muted-foreground">{m} · {t}</div>
                  </div>
                </div>
                <Link to="/analysis" className="rounded-full bg-gold/10 px-3 py-1 text-xs text-gold">Analyze</Link>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <SectionTitle kicker="Daily" title="Today's Puzzle" />
          <Chessboard size="sm" />
          <div className="mt-3 text-sm text-muted-foreground">White to play · Rated 1880</div>
          <Link to="/puzzles" className="mt-3 inline-flex w-full justify-center rounded-full gradient-gold px-4 py-2 text-sm font-medium text-[#0B0D10]">
            Solve
          </Link>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <SectionTitle kicker="Path" title="Learning Progress" />
          {[
            ["Sicilian Defense", 78],
            ["Endgame Mastery", 45],
            ["Opening Repertoire", 92],
          ].map(([n, v]) => (
            <div key={n as string} className="mb-4">
              <div className="mb-1.5 flex justify-between text-sm">
                <span>{n}</span>
                <span className="text-gold">{v}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full gradient-gold" style={{ width: `${v}%` }} />
              </div>
            </div>
          ))}
        </Card>

        <Card className="p-6">
          <SectionTitle kicker="Stats" title="Performance" />
          <div className="grid grid-cols-2 gap-4">
            <div><div className="text-xs text-muted-foreground">Win Rate</div><div className="font-display text-2xl text-gradient-gold">68%</div></div>
            <div><div className="text-xs text-muted-foreground">Streak</div><div className="font-display text-2xl text-gradient-gold flex items-center gap-1"><Flame className="h-5 w-5 text-gold" />7</div></div>
            <div><div className="text-xs text-muted-foreground">Games</div><div className="font-display text-2xl">1,284</div></div>
            <div><div className="text-xs text-muted-foreground">Best</div><div className="font-display text-2xl">1,963</div></div>
          </div>
        </Card>

        <Card className="p-6">
          <SectionTitle kicker="Next" title="Upcoming Tournament" />
          <div className="rounded-xl border border-gold/20 bg-gold/5 p-4">
            <Trophy className="h-6 w-6 text-gold" />
            <div className="mt-2 font-display text-xl">Maharaja Cup</div>
            <div className="text-sm text-muted-foreground">Starts in 2h 14m · Prize ₹10,00,000</div>
            <Link to="/tournament" className="mt-3 inline-flex w-full justify-center rounded-full border border-gold/30 px-4 py-2 text-sm text-gold">
              View Details
            </Link>
          </div>
        </Card>
      </div>

      {/* Activity */}
      <SectionTitle kicker="Feed" title="Activity" />
      <Card className="p-6">
        <ul className="space-y-3">
          {([
            [TrendingUp, "Rating gained +24 in Rapid"],
            [Trophy, "Won 3rd place in Brass Blitz Arena"],
            [Brain, "Completed lesson: Sicilian Najdorf"],
            [Flame, "7-day puzzle streak unlocked"],
          ] as const).map(([Icon, t], i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gold/10 text-gold">
                <Icon className="h-4 w-4" />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </Card>
    </PageShell>
  );
}
