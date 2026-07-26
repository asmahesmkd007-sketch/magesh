import { memo, useEffect, useState } from "react";
import {
  Activity,
  UserPlus,
  UserMinus,
  Lock,
  Play,
  Flag,
  Swords,
  Coins,
  Trophy,
  Ban,
  FastForward,
} from "lucide-react";
import { Card, SectionTitle } from "@/components/site/Primitives";
import type { TournamentActivityItem } from "@/lib/api/tournamentClient";
import { fmtTimeAgo } from "./bits";

// =====================================================================
// Live activity feed — every engine event lands here in realtime
// (joins, leaves, lock, rounds, results, prizes, completion).
// =====================================================================
const KIND_ICON: Record<string, { icon: typeof Activity; cls: string }> = {
  player_joined: { icon: UserPlus, cls: "text-emerald" },
  player_left: { icon: UserMinus, cls: "text-rose-400" },
  tournament_locked: { icon: Lock, cls: "text-amber-400" },
  tournament_live: { icon: Play, cls: "text-emerald" },
  round_started: { icon: Play, cls: "text-gold" },
  round_finished: { icon: Flag, cls: "text-gold" },
  match_finished: { icon: Swords, cls: "text-foreground" },
  bye: { icon: FastForward, cls: "text-muted-foreground" },
  prize_distributed: { icon: Coins, cls: "text-gold" },
  tournament_finished: { icon: Trophy, cls: "text-gold" },
  tournament_cancelled: { icon: Ban, cls: "text-rose-400" },
};

export const ActivityFeed = memo(function ActivityFeed({
  items,
}: {
  items: TournamentActivityItem[];
}) {
  // Re-render every 30s so "2m ago" stays honest without any events.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="p-6">
      <SectionTitle
        kicker="Live Feed"
        title="Activity"
        action={<Activity className="h-5 w-5 text-gold/50" />}
      />
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Quiet for now — activity appears here the moment something happens.
        </p>
      ) : (
        <div className="max-h-[380px] space-y-1 overflow-y-auto pr-1">
          {items.map((a) => {
            const meta = KIND_ICON[a.kind] ?? { icon: Activity, cls: "text-muted-foreground" };
            const Icon = meta.icon;
            return (
              <div
                key={a.id}
                className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm animate-in fade-in slide-in-from-top-1 duration-300"
              >
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${meta.cls}`} />
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] leading-snug text-muted-foreground">
                    {a.message}
                  </span>
                  <span className="ml-2 whitespace-nowrap text-[10px] text-muted-foreground/50">
                    {fmtTimeAgo(a.created_at, now)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
});
