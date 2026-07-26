import { memo } from "react";
import { Card, SectionTitle } from "@/components/site/Primitives";
import {
  prizePoolOf,
  timeClassOf,
  type TournamentMatch,
  type TournamentRow,
} from "@/lib/api/tournamentClient";
import { fmtDateTime } from "./bits";

// =====================================================================
// Tournament information card: every static fact about the event.
// =====================================================================
export const InfoCard = memo(function InfoCard({
  t,
  matches,
}: {
  t: TournamentRow;
  matches: TournamentMatch[];
}) {
  const pool = prizePoolOf(t);
  const grossPool = t.entry_fee_coins * t.max_players;
  const feePct =
    grossPool > 0 ? Math.round(((grossPool - pool) / grossPool) * 100) : (t.platform_fee_pct ?? 0);
  const totalMatches = matches.length;
  const liveMatches = matches.filter((m) => m.status === "active").length;
  const remaining =
    t.status === "live"
      ? new Set(
          matches
            .filter((m) => m.round === t.current_round)
            .flatMap((m) =>
              m.status === "finished" || m.status === "bye"
                ? [m.winner_id]
                : [m.player1_id, m.player2_id],
            )
            .filter(Boolean),
        ).size
      : null;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );

  return (
    <Card className="p-6">
      <SectionTitle kicker="Information" title="Details" />
      {t.description && (
        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{t.description}</p>
      )}
      <div className="divide-y divide-white/5">
        {row("Format", <span className="capitalize">{t.format || "Knockout"}</span>)}
        {row("Time Control", `${timeClassOf(t.time_control)} · ${t.time_control}`)}
        {row(
          "Entry Fee",
          t.entry_fee_coins > 0 ? (
            <span className="text-gold">{t.entry_fee_coins} coins</span>
          ) : (
            <span className="text-emerald">Free</span>
          ),
        )}
        {row("Players", `${t.player_count} / ${t.max_players}`)}
        {row("Min Players", String(Math.max(t.min_players ?? 2, 2)))}
        {row("Prize Pool", <span className="text-gold">{pool} coins</span>)}
        {row("Platform Fee", grossPool > 0 ? `${feePct}%` : "—")}
        {row("Created", fmtDateTime(t.created_at))}
        {row("Start Time", t.starts_at ? fmtDateTime(t.starts_at) : "When all seats fill")}
        {t.ends_at && row("End Time", fmtDateTime(t.ends_at))}
        {t.starts_at &&
          t.ends_at &&
          row(
            "Duration",
            `${Math.max(1, Math.round((new Date(t.ends_at).getTime() - new Date(t.starts_at).getTime()) / 60000))} min`,
          )}
        {t.total_rounds > 0 && row("Total Rounds", String(t.total_rounds))}
        {totalMatches > 0 && row("Matches", `${totalMatches} total · ${liveMatches} live`)}
        {remaining != null && row("Players Remaining", String(remaining))}
      </div>

      <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground">
        <span className="text-gold">Rules:</span> Single-elimination knockout. Win to advance —
        losers are out. Drawn games advance the player with more time left on the clock. Skipping
        your match forfeits it on time. Prizes are credited to wallets automatically when the final
        ends.
      </div>
    </Card>
  );
});
