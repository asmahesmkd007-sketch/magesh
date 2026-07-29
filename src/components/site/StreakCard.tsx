import { CalendarDays, Flame, Trophy, type LucideIcon } from "lucide-react";
import { Card } from "@/components/site/Primitives";
import { useStreaks } from "@/hooks/useStreaks";

function StatBox({
  label,
  value,
  icon: Icon,
  iconCls,
  prominent,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  iconCls: string;
  prominent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 ${
        prominent
          ? "border border-white/10 bg-white/[0.03]"
          : "border border-white/5 bg-transparent"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${iconCls}`} />
        {label}
      </div>
      <div
        className={`mt-2 font-display leading-none ${
          prominent ? "text-3xl" : "text-2xl text-muted-foreground"
        }`}
      >
        {value}
        <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
          {value === 1 ? "day" : "days"}
        </span>
      </div>
    </div>
  );
}

export function StreakCard({ userId }: { userId: string }) {
  const { streaks, loading } = useStreaks(userId);

  const todayIso = new Date().toISOString().split("T")[0];
  const isActiveToday = streaks?.last_login_date === todayIso;

  function fmtDate(iso: string | null) {
    if (!iso) return null;
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <Card className="relative overflow-hidden">
      {/* Subtle fire tint */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-orange-500/5 via-transparent to-transparent" />

      <div className="relative p-6">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/10">
              <Flame className="h-5 w-5 text-orange-400" />
            </span>
            <div>
              <div className="font-display text-lg leading-tight">Daily Streak</div>
              <div className="text-xs text-muted-foreground">Keep your momentum going</div>
            </div>
          </div>

          {isActiveToday && (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald/20 bg-emerald/5 px-3 py-1 text-xs text-emerald">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
              Active today
            </span>
          )}
        </div>

        {/* Stat grid */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatBox
              label="Login Streak"
              value={streaks?.current_login_streak ?? 0}
              icon={Flame}
              iconCls="text-orange-400"
              prominent
            />
            <StatBox
              label="Best Login"
              value={streaks?.best_login_streak ?? 0}
              icon={Trophy}
              iconCls="text-gold"
            />
          </div>
        )}

        {/* Last active */}
        {streaks?.last_login_date && (
          <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Last active: {fmtDate(streaks.last_login_date)}
          </div>
        )}
      </div>
    </Card>
  );
}
