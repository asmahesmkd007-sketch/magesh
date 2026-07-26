import { memo, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { Card, SectionTitle } from "@/components/site/Primitives";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import type { TournamentEntry, TournamentRow } from "@/lib/api/tournamentClient";
import { PlayerAvatar } from "./bits";

// =====================================================================
// Player list: avatar, username, rating, country and a single live
// status chip per player (playing / online / offline / eliminated /
// winner / runner-up), plus score and rank once the bracket runs.
// =====================================================================
type LiveStatus =
  | "winner"
  | "runner_up"
  | "third"
  | "fourth"
  | "eliminated"
  | "playing"
  | "waiting"
  | "online"
  | "offline";

const STATUS_META: Record<LiveStatus, { label: string; cls: string; dot?: string }> = {
  winner: { label: "Winner", cls: "border-gold/40 bg-gold/10 text-gold" },
  runner_up: { label: "Runner-up", cls: "border-gold/25 bg-gold/5 text-gold/80" },
  third: { label: "3rd", cls: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
  fourth: { label: "4th", cls: "border-amber-500/20 bg-amber-500/5 text-amber-400/80" },
  eliminated: { label: "Eliminated", cls: "border-rose-500/25 bg-rose-500/5 text-rose-400/80" },
  playing: {
    label: "Playing",
    cls: "border-emerald/30 bg-emerald/10 text-emerald",
    dot: "bg-emerald animate-pulse",
  },
  waiting: { label: "Waiting", cls: "border-amber-500/25 bg-amber-500/5 text-amber-400" },
  online: {
    label: "Online",
    cls: "border-emerald/25 bg-emerald/5 text-emerald/80",
    dot: "bg-emerald",
  },
  offline: { label: "Offline", cls: "border-white/10 bg-white/[0.02] text-muted-foreground" },
};

function liveStatusOf(
  e: TournamentEntry,
  t: TournamentRow,
  playingIds: Set<string>,
  onlineIds: Set<string>,
): LiveStatus {
  if (e.status !== "active") return e.status as LiveStatus;
  if (playingIds.has(e.user_id)) return "playing";
  if (t.status === "live") return "waiting";
  if (onlineIds.has(e.user_id) || e.is_online) return "online";
  return "offline";
}

export const PlayersPanel = memo(function PlayersPanel({
  entries,
  t,
  playingIds,
  onlineIds,
  viewerId,
}: {
  entries: TournamentEntry[];
  t: TournamentRow;
  playingIds: Set<string>;
  onlineIds: Set<string>;
  viewerId: string | null;
}) {
  const sorted = useMemo(() => {
    const order: Record<string, number> = {
      winner: 0,
      runner_up: 1,
      third: 2,
      fourth: 3,
      playing: 4,
      waiting: 5,
      online: 6,
      offline: 7,
      eliminated: 8,
    };
    return [...entries].sort((a, b) => {
      const sa = order[liveStatusOf(a, t, playingIds, onlineIds)] ?? 9;
      const sb = order[liveStatusOf(b, t, playingIds, onlineIds)] ?? 9;
      return sa - sb || b.score - a.score || (b.iq_rating ?? 0) - (a.iq_rating ?? 0);
    });
  }, [entries, t, playingIds, onlineIds]);

  return (
    <Card className="p-6">
      <SectionTitle
        kicker={`${entries.length}/${t.max_players} seats`}
        title="Players"
        action={<Users className="h-5 w-5 text-gold/50" />}
      />
      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nobody here yet — the arena awaits its first challenger.
        </p>
      ) : (
        <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {sorted.map((e) => {
            const status = liveStatusOf(e, t, playingIds, onlineIds);
            const meta = STATUS_META[status];
            const isMe = e.user_id === viewerId;
            return (
              <Link
                key={e.id}
                to="/u/$username"
                params={{ username: e.username ?? "" }}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors hover:border-gold/25 ${
                  isMe ? "border-gold/25 bg-gold/5" : "border-white/5 bg-white/[0.02]"
                }`}
              >
                <PlayerAvatar username={e.username} avatarUrl={e.avatar_url} size="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-sm">
                    {e.username ?? "Player"}
                    {isMe && <span className="text-[10px] text-emerald">(you)</span>}
                    <PremiumBadge
                      premiumActive={e.premium_active ?? undefined}
                      premiumExpiresAt={e.premium_expires_at}
                    />
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    IQ {e.iq_rating ?? 100}
                    {e.country ? ` · ${e.country}` : ""}
                    {e.rank != null
                      ? ` · #${e.rank}`
                      : e.score > 0
                        ? ` · ${Number(e.score)} pts`
                        : ""}
                  </div>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] ${meta.cls}`}
                >
                  {meta.dot && <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />}
                  {meta.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
});
