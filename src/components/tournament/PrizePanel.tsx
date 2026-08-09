import { memo } from "react";
import { Trophy, Coins, Award, Medal } from "lucide-react";
import { Card, SectionTitle } from "@/components/site/Primitives";
import { prizePoolOf, type TournamentRow } from "@/lib/api/tournamentClient";
import { AnimatedCoins } from "./bits";

// =====================================================================
// Prize breakdown with animated coin counts. Shows the gross pool,
// platform fee and each paid place; winners get highlighted once the
// tournament completes.
// =====================================================================
export const PrizePanel = memo(function PrizePanel({
  t,
  winners,
}: {
  t: TournamentRow;
  /** username per place once known: [1st, 2nd, 3rd, 4th] */
  winners: (string | null)[];
}) {
  const pool = prizePoolOf(t);
  const gross = t.entry_fee_coins * t.max_players;
  const fee = Math.max(0, gross - pool);

  const places: { label: string; icon: React.ReactNode; amount: number; name: string | null }[] = [
    { label: "Winner", icon: <Trophy className="h-5 w-5 text-gold" />, amount: t.prize_1st, name: winners[0] },
    { label: "Runner-up", icon: <Award className="h-5 w-5 text-slate-300" />, amount: t.prize_2nd, name: winners[1] },
    { label: "Third", icon: <Award className="h-5 w-5 text-amber-600" />, amount: t.prize_3rd, name: winners[2] },
    { label: "Fourth", icon: <Medal className="h-5 w-5 text-muted-foreground" />, amount: t.prize_4th, name: winners[3] },
  ].filter((p) => p.amount > 0);

  return (
    <Card className="corner-ornaments p-6">
      <SectionTitle
        kicker="The Spoils"
        title="Prizes"
        action={<Trophy className="h-5 w-5 text-gold/50" />}
      />
      <div className="mb-4 rounded-2xl border border-gold/20 bg-gold/5 p-4 text-center">
        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Total Prize Pool
        </div>
        <div className="mt-1 flex items-center justify-center gap-2 font-display text-3xl text-gradient-gold">
          <Coins className="h-6 w-6 text-gold" />
          <AnimatedCoins value={pool} />
        </div>
        {gross > 0 && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            {gross} coins collected · {fee} coins platform fee (
            {gross > 0 ? Math.round((fee / gross) * 100) : 0}%)
          </div>
        )}
      </div>

      <div className="space-y-2">
        {places.map((p) => (
          <div
            key={p.label}
            className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
              p.name ? "border-gold/30 bg-gold/10" : "border-white/5 bg-white/[0.02]"
            }`}
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center justify-center">{p.icon}</span>
              <div>
                <div className={p.name ? "text-gold" : ""}>{p.label}</div>
                {p.name && <div className="text-[11px] text-muted-foreground">{p.name}</div>}
              </div>
            </div>
            <div className="flex items-center gap-1 font-stat text-gold">
              <AnimatedCoins value={p.amount} />
              <span className="text-[11px] text-muted-foreground">coins</span>
            </div>
          </div>
        ))}
        {places.length === 0 && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            Glory only — no coin prizes in this event.
          </p>
        )}
      </div>

      {t.prizes_distributed && (
        <div className="mt-3 rounded-lg border border-emerald/25 bg-emerald/5 px-3 py-2 text-center text-xs text-emerald">
          ✓ Prizes credited to winners&apos; wallets
        </div>
      )}
    </Card>
  );
});
