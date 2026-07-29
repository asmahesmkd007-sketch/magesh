// =====================================================================
// RankingLeaderboard — one board, two systems, five scopes
// ---------------------------------------------------------------------
// Toggles between the permanent ELO ladder and the current season's SP
// ladder, each sliceable by Global / Country / State / District /
// Friends. Geographic scopes default to the viewer's own location, so a
// player lands on a board they are actually on.
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Search, TrendingDown, TrendingUp } from "lucide-react";

import { Card } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import {
  fetchEloLeaderboard,
  fetchSpLeaderboard,
  type RankingScope,
} from "@/lib/api/rankingClient";
import { RANKED_TIME_CLASSES, TIME_CLASS_LABELS, bandOf, type TimeClass } from "@/lib/ranking/elo";

import { TierBadge } from "./TierBadge";

export type ViewerLocation = {
  userId?: string | null;
  country?: string | null;
  state?: string | null;
  district?: string | null;
};

type System = "elo" | "sp";

const SCOPES: { id: RankingScope; label: string }[] = [
  { id: "global", label: "Global" },
  { id: "country", label: "Country" },
  { id: "state", label: "State" },
  { id: "district", label: "District" },
  { id: "friends", label: "Friends" },
];

function medalClass(rank: number): string {
  if (rank === 1) return "text-gold";
  if (rank === 2) return "text-slate-300";
  if (rank === 3) return "text-amber-700";
  return "text-muted-foreground";
}

function Trend({ rank, prev }: { rank: number; prev: number | null }) {
  if (prev === null || prev === rank) return null;
  const up = rank < prev;
  return up ? (
    <TrendingUp className="h-3 w-3 text-emerald-400" aria-label={`Up from ${prev}`} />
  ) : (
    <TrendingDown className="h-3 w-3 text-red-400" aria-label={`Down from ${prev}`} />
  );
}

