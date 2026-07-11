import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { useEffect, useMemo, useState, Fragment } from "react";
import { Crown, Loader2, Medal, Search, Trophy } from "lucide-react";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { UserAvatar } from "@/components/site/UserAvatar";
import { COUNTRIES, INDIA_DISTRICTS, INDIA_STATES_AND_UTS } from "@/data/geo";
import { useLeaderboard, type SortOption } from "@/hooks/useLeaderboard";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({ meta: [{ title: "Leaderboards — ChessOx" }] }),
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce free-text search so every keystroke doesn't refetch.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters = useMemo(
    () => ({ country, state, district, search, sort }),
    [country, state, district, search, sort],
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

  return (
    <PageShell
      eyebrow="Hall of Kings"
      title="Leaderboards"
      subtitle="Where royalty is ranked, and legends are born."
    >
      {/* ── Filter bar ── */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          value={country ?? "Global"}
          onChange={(e) => onCountryChange(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
        >
          <option value="Global">🌍 Global (All Players)</option>
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
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Rank</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="hidden px-4 py-3 text-left md:table-cell">Region</th>
                  <th className="px-4 py-3 text-right">IQ Level</th>
                  <th className="hidden px-4 py-3 text-right md:table-cell">Rating Pts</th>
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
                            <UserAvatar avatarUrl={e.avatar_url} displayName={e.display_name ?? e.username} size="sm" />
                            {e.is_online && (
                              <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-[#0B0D10] bg-green-500" />
                            )}
                          </div>
                          <div>
                            <Link
                              to="/profile"
                              search={{ id: e.id }}
                              className="flex items-center hover:text-gold"
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              {e.title && <span className="mr-1 font-bold text-red-500">{e.title}</span>}
                              {e.display_name ?? e.username ?? "Unknown"}
                              <PremiumBadge
                                premiumActive={e.premium_active}
                                premiumExpiresAt={e.premium_expires_at}
                              />
                            </Link>
                            <div className="text-xs text-muted-foreground md:hidden">
                              {[e.country, e.state].filter(Boolean).join(", ")}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-left text-muted-foreground md:table-cell">
                        {[e.district, e.state, e.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-display text-gold">{e.iq_level}</td>
                      <td className="hidden px-4 py-3 text-right text-muted-foreground md:table-cell">
                        {e.community_score}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground hover:border-gold/40 hover:text-gold"
                        >
                          {expandedId === e.id ? "Close" : "Stats"}
                        </button>
                      </td>
                    </tr>
                    {expandedId === e.id && (
                      <tr className="bg-black/20">
                        <td colSpan={6} className="p-0">
                          <div className="grid gap-4 border-b border-white/5 p-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wider">Ratings</p>
                              <div className="flex justify-between text-sm"><span className="text-white/60">Rapid</span> <span className="font-medium text-white">{e.rapid_rating || "Unrated"}</span></div>
                              <div className="flex justify-between text-sm"><span className="text-white/60">Blitz</span> <span className="font-medium text-white">{e.blitz_rating || "Unrated"}</span></div>
                              <div className="flex justify-between text-sm"><span className="text-white/60">Bullet</span> <span className="font-medium text-white">{e.bullet_rating || "Unrated"}</span></div>
                              <div className="flex justify-between text-sm"><span className="text-white/60">Classical</span> <span className="font-medium text-white">{e.classical_rating || "Unrated"}</span></div>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wider">Record</p>
                              <div className="flex justify-between text-sm"><span className="text-white/60">Matches</span> <span className="font-medium text-white">{e.total_matches}</span></div>
                              <div className="flex justify-between text-sm"><span className="text-white/60">Wins</span> <span className="font-medium text-green-400">{e.wins}</span></div>
                              <div className="flex justify-between text-sm"><span className="text-white/60">Losses</span> <span className="font-medium text-red-400">{e.losses}</span></div>
                              <div className="flex justify-between text-sm"><span className="text-white/60">Win Rate</span> <span className="font-medium text-gold">{Number(e.win_rate || 0).toFixed(1)}%</span></div>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wider">Progression</p>
                              <div className="flex justify-between text-sm"><span className="text-white/60">Level</span> <span className="font-medium text-white">Lv. {e.level || 1}</span></div>
                              <div className="flex justify-between text-sm"><span className="text-white/60">XP</span> <span className="font-medium text-white">{e.xp || 0}</span></div>
                              <div className="flex justify-between text-sm"><span className="text-white/60">Achievements</span> <span className="font-medium text-white">{e.achievements_count || 0}</span></div>
                              <div className="flex justify-between text-sm"><span className="text-white/60">Joined</span> <span className="font-medium text-white">{new Date(e.created_at).toLocaleDateString()}</span></div>
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
