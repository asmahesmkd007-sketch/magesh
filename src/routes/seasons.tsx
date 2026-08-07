import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  ChevronDown,
  ChevronUp,
  Crown,
  Flame,
  Globe2,
  History,
  Hourglass,
  ListOrdered,
  Loader2,
  MapPin,
  Medal,
  Minus,
  Puzzle,
  Search as SearchIcon,
  Shield,
  Sparkles,
  Swords,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { PlayerAvatar } from "@/components/tournament/bits";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  getCurrentSeason,
  getSeasonHistoryForUser,
  getSeasonLeaderboard,
  listSeasons,
  seasonRollover,
  type Season,
  type SeasonHistoryForUser,
  type SeasonLeaderboardEntry,
} from "@/lib/api/seasonsClient";
import {
  SEASON_TIERS,
  nextTierOf,
  tierDisplayName,
  tierOf,
  tierProgress,
  SEASON_REWARD_LABELS,
} from "@/lib/seasonTiers";
import { SeasonShield } from "@/components/ranking/SeasonShield";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/seasons")({
  head: () =>
    seo({
      title: "Chess Seasons & Ranked Arena — Tiers and Rewards | ChessOx",
      description:
        "Compete in ranked ChessOx chess seasons. Climb the season tiers, track your rank against other chess players and earn rewards before the season ends.",
      keywords: [
        "chess ranking",
        "online chess ranking",
        "chess leaderboard",
        "ranked chess",
        "chess competition online",
      ],
      path: "/seasons",
      jsonLd: [
        webPageLd({
          name: "Season Arena — ChessOx",
          description:
            "Ranked chess seasons on ChessOx, with tier progression, season standings and end-of-season rewards.",
          path: "/seasons",
          primaryTopic: "Ranked chess seasons",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Seasons", path: "/seasons" },
        ]),
      ],
    }),
  component: SeasonsPage,
});

// =====================================================================
// SEASON ARENA — the PUBG-style monthly competitive ranking hub.
// One-month seasons: play → earn Season IQ → climb tiers → crack the
// Top 100 → win permanent badges → carry a career record forever.
// All numbers come from the SECTION 77 engine (season_rankings /
// season_history / career columns); this page only renders.
// =====================================================================

type Scope = "global" | "country" | "state" | "district";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---- Season countdown (d/h/m/s to the season's end) -------------------
function SeasonCountdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(endsAt).getTime() - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const cell = (v: number, label: string) => (
    <div className="rounded-xl border border-gold/20 bg-black/30 px-3 py-2 text-center">
      <div className="font-display text-2xl tabular-nums text-gradient-gold md:text-3xl">
        {String(v).padStart(2, "0")}
      </div>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      {cell(d, "Days")}
      {cell(h, "Hours")}
      {cell(m, "Mins")}
      {cell(s, "Secs")}
    </div>
  );
}

// ---- Tier badge chip ---------------------------------------------------
function TierBadge({ iq, className = "" }: { iq: number; className?: string }) {
  return <SeasonShield sp={iq} size="xs" variant="chip" className={className} />;
}

// ---- Trend arrow -------------------------------------------------------
function Trend({ rank, prev }: { rank: number; prev: number | null | undefined }) {
  if (prev == null || prev === rank)
    return <Minus className="h-3 w-3 text-muted-foreground/40" aria-label="No change" />;
  if (rank < prev)
    return (
      <span className="flex items-center text-[10px] text-emerald">
        <ChevronUp className="h-3.5 w-3.5" />
        {prev - rank}
      </span>
    );
  return (
    <span className="flex items-center text-[10px] text-rose-400">
      <ChevronDown className="h-3.5 w-3.5" />
      {rank - prev}
    </span>
  );
}

