// =====================================================================
// SeasonRules — the ranking system, explained to players
// ---------------------------------------------------------------------
// Renders the LIVE configuration (season_config) rather than hardcoded
// copy, so if an admin retunes the SP rates or the ladder the published
// rules change with them. Falls back to the shipped defaults in
// lib/ranking/tiers.ts when the config table cannot be read.
// =====================================================================
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/site/Primitives";
import { fetchSeasonConfig } from "@/lib/api/rankingClient";
import {
  LADDER,
  PENALTIES,
  PENALTY_LABELS,
  TIERS,
  UPSET_BONUS,
  type PenaltyKind,
} from "@/lib/ranking/tiers";

import { TierBadge } from "./TierBadge";
import { SeasonShield } from "./SeasonShield";

export function SeasonRules() {
  const config = useQuery({
    queryKey: ["season-config"],
    queryFn: fetchSeasonConfig,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const rates = config.data?.sp_rates;
  const upset = config.data?.upset_bonus;
  const penalties = config.data?.penalties;
  const ladder = config.data?.ladder;

  const rateFor = (code: string) => {
    const live = rates?.[code];
    if (live) return live;
    const fallback = TIERS.find((t) => t.code === code);
    return fallback ? fallback.rates : { win: 0, draw: 0, loss: 0 };
  };

  const minSpFor = (id: string) =>
    ladder?.find((r) => r.id === id)?.min ?? LADDER.find((r) => r.id === id)?.minSp ?? 0;

  return (
    <div className="space-y-4">
      {/* The two systems */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-display text-lg text-gold">ELO Rating</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Answers <em>&ldquo;who is the strongest player?&rdquo;</em> Your rating moves after
            every rated game based on the result and how strong your opponent was — beating a
            higher-rated player gains more than beating a weaker one. It is tracked separately for
            each time control and <strong>never resets</strong>.
          </p>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            <li>• New players move fastest (their first 15 games settle them quickly).</li>
            <li>• Ratings above 2400 move slowly, keeping the top of the ladder stable.</li>
            <li>• 5 rated games are needed before you appear on a public board.</li>
          </ul>
        </Card>

        <Card className="p-5">
          <h3 className="font-display text-lg text-gold">Season Points</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Answers <em>&ldquo;who is the best player this season?&rdquo;</em> Every season lasts a
            month and everyone <strong>starts from zero</strong>. Points come from rated games at
            rates that get harsher the higher you climb, so holding a top tier takes a genuinely
            winning record.
          </p>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            <li>• Rankings lock when the season ends and rewards are granted automatically.</li>
            <li>• Season results are frozen into the Hall of Fame permanently.</li>
            <li>• A new season starts immediately afterwards.</li>
          </ul>
        </Card>
      </div>

      {/* Earn table */}
      <Card className="p-5">
        <h3 className="mb-1 font-display text-lg">Points per game</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Your <em>current</em> tier decides what a game is worth.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Tier</th>
                <th className="py-2 text-right">Win</th>
                <th className="py-2 text-right">Draw</th>
                <th className="py-2 text-right">Loss</th>
                <th className="py-2 text-right">Entry</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => {
                const r = rateFor(t.code);
                return (
                  <tr key={t.code} className="border-b border-white/5">
                    <td className="py-2">
                      <TierBadge sp={minSpFor(`${t.code}_3`)} size="chip" tierOnly />
                    </td>
                    <td className="py-2 text-right tabular-nums text-emerald-400">+{r.win}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {r.draw >= 0 ? "+" : ""}
                      {r.draw}
                    </td>
                    <td className="py-2 text-right tabular-nums text-red-400">{r.loss}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {minSpFor(`${t.code}_3`).toLocaleString()} SP
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Upset bonus */}
        <Card className="p-5">
          <h3 className="mb-1 font-display text-lg">Beating a higher tier</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Extra points on top of the win, based on how far above you the opponent stood.
          </p>
          <div className="space-y-1.5 text-sm">
            {[1, 2, 3].map((gap) => (
              <div key={gap} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {gap} tier{gap > 1 ? "s" : ""} above{gap === 3 ? " or more" : ""}
                </span>
                <span className="font-display tabular-nums text-emerald-400">
                  +{upset?.[String(gap)] ?? UPSET_BONUS[gap]} SP
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Penalties */}
        <Card className="p-5">
          <h3 className="mb-1 font-display text-lg">Conduct penalties</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Applied on top of the game result. Fair-play violations also remove you from the season
            ranking pending review.
          </p>
          <div className="space-y-1.5 text-sm">
            {(Object.keys(PENALTIES) as PenaltyKind[]).map((kind) => (
              <div key={kind} className="flex items-center justify-between">
                <span className="text-muted-foreground">{PENALTY_LABELS[kind]}</span>
                <span className="font-display tabular-nums text-red-400">
                  {penalties?.[kind] ?? PENALTIES[kind]} SP
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Ladder */}
      <Card className="p-5">
        <h3 className="mb-1 font-display text-lg">The ladder</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Seven tiers, three divisions each. You are promoted the moment you cross a threshold; you
          are only demoted once you fall a little way below it, so a single loss never costs you a
          rank.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LADDER.map((rung) => {
            const min = minSpFor(rung.id);
            const nextMin = rung.nextSp != null ? (ladder?.find((r) => r.id === LADDER[rung.index + 1]?.id)?.min ?? rung.nextSp) : null;
            const rangeStr = nextMin != null ? `${min.toLocaleString()}–${(nextMin - 1).toLocaleString()} SP` : `${min.toLocaleString()}+ SP`;
            return (
              <div
                key={rung.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-2.5 transition-colors hover:border-gold/25"
              >
                <div className="flex items-center gap-2">
                  <SeasonShield sp={min} rungId={rung.id} size="xs" variant="icon" />
                  <span className={`text-xs font-semibold ${rung.tier.text}`}>{rung.label}</span>
                </div>
                <span className="font-mono text-[11px] font-medium text-gold/90">
                  {rangeStr}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Fair play */}
      <Card className="p-5">
        <h3 className="mb-1 font-display text-lg">Keeping it fair</h3>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            • <strong className="text-foreground">Farming guard</strong> — after several games
            against the same opponent in one season, further wins pay a reduced amount.
          </li>
          <li>
            • <strong className="text-foreground">Daily cap</strong> — there is a ceiling on points
            earned per day, so the ladder rewards quality, not marathon sessions.
          </li>
          <li>
            • <strong className="text-foreground">Short games</strong> — games that end in a handful
            of moves award nothing.
          </li>
          <li>
            • <strong className="text-foreground">Engine assistance</strong> — detected cheating
            costs points, removes the account from the season board, and triggers a manual review.
          </li>
        </ul>
      </Card>
    </div>
  );
}
