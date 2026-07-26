import { memo } from "react";
import { Crown, Users, Coins, Trophy, Swords, Timer, Zap } from "lucide-react";
import { Card } from "@/components/site/Primitives";
import {
  prizePoolOf,
  roundLabel,
  timeClassOf,
  type TournamentRow,
} from "@/lib/api/tournamentClient";
import type { TournamentConnection } from "@/hooks/useTournament";
import { ConnectionBadge, Countdown, StatusBadge, AnimatedCoins } from "./bits";

// =====================================================================
// Top header: identity (logo/name/ID/type), the money (entry, pool),
// the pulse (status, round, countdown, players, live sync).
// =====================================================================
export const TournamentHeader = memo(function TournamentHeader({
  t,
  connection,
  offsetMs,
  spectators,
  onCountdownZero,
}: {
  t: TournamentRow;
  connection: TournamentConnection;
  offsetMs: number;
  spectators: number;
  onCountdownZero: () => void;
}) {
  const pool = prizePoolOf(t);
  const timeClass = timeClassOf(t.time_control);
  const TimeIcon = timeClass === "Bullet" ? Zap : Timer;

  const stat = (label: string, value: React.ReactNode, icon?: React.ReactNode) => (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 backdrop-blur">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {value}
      </div>
    </div>
  );

  return (
    <Card className="relative overflow-hidden p-6 md:p-8">
      {/* Animated ambient gradient */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60 ${
          t.status === "live"
            ? "from-emerald-500/25 via-teal-700/15 to-transparent"
            : t.status === "locked"
              ? "from-amber-500/25 via-orange-700/15 to-transparent"
              : "from-amber-500/25 via-rose-700/15 to-transparent"
        }`}
      />
      <div className="pointer-events-none absolute inset-0 mandala-bg opacity-40" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full hero-spotlight blur-3xl animate-pulse" />

      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Tournament "logo" */}
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl gradient-gold shadow-gold-glow md:h-16 md:w-16">
              <Crown className="h-7 w-7 text-background md:h-8 md:w-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-[11px] uppercase tracking-[0.3em] text-gold">
                  {t.format || "Knockout"} · {timeClass}
                </span>
                <StatusBadge status={t.status} />
              </div>
              <h1 className="mt-1 font-display text-3xl leading-tight md:text-4xl">{t.name}</h1>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground/60">
                TR-{t.id.slice(0, 8).toUpperCase()}
              </div>
            </div>
          </div>
          <ConnectionBadge connection={connection} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {stat(
            "Time Control",
            <>
              {timeClass} · {t.time_control}
            </>,
            <TimeIcon className="h-3.5 w-3.5 text-gold" />,
          )}
          {stat(
            "Entry",
            t.entry_fee_coins > 0 ? (
              <span className="text-gold">{t.entry_fee_coins} coins</span>
            ) : (
              <span className="text-emerald">Free</span>
            ),
            <Coins className="h-3.5 w-3.5 text-gold" />,
          )}
          {stat(
            "Prize Pool",
            <span className="text-gold">
              <AnimatedCoins value={pool} /> coins
            </span>,
            <Trophy className="h-3.5 w-3.5 text-gold" />,
          )}
          {stat(
            "Players",
            <>
              {t.player_count}/{t.max_players}
              {spectators > 0 && (
                <span className="text-[11px] text-muted-foreground">· {spectators} here</span>
              )}
            </>,
            <Users className="h-3.5 w-3.5 text-muted-foreground" />,
          )}
          {stat(
            "Round",
            t.status === "live" && t.current_round > 0 ? (
              <span className="text-emerald">
                {roundLabel(t.current_round, t.total_rounds)} ({t.current_round}/{t.total_rounds})
              </span>
            ) : t.status === "completed" ? (
              "Finished"
            ) : (
              "—"
            ),
            <Swords className="h-3.5 w-3.5 text-muted-foreground" />,
          )}
          {stat(
            t.status === "locked" ? "Starts In" : "Status",
            t.status === "locked" ? (
              <Countdown
                target={t.starts_at}
                offsetMs={offsetMs}
                onZero={onCountdownZero}
                className="text-amber-400"
              />
            ) : t.status === "upcoming" ? (
              <span className="text-muted-foreground">
                {Math.max(0, t.max_players - t.player_count)} seats left
              </span>
            ) : t.status === "live" ? (
              <span className="flex items-center gap-1.5 text-emerald">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" /> In progress
              </span>
            ) : (
              <span className="capitalize text-muted-foreground">{t.status}</span>
            ),
          )}
        </div>
      </div>
    </Card>
  );
});
