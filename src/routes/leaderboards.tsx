import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { useEffect, useMemo, useState, Fragment } from "react";
import { Crown, Loader2, Medal, Search, Trophy } from "lucide-react";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { UserAvatar } from "@/components/site/UserAvatar";
import { FriendButton } from "@/components/friends/FriendButton";
import { COUNTRIES, INDIA_DISTRICTS, INDIA_STATES_AND_UTS } from "@/data/geo";
import { useLeaderboard, type SortOption } from "@/hooks/useLeaderboard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { seo, breadcrumbLd, collectionPageLd } from "@/lib/seo";

export const Route = createFileRoute("/leaderboards")({
  head: () =>
    seo({
      title: "Chess Leaderboard — Global Chess Rankings | ChessOx",
      description:
        "See the ChessOx chess leaderboard: global chess rankings by rating, wins, win rate, puzzle rating and streaks, filtered worldwide or by country, state and district in India.",
      keywords: [
        "chess leaderboard",
        "chess ranking",
        "online chess ranking",
        "chess player rankings",
        "global chess leaderboard",
        "chess players India",
      ],
      path: "/leaderboards",
      jsonLd: [
        collectionPageLd({
          name: "Chess Leaderboard & Rankings — ChessOx",
          description:
            "Global and regional chess rankings on ChessOx, sortable by rating, wins, matches played, win rate, puzzle rating and win streak.",
          path: "/leaderboards",
          about: ["Chess leaderboard", "Chess ranking", "Chess player rankings"],
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Leaderboards", path: "/leaderboards" },
        ]),
      ],
    }),
  component: LB,
});

const SORT_LABELS: Record<SortOption, string> = {
  iq_desc: "Highest IQ",
  iq_asc: "Lowest IQ",
  rating_desc: "Highest Rating",
  newest: "Newest Players",
  oldest: "Oldest Players",
  wins_desc: "Most Wins",
  matches_desc: "Most Matches",
  winrate_desc: "Highest Win Rate",
  active_desc: "Recently Active",
  puzzle_desc: "Highest Puzzle Rating",
  streak_desc: "Longest Win Streak",
  score_desc: "Highest Comm. Score",
};

const RANK_STYLES = [
  "gradient-gold text-[#0B0D10]", // 1st — gold
  "bg-gradient-to-br from-slate-300 to-slate-400 text-[#0B0D10]", // 2nd — silver
  "bg-gradient-to-br from-amber-700 to-amber-800 text-white", // 3rd — bronze
];

