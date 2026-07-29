// =====================================================================
// RankCard — a player's standing in both ranking systems
// ---------------------------------------------------------------------
// Left: permanent ELO (rating, band, and placement at every geographic
// scope). Right: the season ladder (rung badge, SP, progress to the next
// rung, season rank). Used on the profile page and the seasons page.
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";

import { Card } from "@/components/site/Primitives";
import { fetchPlayerRankingCard } from "@/lib/api/rankingClient";
import { bandOf, TIME_CLASS_LABELS, winRate, type TimeClass } from "@/lib/ranking/elo";
import { nextRung, rungById, rungProgress, spToNextRung } from "@/lib/ranking/tiers";

import { TierBadge } from "./TierBadge";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-base tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function ordinal(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n.toLocaleString()}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** ▲/▼ against the previous leaderboard refresh. */
function RankTrend({ rank, prev }: { rank: number | null; prev: number | null }) {
  if (rank === null || prev === null || prev === rank) return null;
  const up = rank < prev; // a smaller rank number is better
  const delta = Math.abs(prev - rank);
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] ${up ? "text-emerald-400" : "text-red-400"}`}
      title={`${up ? "Up" : "Down"} ${delta} since the last refresh`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {delta}
    </span>
  );
}

export function RankCard({
  userId,
  timeClass = "rapid",
}: {
  userId: string;
  timeClass?: TimeClass;
}) {
  const query = useQuery({
    queryKey: ["ranking-card", userId, timeClass],
    queryFn: () => fetchPlayerRankingCard(userId, timeClass),
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return (
      <Card className="grid place-items-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-gold" />
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Ranking information is unavailable right now.
      </Card>
    );
  }

  const { elo, season, career } = query.data;
  const rung = rungById(season?.rung_id);
  const sp = season?.season_points ?? 0;
  const next = nextRung(sp);
  const toNext = spToNextRung(sp);
  const progress = rungProgress(sp);
  const band = elo ? bandOf(elo.rating) : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Permanent ELO */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-gold/70">Permanent</div>
            <h3 className="font-display text-xl">ELO Rating</h3>
          </div>
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">
            {TIME_CLASS_LABELS[timeClass]}
          </span>
        </div>

        {elo ? (
          <>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-4xl text-gold tabular-nums">{elo.rating}</span>
              {band && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${band.badge} ${band.text}`}
                >
                  {band.name}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Peak {elo.peak_rating} · {elo.games_played} rated games ·{" "}
              {winRate(elo.wins, elo.losses, elo.draws) ?? "—"}% score
            </p>

            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/5 pt-3">
              <Stat label="Global" value={ordinal(elo.global_rank)} />
              <Stat label="Country" value={ordinal(elo.country_rank)} />
              <Stat label="State" value={ordinal(elo.state_rank)} />
              <Stat label="District" value={ordinal(elo.district_rank)} />
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No rated {TIME_CLASS_LABELS[timeClass].toLowerCase()} games yet — play one to enter the
            ELO ladder.
          </p>
        )}
      </Card>

      {/* Season Points */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-gold/70">This season</div>
            <h3 className="font-display text-xl">Season Points</h3>
          </div>
          {season && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">
              {ordinal(season.rank)}
              <RankTrend rank={season.rank} prev={season.prev_rank} />
            </span>
          )}
        </div>

        {season ? (
          season.banned ? (
            <p className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-4 text-center text-sm text-red-400">
              Removed from this season&rsquo;s ranking pending a fair-play review.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <TierBadge rungId={season.rung_id} size="md" />
                <span className="font-display text-3xl text-gold tabular-nums">
                  {sp.toLocaleString()}
                  <span className="ml-1 text-sm text-muted-foreground">SP</span>
                </span>
              </div>

              {/* Progress to the next rung */}
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>{rung?.label ?? "Unranked"}</span>
                  <span>{next ? `${toNext} SP to ${next.label}` : "Top of the ladder"}</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${rung?.tier.bar ?? "bg-gold"}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/5 pt-3">
                <Stat label="Games" value={season.games_played} />
                <Stat label="Won" value={season.wins} />
                <Stat
                  label="Score"
                  value={`${winRate(season.wins, season.losses, season.draws) ?? "—"}%`}
                />
                <Stat label="Streak" value={season.best_win_streak} />
              </div>
            </>
          )
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            You haven&rsquo;t played a rated game this season yet.
          </p>
        )}

        <p className="mt-3 border-t border-white/5 pt-2 text-center text-[11px] text-muted-foreground">
          Career: best finish {ordinal(career.best_season_rank)}
          {career.best_season_number ? ` (Season ${career.best_season_number})` : ""} ·{" "}
          {career.seasons_played} seasons · {career.seasons_won} won
        </p>
      </Card>
    </div>
  );
}