function SeasonsPage() {
  const { user } = useAuth();
  const [season, setSeason] = useState<Season | null>(null);
  const [allSeasons, setAllSeasons] = useState<Season[]>([]);
  const [board, setBoard] = useState<SeasonLeaderboardEntry[]>([]);
  const [me, setMe] = useState<SeasonHistoryForUser | null>(null);
  const [myRegion, setMyRegion] = useState<{
    country: string | null;
    state: string | null;
    district: string | null;
  }>({ country: null, state: null, district: null });
  const [scope, setScope] = useState<Scope>("global");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);

  // First load: nudge the rollover (idempotent — bootstraps Season 1,
  // ends expired seasons) then pull everything.
  const load = useCallback(async () => {
    try {
      if (user) await seasonRollover().catch(() => undefined);
      const [cur, all] = await Promise.all([getCurrentSeason(), listSeasons()]);
      setSeason(cur);
      setAllSeasons(all ?? []);
      if (user) {
        void getSeasonHistoryForUser(user.id)
          .then(setMe)
          .catch(() => setMe(null));
        void supabase
          .from("profiles")
          .select("country,state,district")
          .eq("id", user.id)
          .maybeSingle()
          .then(({ data }) => {
            // state/district are live columns (schema.sql SECTION 19)
            // absent from the generated types.ts.
            const row = data as unknown as {
              country: string | null;
              state: string | null;
              district: string | null;
            } | null;
            if (row) setMyRegion(row);
          });
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Leaderboard: refetch on scope/search change + light polling while open.
  useEffect(() => {
    if (!season) return;
    let alive = true;
    const fetchBoard = async () => {
      setBoardLoading(true);
      try {
        const rows = await getSeasonLeaderboard(season.id, {
          country: scope !== "global" ? myRegion.country : null,
          state: scope === "state" || scope === "district" ? myRegion.state : null,
          district: scope === "district" ? myRegion.district : null,
          search,
          limit: 100,
        });
        if (alive) setBoard(rows ?? []);
      } catch {
        /* keep the previous board on transient errors */
      }
      if (alive) setBoardLoading(false);
    };
    void fetchBoard();
    const iv = setInterval(() => void fetchBoard(), 30_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [season, scope, search, myRegion]);

  const myEntry = useMemo(
    () => (user ? (board.find((e) => e.user_id === user.id) ?? null) : null),
    [board, user],
  );
  const myIq = me?.current_season_iq ?? myEntry?.season_iq ?? 0;
  const myTier = tierOf(myIq);
  const myNext = nextTierOf(myIq);
  const myProgress = tierProgress(myIq);
  const pastSeasons = useMemo(() => allSeasons.filter((s) => s.status === "ended"), [allSeasons]);

  const scopeTabs: { key: Scope; label: string; icon: React.ReactNode; enabled: boolean }[] = [
    { key: "global", label: "Global", icon: <Globe2 className="h-3.5 w-3.5" />, enabled: true },
    {
      key: "country",
      label: myRegion.country ?? "Country",
      icon: <MapPin className="h-3.5 w-3.5" />,
      enabled: !!myRegion.country,
    },
    {
      key: "state",
      label: myRegion.state ?? "State",
      icon: <MapPin className="h-3.5 w-3.5" />,
      enabled: !!myRegion.state,
    },
    {
      key: "district",
      label: myRegion.district ?? "District",
      icon: <MapPin className="h-3.5 w-3.5" />,
      enabled: !!myRegion.district,
    },
  ];

  if (loading) {
    return (
      <PageShell compact>
        <div className="grid min-h-[50vh] place-items-center">
          <Loader2 className="h-10 w-10 animate-spin text-gold" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell compact>
      <div className="space-y-6">
        {/* ---- Hero: current season + countdown --------------------------- */}
        <Card className="relative overflow-hidden p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 mandala-bg opacity-[0.04]" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-gold/70">
                <Crown className="h-3.5 w-3.5" /> Chessox Season Arena
              </div>
              {season ? (
                <>
                  <h1 className="mt-2 font-display text-3xl text-gradient-gold md:text-4xl">
                    {season.name || `Season ${season.season_number}`}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-emerald/30 bg-emerald/10 px-2 py-0.5 text-emerald">
                      {season.status === "live"
                        ? "LIVE"
                        : (season.status?.toUpperCase() ?? "UNKNOWN")}
                    </span>
                    <span>
                      {fmtDate(season.start_date)} — {fmtDate(season.end_date)} · one-month season
                    </span>
                  </div>
                  <p className="mt-3 max-w-md text-sm text-muted-foreground">
                    Play → earn Season IQ → climb the tiers → crack the Top 100 → win permanent
                    badges. Everything resets next month — your career record never does.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="mt-2 font-display text-3xl text-gradient-gold md:text-4xl">
                    New Season Starting Soon
                  </h1>
                  <p className="mt-3 max-w-md text-sm text-muted-foreground">
                    The next one-month season begins shortly. Play games, solve puzzles and win
                    tournaments to earn Season IQ the moment it goes live.
                  </p>
                </>
              )}
            </div>
            {season && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <Hourglass className="h-3 w-3" /> Season ends in
                </div>
                <SeasonCountdown endsAt={season.end_date} />
              </div>
            )}
          </div>
        </Card>

        {/* ---- My season + career strip ----------------------------------- */}
        {user && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
                  <TrendingUp className="h-3.5 w-3.5" /> My Season
                </div>
                <TierBadge iq={myIq} />
              </div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="font-display text-4xl text-gradient-gold">
                    #{me?.current_season_rank ?? myEntry?.rank ?? "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Season Rank
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-stat text-3xl text-gold">{myIq.toLocaleString()}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Season IQ
                  </div>
                </div>
              </div>
              {/* Tier progress */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className={myTier.text}>{myTier.name}</span>
                  <span>
                    {myNext
                      ? `Next: ${myNext.name} · ${myProgress}% (${(myNext.min - myIq).toLocaleString()} IQ to go)`
                      : "Top tier reached"}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${myTier.bar} transition-all`}
                    style={{ width: `${myProgress}%` }}
                  />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1.5 text-center">
                {[
                  { l: "Games", v: me?.current_games_played ?? 0 },
                  {
                    l: "Win %",
                    v:
                      (me?.current_games_played ?? 0) > 0
                        ? `${Math.round(((me?.current_wins ?? 0) * 100) / (me?.current_games_played ?? 1))}%`
                        : "—",
                  },
                  { l: "Streak", v: me?.current_best_win_streak ?? 0 },
                  { l: "Puzzles", v: me?.current_puzzles_solved ?? 0 },
                ].map((x) => (
                  <div
                    key={x.l}
                    className="rounded-lg border border-white/5 bg-white/[0.02] px-1 py-1.5"
                  >
                    <div className="font-stat text-sm">{x.v}</div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      {x.l}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Career records — permanent, never reset */}
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
                <Award className="h-3.5 w-3.5" /> Career Record
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    l: "Career Highest IQ",
                    v: (me?.career_highest_iq ?? 0).toLocaleString(),
                    sub: me?.career_highest_iq_season
                      ? `Season ${me.career_highest_iq_season}`
                      : "—",
                    cls: "text-gold",
                  },
                  {
                    l: "Career Best Rank",
                    v: me?.career_best_rank ? `#${me.career_best_rank}` : "—",
                    sub: me?.career_best_rank_season ? `Season ${me.career_best_rank_season}` : "—",
                    cls: "text-emerald",
                  },
                  {
                    l: "Best Season",
                    v: me?.best_season_number ? `Season ${me.best_season_number}` : "—",
                    sub: `${me?.seasons_played ?? 0} played`,
                    cls: "",
                  },
                  {
                    l: "Top Finishes",
                    v: `${me?.top_10_finishes ?? 0} / ${me?.top_100_finishes ?? 0}`,
                    sub: "Top 10 / Top 100",
                    cls: "",
                  },
                ].map((x) => (
                  <div key={x.l} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className={`font-stat text-xl ${x.cls}`}>{x.v}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {x.l}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground/70">{x.sub}</div>
                  </div>
                ))}
              </div>
              {(me?.season_badges?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(me?.season_badges ?? []).slice(0, 8).map((b, i) => (
                    <span
                      key={i}
                      title={`Season ${b.season}`}
                      className="rounded-full border border-gold/25 bg-gold/5 px-2 py-0.5 text-[10px] text-gold"
                    >
                      {SEASON_REWARD_LABELS[b.code] ?? b.code} · S{b.season}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* ---- Leaderboard (main column) -------------------------------- */}
          <Card className="min-w-0 p-5 lg:col-span-2">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
                <ListOrdered className="h-3.5 w-3.5" /> Season Leaderboard
                <span className="rounded-full border border-gold/25 bg-gold/5 px-2 py-0.5 text-[9px] text-gold">
                  TOP 100 = PERMANENT BADGE
                </span>
              </div>
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find a player…"
                  className="w-44 rounded-lg border border-white/10 bg-white/[0.02] py-1.5 pl-8 pr-2 text-xs outline-none focus:border-gold/40"
                />
              </div>
            </div>

            {/* Scope tabs */}
            <div className="mb-4 flex flex-wrap gap-1.5">
              {scopeTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => tab.enabled && setScope(tab.key)}
                  disabled={!tab.enabled}
                  title={tab.enabled ? undefined : "Set your region in Settings to unlock"}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
                    scope === tab.key
                      ? "border-gold/40 bg-gold/10 text-gold"
                      : "border-white/10 text-muted-foreground hover:text-foreground disabled:opacity-40"
                  }`}
                >
                  {tab.icon}
                  <span className="max-w-[120px] truncate">{tab.label}</span>
                </button>
              ))}
            </div>

            {boardLoading && board.length === 0 ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-gold" />
              </div>
            ) : board.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                {season
                  ? "No ranked players in this scope yet — play a game to claim rank #1."
                  : "The leaderboard opens when the season starts."}
              </div>
            ) : (
              <div className="space-y-1.5">
                {board.map((e) => {
                  const isMe = e.user_id === user?.id;
                  const iq = e.season_iq ?? e.iq_level;
                  const top3 = e.rank <= 3;
                  return (
                    <div
                      key={e.user_id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                        isMe
                          ? "border-gold/40 bg-gold/10"
                          : top3
                            ? "border-gold/20 bg-gold/[0.04]"
                            : e.rank <= 100
                              ? "border-white/10 bg-white/[0.02]"
                              : "border-white/5"
                      }`}
                    >
                      <div className="flex w-12 shrink-0 items-center gap-1">
                        <span
                          className={`font-display text-lg ${
                            e.rank === 1
                              ? "text-gold"
                              : e.rank === 2
                                ? "text-gold/80"
                                : e.rank === 3
                                  ? "text-amber-400"
                                  : ""
                          }`}
                        >
                          {e.rank}
                        </span>
                        <Trend rank={e.rank} prev={e.prev_rank} />
                      </div>
                      <PlayerAvatar
                        username={e.username}
                        avatarUrl={e.avatar_url}
                        size="h-9 w-9"
                        ring={top3 ? "ring-2 ring-gold/50" : undefined}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            to="/u/$username"
                            params={{ username: e.username }}
                            className="truncate text-sm font-medium hover:text-gold"
                          >
                            {e.full_name || e.username}
                          </Link>
                          {isMe && <span className="text-[9px] text-emerald">(you)</span>}
                          <TierBadge iq={iq} className="hidden sm:inline-flex" />
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          @{e.username}
                          {(e.state || e.country) && (
                            <> · {[e.state, e.country].filter(Boolean).join(", ")}</>
                          )}
                        </div>
                      </div>
                      <div className="hidden text-right text-[10px] text-muted-foreground md:block">
                        <div>
                          <span className="text-emerald">{e.win_rate ?? 0}%</span> WR
                        </div>
                        <div>{e.games_played ?? 0} games</div>
                      </div>
                      <div className="w-20 shrink-0 text-right">
                        <div className="font-stat text-base text-gold">{iq.toLocaleString()}</div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                          Season IQ
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* ---- Side rail ------------------------------------------------- */}
          <div className="min-w-0 space-y-6">
            {/* Tier ladder */}
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
                <Shield className="h-3.5 w-3.5" /> Season Tier Ladder
              </div>
              <div className="space-y-1.5">
                {[...SEASON_TIERS].reverse().map((tier) => {
                  const mine = user && myTier.name === tier.name;
                  return (
                    <div
                      key={tier.name}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                        mine ? `${tier.badge} ring-1 ring-inset ring-white/10` : "border-white/5"
                      }`}
                    >
                      <span className={`flex items-center gap-1.5 text-xs ${tier.text}`}>
                        <SeasonShield sp={tier.min} size="xs" variant="icon" />
                        {tier.name}
                        {mine && <span className="text-[9px] text-muted-foreground">(you)</span>}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {tier.min.toLocaleString()}
                        {tier.max ? `–${(tier.max - 1).toLocaleString()}` : "+"} SP
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* How to earn IQ */}
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
                <Sparkles className="h-3.5 w-3.5" /> Earn Season IQ
              </div>
              <div className="space-y-1.5 text-xs">
                {[
                  {
                    icon: <Swords className="h-3.5 w-3.5 text-emerald" />,
                    l: "Win a game",
                    v: "+20",
                  },
                  {
                    icon: <TrendingUp className="h-3.5 w-3.5 text-emerald" />,
                    l: "Beat a stronger player",
                    v: "up to +40",
                  },
                  {
                    icon: <Crown className="h-3.5 w-3.5 text-gold" />,
                    l: "Win by checkmate",
                    v: "+5",
                  },
                  {
                    icon: <Flame className="h-3.5 w-3.5 text-amber-400" />,
                    l: "3+ win streak (per win)",
                    v: "+5",
                  },
                  {
                    icon: <Puzzle className="h-3.5 w-3.5 text-sky-400" />,
                    l: "Solve a puzzle",
                    v: "+3–6",
                  },
                  {
                    icon: <Sparkles className="h-3.5 w-3.5 text-violet-400" />,
                    l: "90%+ accuracy game",
                    v: "+10",
                  },
                  { icon: <Hourglass className="h-3.5 w-3.5" />, l: "Daily activity", v: "+10" },
                  {
                    icon: <Trophy className="h-3.5 w-3.5 text-gold" />,
                    l: "Tournament podium",
                    v: "+100–250",
                  },
                  {
                    icon: <Medal className="h-3.5 w-3.5" />,
                    l: "Draw / played game",
                    v: "+5 / +2",
                  },
                ].map((r) => (
                  <div
                    key={r.l}
                    className="flex items-center justify-between rounded-lg bg-white/[0.02] px-2.5 py-1.5"
                  >
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {r.icon}
                      {r.l}
                    </span>
                    <span className="font-medium text-gold">{r.v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-snug text-muted-foreground/70">
                Skill beats volume: upsets, streaks, accuracy and podiums pay far more than grinding
                games. Aborted and no-show games earn nothing.
              </p>
            </Card>

            {/* Season rewards preview */}
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
                <Trophy className="h-3.5 w-3.5" /> Season Rewards
              </div>
              <div className="space-y-1.5 text-xs">
                {[
                  { l: "Season Champion", d: "Champion badge + permanent title", c: "text-gold" },
                  { l: "Top 3", d: "Podium badge", c: "text-gold/80" },
                  { l: "Top 10", d: "Top 10 achievement", c: "text-amber-400" },
                  { l: "Top 100", d: "Top 100 badge + profile recognition", c: "text-emerald" },
                  { l: "Most Improved", d: "Biggest IQ jump vs last season", c: "text-sky-400" },
                  { l: "Puzzle Master", d: "Most puzzles solved", c: "text-violet-400" },
                  {
                    l: "Highest Win Streak",
                    d: "Longest streak of the season",
                    c: "text-rose-400",
                  },
                  { l: "Best New Player", d: "Top first-season performer", c: "text-emerald" },
                  { l: "Regional Champion", d: "#1 in your country", c: "text-gold" },
                ].map((r) => (
                  <div key={r.l} className="rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                    <div className={`font-medium ${r.c}`}>{r.l}</div>
                    <div className="text-[10px] text-muted-foreground">{r.d}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground/70">
                Badges are written to your profile forever — season points reset, your legacy
                doesn&apos;t.
              </p>
            </Card>

            {/* My season history timeline */}
            {user && (me?.seasons.length ?? 0) > 0 && (
              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
                  <History className="h-3.5 w-3.5" /> My Season History
                </div>
                <div className="space-y-2">
                  {(me?.seasons ?? []).map((s) => (
                    <div
                      key={s.season_id}
                      className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">
                          {s.season_name || `Season ${s.season_number}`}
                        </span>
                        <span className="font-display text-sm text-gold">#{s.final_rank}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>
                          {(s.season_iq ?? s.iq_level).toLocaleString()} SP ·{" "}
                          {tierDisplayName(s.tier, s.season_iq ?? s.iq_level)}
                        </span>
                        <span>{fmtDate(s.ended_at)}</span>
                      </div>
                      {s.rewards.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {s.rewards.map((r) => (
                            <span
                              key={r}
                              className="rounded-full border border-gold/20 bg-gold/5 px-1.5 py-0.5 text-[9px] text-gold"
                            >
                              {SEASON_REWARD_LABELS[r] ?? r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Past seasons */}
            {pastSeasons.length > 0 && (
              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
                  <History className="h-3.5 w-3.5" /> Past Seasons
                </div>
                <div className="space-y-1.5 text-xs">
                  {pastSeasons.slice(0, 6).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg bg-white/[0.02] px-2.5 py-1.5"
                    >
                      <span>{s.name || `Season ${s.season_number}`}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {fmtDate(s.start_date)} — {fmtDate(s.end_date)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {!user && (
              <Card className="p-5 text-center">
                <Crown className="mx-auto h-8 w-8 text-gold/60" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Sign in to enter the season, earn Season IQ and build your career record.
                </p>
                <Link to="/auth" className="mt-3 inline-block">
                  <GoldButton>Sign In to Compete</GoldButton>
                </Link>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
