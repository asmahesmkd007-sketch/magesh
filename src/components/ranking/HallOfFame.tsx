// =====================================================================
// HallOfFame — permanent record of finished seasons
// ---------------------------------------------------------------------
// A champions strip across the top (one card per completed season) and
// a full finishing table below, filterable by season. Reads frozen
// season_history rows only, so nothing here ever changes retroactively.
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, Loader2 } from "lucide-react";

import { Card } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { fetchHallOfFame, fetchHallOfFameChampions } from "@/lib/api/rankingClient";
import { rewardLabel } from "@/lib/ranking/tiers";

import { TierBadge } from "./TierBadge";

function medalClass(rank: number): string {
  if (rank === 1) return "text-gold";
  if (rank === 2) return "text-slate-300";
  if (rank === 3) return "text-amber-700";
  return "text-muted-foreground";
}

export function HallOfFame() {
  const [season, setSeason] = useState<number | null>(null);

  const champions = useQuery({
    queryKey: ["hof-champions"],
    queryFn: () => fetchHallOfFameChampions(24),
    staleTime: 5 * 60_000,
  });

  const table = useQuery({
    queryKey: ["hof-table", season],
    queryFn: () => fetchHallOfFame(season, 100),
    staleTime: 5 * 60_000,
  });

  const hasChampions = (champions.data?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Champions */}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Crown className="h-4 w-4 text-gold" aria-hidden="true" />
          <h3 className="font-display text-lg">Season Champions</h3>
        </div>

        {champions.isLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </div>
        ) : !hasChampions ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No season has finished yet — the first champion will be crowned when this season ends.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {champions.data!.map((c) => (
              <button
                key={c.season_number}
                type="button"
                onClick={() => setSeason(c.season_number)}
                className={`min-w-[150px] shrink-0 rounded-xl border p-3 text-left transition-colors ${
                  season === c.season_number
                    ? "border-gold/50 bg-gold/10"
                    : "border-white/10 bg-white/[0.02] hover:border-gold/30"
                }`}
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Season {c.season_number}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <UserAvatar displayName={c.username} avatarUrl={c.avatar_url} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground">{c.username}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {c.season_points.toLocaleString()} SP
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <TierBadge sp={c.season_points} rungId={null} size="chip" tierOnly />
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Finishing table */}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg">
            {season ? `Season ${season} final standings` : "All-time finishes"}
          </h3>
          {season !== null && (
            <button
              type="button"
              onClick={() => setSeason(null)}
              className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-gold"
            >
              Show all seasons
            </button>
          )}
        </div>

        {table.isLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </div>
        ) : (table.data?.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing recorded yet. Finished seasons appear here permanently.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-16 py-2 pl-1">Season</th>
                  <th className="w-12 py-2">#</th>
                  <th className="py-2">Player</th>
                  <th className="py-2">Tier</th>
                  <th className="py-2 text-right">SP</th>
                  <th className="hidden py-2 pr-1 sm:table-cell">Rewards</th>
                </tr>
              </thead>
              <tbody>
                {table.data!.map((row) => (
                  <tr
                    key={`${row.season_number}-${row.user_id}`}
                    className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="py-2 pl-1 tabular-nums text-muted-foreground">
                      S{row.season_number}
                    </td>
                    <td className={`py-2 font-display tabular-nums ${medalClass(row.final_rank)}`}>
                      {row.final_rank}
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
                        {row.country && (
                          <span className="text-[10px] text-muted-foreground">{row.country}</span>
                        )}
                      </Link>
                    </td>
                    <td className="py-2">
                      <TierBadge rungId={row.rung_id} sp={row.season_points} size="chip" />
                    </td>
                    <td className="py-2 text-right font-display tabular-nums text-gold">
                      {row.season_points.toLocaleString()}
                    </td>
                    <td className="hidden py-2 pr-1 sm:table-cell">
                      <span className="flex flex-wrap gap-1">
                        {row.rewards.slice(0, 3).map((code) => (
                          <span
                            key={code}
                            className="rounded-full border border-gold/20 bg-gold/5 px-1.5 py-0.5 text-[10px] text-gold/90"
                          >
                            {rewardLabel(code)}
                          </span>
                        ))}
                        {row.rewards.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{row.rewards.length - 3}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