export function RankingLeaderboard({ viewer }: { viewer: ViewerLocation }) {
  const [system, setSystem] = useState<System>("sp");
  const [scope, setScope] = useState<RankingScope>("global");
  const [timeClass, setTimeClass] = useState<TimeClass>("rapid");
  const [search, setSearch] = useState("");

  const filters = useMemo(
    () => ({
      country: viewer.country ?? null,
      state: viewer.state ?? null,
      district: viewer.district ?? null,
      viewer: viewer.userId ?? null,
      search,
      limit: 50,
    }),
    [viewer, search],
  );

  // A geographic scope needs the matching location on the viewer's
  // profile; friends needs a session. Explain rather than show an
  // empty board.
  const blocked: string | null =
    scope === "friends" && !viewer.userId
      ? "Sign in to compare with your friends."
      : scope === "country" && !viewer.country
        ? "Add your country in profile settings to see this board."
        : scope === "state" && !viewer.state
          ? "Add your state in profile settings to see this board."
          : scope === "district" && !viewer.district
            ? "Add your district in profile settings to see this board."
            : null;

  const eloQuery = useQuery({
    queryKey: ["elo-leaderboard", timeClass, scope, filters],
    queryFn: () => fetchEloLeaderboard(timeClass, scope, filters),
    enabled: system === "elo" && !blocked,
    staleTime: 30_000,
  });

  const spQuery = useQuery({
    queryKey: ["sp-leaderboard", scope, filters],
    queryFn: () => fetchSpLeaderboard(scope, filters),
    enabled: system === "sp" && !blocked,
    staleTime: 30_000,
  });

  const active = system === "elo" ? eloQuery : spQuery;

  return (
    <Card className="p-4 sm:p-5">
      {/* System switch */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-white/10" role="tablist">
          {(
            [
              ["sp", "Season Points"],
              ["elo", "ELO Rating"],
            ] as [System, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={system === id}
              onClick={() => setSystem(id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                system === id ? "bg-gold/20 text-gold" : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {system === "elo" && (
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            {RANKED_TIME_CLASSES.map((tc) => (
              <button
                key={tc}
                type="button"
                onClick={() => setTimeClass(tc)}
                aria-pressed={timeClass === tc}
                className={`px-2.5 py-1.5 text-[11px] transition-colors ${
                  timeClass === tc
                    ? "bg-gold/20 text-gold"
                    : "text-muted-foreground hover:bg-white/5"
                }`}
              >
                {TIME_CLASS_LABELS[tc]}
              </button>
            ))}
          </div>
        )}

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a player…"
            className="w-40 rounded-lg border border-white/10 bg-white/[0.02] py-1.5 pl-7 pr-2 text-xs outline-none focus:border-gold/40 sm:w-52"
            aria-label="Search players"
          />
        </div>
      </div>

      {/* Scope switch */}
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Ranking scope">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={scope === s.id}
            onClick={() => setScope(s.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
              scope === s.id ? "bg-gold/20 text-gold" : "text-muted-foreground hover:bg-white/5"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {blocked ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{blocked}</p>
      ) : active.isLoading ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
        </div>
      ) : active.isError ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          The leaderboard could not be loaded. Try again in a moment.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="w-12 py-2 pl-1">#</th>
                <th className="py-2">Player</th>
                <th className="py-2">{system === "sp" ? "Tier" : "Band"}</th>
                <th className="py-2 text-right">{system === "sp" ? "SP" : "Rating"}</th>
                <th className="hidden py-2 text-right sm:table-cell">Games</th>
                <th className="hidden py-2 pr-1 text-right sm:table-cell">Score</th>
              </tr>
            </thead>
            <tbody>
              {system === "sp"
                ? (spQuery.data ?? []).map((row) => (
                    <tr
                      key={row.user_id}
                      className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${
                        row.user_id === viewer.userId ? "bg-gold/[0.06]" : ""
                      }`}
                    >
                      <td className={`py-2 pl-1 font-display tabular-nums ${medalClass(row.rank)}`}>
                        <span className="flex items-center gap-1">
                          {row.rank}
                          <Trend rank={row.rank} prev={row.prev_rank} />
                        </span>
                      </td>
                      <td className="py-2">
                        <Link
                          to="/u/$username"
                          params={{ username: row.username }}
                          className="flex items-center gap-2 hover:text-gold"
                        >
                          <UserAvatar
                            displayName={row.full_name ?? row.username}
                            avatarUrl={row.avatar_url}
                            size="xs"
                          />
                          <span className="truncate">{row.username}</span>
                        </Link>
                      </td>
                      <td className="py-2">
                        <TierBadge rungId={row.rung_id} size="chip" />
                      </td>
                      <td className="py-2 text-right font-display tabular-nums text-gold">
                        {row.season_points.toLocaleString()}
                      </td>
                      <td className="hidden py-2 text-right tabular-nums text-muted-foreground sm:table-cell">
                        {row.games_played}
                      </td>
                      <td className="hidden py-2 pr-1 text-right tabular-nums text-muted-foreground sm:table-cell">
                        {row.win_rate === null ? "—" : `${row.win_rate}%`}
                      </td>
                    </tr>
                  ))
                : (eloQuery.data ?? []).map((row) => {
                    const band = bandOf(row.rating);
                    return (
                      <tr
                        key={row.user_id}
                        className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${
                          row.user_id === viewer.userId ? "bg-gold/[0.06]" : ""
                        }`}
                      >
                        <td
                          className={`py-2 pl-1 font-display tabular-nums ${medalClass(row.rank)}`}
                        >
                          {row.rank}
                        </td>
                        <td className="py-2">
                          <Link
                            to="/u/$username"
                            params={{ username: row.username }}
                            className="flex items-center gap-2 hover:text-gold"
                          >
                            <UserAvatar
                              displayName={row.full_name ?? row.username}
                              avatarUrl={row.avatar_url}
                              size="xs"
                            />
                            <span className="truncate">{row.username}</span>
                          </Link>
                        </td>
                        <td className="py-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] ${band.badge} ${band.text}`}
                          >
                            {band.name}
                          </span>
                        </td>
                        <td className="py-2 text-right font-display tabular-nums text-gold">
                          {row.rating}
                        </td>
                        <td className="hidden py-2 text-right tabular-nums text-muted-foreground sm:table-cell">
                          {row.games_played}
                        </td>
                        <td className="hidden py-2 pr-1 text-right tabular-nums text-muted-foreground sm:table-cell">
                          {row.win_rate === null ? "—" : `${row.win_rate}%`}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>

          {active.data && active.data.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {search
                ? `No players match “${search}”.`
                : scope === "friends"
                  ? "None of your friends are on this board yet."
                  : "No ranked players in this scope yet — be the first."}
            </p>
          )}
        </div>
      )}

      <p className="mt-3 border-t border-white/5 pt-2 text-[10px] text-muted-foreground">
        {system === "sp"
          ? "Season Points reset every season. Higher tiers earn less per win and lose more per defeat."
          : "ELO measures long-term strength and never resets. Players need 5+ rated games to appear."}
      </p>
    </Card>
  );
}
