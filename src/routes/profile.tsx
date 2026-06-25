import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton, GhostButton, SectionTitle } from "@/components/site/Primitives";
import { MapPin, Trophy, Users, Star, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth, useProfile, initials } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — ChessOx" }] }),
  component: Profile,
});

type Rating = { time_class: string; rating: number; games_played: number; wins: number; losses: number; draws: number };
type Game = { id: string; white_username: string | null; black_username: string | null; result: string; time_class: string; created_at: string };

function ratingHistory(current: number) {
  const out: { day: string; rating: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const wave = Math.sin((current + i) * 1.3) * 16 + Math.sin(i * 0.6) * 10;
    out.push({
      day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      rating: Math.round(current - i * 1.1 + wave),
    });
  }
  out[out.length - 1].rating = current;
  return out;
}

function Profile() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile(user?.id);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("ratings").select("*").eq("user_id", user.id).then(({ data }) => setRatings((data as Rating[]) ?? []));
    supabase
      .from("games")
      .select("id, white_username, black_username, result, time_class, created_at")
      .or(`white_id.eq.${user.id},black_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setGames((data as Game[]) ?? []));
  }, [user]);

  const ratingByClass = (cls: string) => ratings.find((r) => r.time_class === cls)?.rating ?? 1200;

  const totals = useMemo(
    () =>
      ratings.reduce(
        (acc, r) => ({
          games: acc.games + (r.games_played ?? 0),
          wins: acc.wins + (r.wins ?? 0),
          losses: acc.losses + (r.losses ?? 0),
          draws: acc.draws + (r.draws ?? 0),
        }),
        { games: 0, wins: 0, losses: 0, draws: 0 },
      ),
    [ratings],
  );

  const history = useMemo(() => ratingHistory(ratingByClass("rapid")), [ratings]);

  if (authLoading || profileLoading) {
    return (
      <PageShell>
        <div className="grid place-items-center py-32"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
      </PageShell>
    );
  }

  if (!user || !profile) {
    return (
      <PageShell eyebrow="Royal Court" title="Sign in to view your profile">
        <Link to="/auth"><GoldButton>Sign in</GoldButton></Link>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Card className="overflow-hidden">
        <div className="relative h-44 bg-gradient-to-br from-amber-500/40 via-rose-700/30 to-violet-700/30 md:h-56">
          <div className="absolute inset-0 mandala-bg opacity-60" />
        </div>
        <div className="relative -mt-12 px-6 pb-6 md:px-8">
          <div className="flex flex-wrap items-end gap-5">
            <div className="grid h-28 w-28 place-items-center rounded-2xl gradient-gold font-display text-5xl text-[#0B0D10] ring-4 ring-background">
              {initials(profile.display_name)}
            </div>
            <div className="flex-1">
              <h1 className="font-display text-4xl">{profile.display_name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {profile.country ?? "India"}</span>
                <span>· @{profile.username}</span>
                {profile.title && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs text-gold">{profile.title}</span>}
                {profile.premium_tier !== "free" && (
                  <span className="rounded-full bg-emerald/15 px-2 py-0.5 text-xs uppercase tracking-widest text-emerald">{profile.premium_tier}</span>
                )}
              </div>
              {profile.bio && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{profile.bio}</p>}
            </div>
            <div className="flex gap-2">
              <Link to="/settings"><GoldButton>Edit Profile</GoldButton></Link>
              <Link to="/play"><GhostButton>Play Now</GhostButton></Link>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["rapid", "blitz", "bullet", "classical"] as const).map((cls) => (
              <div key={cls} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{cls}</div>
                <div className="font-display text-2xl text-gradient-gold">{ratingByClass(cls)}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ["Total Games", totals.games, "text-foreground"],
              ["Wins", totals.wins, "text-emerald"],
              ["Losses", totals.losses, "text-rose-400"],
              ["Draws", totals.draws, "text-muted-foreground"],
            ] as const).map(([label, value, cls]) => (
              <div key={label} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
                <div className={`font-display text-2xl ${cls}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="mt-8 p-6">
        <SectionTitle kicker="Form" title="Rating History — Last 30 Days" />
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d4af37" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#d4af37" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickLine={false} axisLine={false} domain={["dataMin - 20", "dataMax + 20"]} />
              <Tooltip
                contentStyle={{ background: "rgba(16,8,8,0.95)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: "#d4af37" }}
              />
              <Area type="monotone" dataKey="rating" stroke="#d4af37" strokeWidth={2} fill="url(#goldFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <SectionTitle kicker="History" title="Match History" />
          {games.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No games yet. <Link to="/play" className="text-gold">Play your first</Link>.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {games.map((g) => {
                const opp = g.white_username && g.white_username !== profile.username ? g.white_username : g.black_username;
                return (
                  <div key={g.id} className="flex items-center justify-between py-3 text-sm">
                    <span>vs {opp ?? "Anonymous"}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground capitalize">{g.time_class}</span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-muted-foreground capitalize">{g.result}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <SectionTitle kicker="Glory" title="Achievements" />
          <ul className="space-y-3 text-sm">
            {([
              ["Joined the Court", Star],
              ["First Move", Trophy],
              ["Royal Member", Users],
            ] as const).map(([t, Icon], i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg border border-white/5 p-3">
                <span className="grid h-9 w-9 place-items-center rounded-full gradient-gold text-[#0B0D10]"><Icon className="h-4 w-4" /></span>
                {t}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