function LB() {
  const [country, setCountry] = useState<string | null>(null); // null = Global
  const [state, setState] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("iq_desc");
  const [timeframe, setTimeframe] = useState<"all_time" | "today" | "week" | "month">("all_time");
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { user } = useAuth();
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myStats, setMyStats] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    async function fetchMyRank() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("iq_level, username, display_name, full_name, avatar_url, premium_active, title")
        .eq("id", user!.id)
        .single();

      if (profile) {
        setMyStats(profile);
        const { count } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gt("iq_level", profile.iq_level);
        setMyRank((count ?? 0) + 1);
      }
    }
    fetchMyRank();
  }, [user]);

  // Debounce free-text search so every keystroke doesn't refetch.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters = useMemo(
    () => ({ country, state, district, search, sort, timeframe, friendsOnly }),
    [country, state, district, search, sort, timeframe, friendsOnly],
  );
  const { entries, total, page, pageCount, setPage, loading } = useLeaderboard(filters);

  const districts = state ? (INDIA_DISTRICTS[state] ?? []) : [];

  function onCountryChange(v: string) {
    const next = v === "Global" ? null : v;
    setCountry(next);
    setState(null);
    setDistrict(null);
  }
  function onStateChange(v: string) {
    setState(v === "__all__" ? null : v);
    setDistrict(null);
  }

  let primaryLabel = "IQ Level";
  let primaryValue = (e: any) => e.iq_level;
  if (sort === "puzzle_desc") {
    primaryLabel = "Puzzle Rating";
    primaryValue = (e: any) => e.puzzle_rating;
  } else if (sort === "rating_desc") {
    primaryLabel = "Overall Rating";
    primaryValue = (e: any) => e.overall_rating;
  } else if (sort === "wins_desc") {
    primaryLabel = "Wins";
    primaryValue = (e: any) => e.wins;
  } else if (sort === "matches_desc") {
    primaryLabel = "Matches";
    primaryValue = (e: any) => e.total_matches;
  } else if (sort === "winrate_desc") {
    primaryLabel = "Win Rate";
    primaryValue = (e: any) => `${Number(e.win_rate).toFixed(1)}%`;
  } else if (sort === "streak_desc") {
    primaryLabel = "Win Streak";
    primaryValue = (e: any) => e.win_streak;
  } else if (sort === "score_desc") {
    primaryLabel = "Comm. Score";
    primaryValue = (e: any) => e.community_score;
  }

  return (
    <PageShell
      eyebrow="Hall of Kings"
      title="Leaderboards"
      subtitle="Where royalty is ranked, and legends are born."
    >
      {/* ── Filter bar ── */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by player name or username…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.02] py-2 pl-9 pr-3 text-sm outline-none focus:border-gold/40"
          />
        </div>

        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value as any)}
          className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
        >
          <option value="all_time">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/80 hover:border-gold/40">
          <input
            type="checkbox"
            checked={friendsOnly}
            onChange={(e) => setFriendsOnly(e.target.checked)}
            className="rounded border-white/10 bg-white/5 text-gold focus:ring-gold focus:ring-offset-0"
          />
          Friends
        </label>

        <select
          value={country ?? "Global"}
          onChange={(e) => onCountryChange(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
        >
          <option value="Global">🌍 Global</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={state ?? "__all__"}
          onChange={(e) => onStateChange(e.target.value)}
          disabled={country !== "India"}
          className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <option value="__all__">All States</option>
          {INDIA_STATES_AND_UTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={district ?? "__all__"}
          onChange={(e) => setDistrict(e.target.value === "__all__" ? null : e.target.value)}
          disabled={!state}
          className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <option value="__all__">All Districts</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {total.toLocaleString()} player{total === 1 ? "" : "s"} ranked
          {country ? ` · ${country}` : " · Global"}
          {state ? ` · ${state}` : ""}
          {district ? ` · ${district}` : ""}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
        >
          {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([v, label]) => (
            <option key={v} value={v}>
              Sort: {label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No players match these filters yet.
        </Card>
      ) : (
        <>
          {user && myStats && myRank !== null && sort === "iq_desc" && !search && (
            <div className="mb-6 overflow-hidden rounded-xl border border-gold/30 bg-gradient-to-r from-gold/10 via-gold/5 to-transparent p-4 shadow-[0_0_15px_rgba(212,175,55,0.1)] transition-all hover:border-gold/50">
              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <div className="flex items-center gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold/20 text-lg font-bold text-gold shadow-inner">
                    #{myRank}
                  </div>
                  <div>
                    <h3 className="font-display text-lg text-white">Your Global Standing</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <UserAvatar
                        avatarUrl={myStats.avatar_url}
                        displayName={myStats.full_name ?? myStats.display_name ?? myStats.username}
                        size="xs"
                      />
                      <span>{myStats.full_name ?? myStats.display_name ?? myStats.username}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <div className="text-xs uppercase tracking-widest text-gold/80">Current IQ</div>
                  <div className="font-display text-2xl text-gold">{myStats.iq_level}</div>
                </div>
              </div>
            </div>
          )}
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Rank</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="hidden px-4 py-3 text-left md:table-cell">Region</th>
                  <th className="px-4 py-3 text-right">{primaryLabel}</th>
                  <th className="px-4 py-3 text-right">Profile</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const rank = page * 25 + i;
                  const isTop3 = rank < 3;
                  return (
                    <Fragment key={e.id}>
                      <tr
                        onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                        className={`cursor-pointer border-t border-white/5 transition-colors hover:bg-white/[0.02] ${
                          isTop3 ? "bg-gold/[0.03]" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${
                                isTop3 ? RANK_STYLES[rank] : "bg-white/5"
                              }`}
                            >
                              {rank + 1}
                            </span>
                            {rank === 0 && <Crown className="h-4 w-4 text-gold" />}
                            {rank === 1 && <Trophy className="h-4 w-4 text-slate-300" />}
                            {rank === 2 && <Medal className="h-4 w-4 text-amber-700" />}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <UserAvatar
                                avatarUrl={e.avatar_url}
                                displayName={e.full_name ?? e.display_name ?? e.username}
                                size="sm"
                              />
                              {e.is_online && (
                                <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-[#0B0D10] bg-green-500" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <Link
                                  to="/profile"
                                  search={{ id: e.id }}
                                  className="flex items-center hover:text-gold"
                                  onClick={(ev) => ev.stopPropagation()}
                                >
                                  {e.title && (
                                    <span className="mr-1 font-bold text-red-500">{e.title}</span>
                                  )}
                                  {e.full_name ?? e.display_name ?? "Unknown"}
                                  <PremiumBadge
                                    premiumActive={e.premium_active}
                                    premiumExpiresAt={e.premium_expires_at}
                                  />
                                </Link>
                                <FriendButton
                                  targetUserId={e.id}
                                  targetName={e.full_name ?? e.display_name ?? e.username}
                                  className="h-6 w-6"
                                  compact
                                />
                              </div>
                              <div className="text-xs text-muted-foreground md:hidden">
                                {[e.country, e.state].filter(Boolean).join(", ")}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 text-left text-muted-foreground md:table-cell">
                          {[e.district, e.state, e.country].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-display text-gold">
                          {primaryValue(e)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground hover:border-gold/40 hover:text-gold">
                            {expandedId === e.id ? "Close" : "Stats"}
                          </button>
                        </td>
                      </tr>
                      {expandedId === e.id && (
                        <tr className="bg-black/20">
                          <td colSpan={6} className="p-0">
                            <div className="grid gap-4 border-b border-white/5 p-4 sm:grid-cols-2 lg:grid-cols-5">
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                  Ratings
                                </p>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Rapid</span>{" "}
                                  <span className="font-medium text-white">
                                    {e.rapid_rating || "Unrated"}
                                  </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Blitz</span>{" "}
                                  <span className="font-medium text-white">
                                    {e.blitz_rating || "Unrated"}
                                  </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Bullet</span>{" "}
                                  <span className="font-medium text-white">
                                    {e.bullet_rating || "Unrated"}
                                  </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Classical</span>{" "}
                                  <span className="font-medium text-white">
                                    {e.classical_rating || "Unrated"}
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                  Record
                                </p>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Matches</span>{" "}
                                  <span className="font-medium text-white">{e.total_matches}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Wins</span>{" "}
                                  <span className="font-medium text-green-400">{e.wins}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Losses</span>{" "}
                                  <span className="font-medium text-red-400">{e.losses}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Win Rate</span>{" "}
                                  <span className="font-medium text-gold">
                                    {Number(e.win_rate || 0).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                  Puzzles
                                </p>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Rating</span>{" "}
                                  <span className="font-medium text-white">{e.puzzle_rating}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Solved</span>{" "}
                                  <span className="font-medium text-white">{e.puzzle_solved}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Win Streak</span>{" "}
                                  <span className="font-medium text-amber-400">{e.win_streak}</span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                  Social
                                </p>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Followers</span>{" "}
                                  <span className="font-medium text-white">{e.followers}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Following</span>{" "}
                                  <span className="font-medium text-white">{e.following}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Comm. Score</span>{" "}
                                  <span className="font-medium text-gold">{e.community_score}</span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                  Progression
                                </p>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Level</span>{" "}
                                  <span className="font-medium text-white">Lv. {e.level || 1}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">XP</span>{" "}
                                  <span className="font-medium text-white">{e.xp || 0}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Achievements</span>{" "}
                                  <span className="font-medium text-white">
                                    {e.achievements_count || 0}
                                  </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Joined</span>{" "}
                                  <span className="font-medium text-white">
                                    {new Date(e.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {pageCount > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <GoldButton
                as="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="!px-4 !py-2 text-xs disabled:opacity-40"
              >
                Previous
              </GoldButton>
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {pageCount}
              </span>
              <GoldButton
                as="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="!px-4 !py-2 text-xs disabled:opacity-40"
              >
                Next
              </GoldButton>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
