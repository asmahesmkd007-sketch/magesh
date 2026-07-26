import { memo, useMemo } from "react";
import { Card, SectionTitle } from "@/components/site/Primitives";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import type { TournamentEntry, TournamentRow } from "@/lib/api/tournamentClient";
import { fmtClock, PlayerAvatar } from "./bits";

// =====================================================================
// Live scoreboard: rank, player, W/L/D, points, piece score, time used,
// and qualification status. Sorted by rank when final, by score while
// the tournament runs.
// =====================================================================
const MEDALS = ["🥇", "🥈", "🥉", "🏅"];

function qualification(e: TournamentEntry, t: TournamentRow): { label: string; cls: string } {
  switch (e.status) {
    case "winner":
      return { label: "Champion", cls: "text-gold" };
    case "runner_up":
      return { label: "Runner-up", cls: "text-gold/80" };
    case "third":
      return { label: "3rd place", cls: "text-amber-400" };
    case "fourth":
      return { label: "4th place", cls: "text-amber-400/80" };
    case "eliminated":
      return { label: `Out R${e.eliminated_in_round ?? "?"}`, cls: "text-rose-400/80" };
    default:
      if (t.status === "live") return { label: "In contention", cls: "text-emerald" };
      if (t.status === "locked") return { label: "Ready", cls: "text-amber-400" };
      return { label: "Registered", cls: "text-muted-foreground" };
  }
}

export const Scoreboard = memo(function Scoreboard({
  entries,
  t,
  viewerId,
}: {
  entries: TournamentEntry[];
  t: TournamentRow;
  viewerId: string | null;
}) {
  const rows = useMemo(() => {
    const sorted = [...entries];
    sorted.sort((a, b) => {
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      if (a.rank != null) return -1;
      if (b.rank != null) return 1;
      return (
        b.score - a.score || b.piece_points - a.piece_points || a.time_used_ms - b.time_used_ms
      );
    });
    return sorted;
  }, [entries]);

  return (
    <Card className="p-6">
      <SectionTitle
        kicker={t.status === "completed" ? "Final Standings" : "Live Standings"}
        title="Scoreboard"
      />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t.status === "upcoming"
            ? "No players yet — be the first to claim a seat."
            : "No standings available."}
        </p>
      ) : (
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-white/5 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="pb-3 pr-2 text-left">#</th>
                <th className="pb-3 text-left">Player</th>
                <th className="pb-3 text-center">W</th>
                <th className="pb-3 text-center">L</th>
                <th className="pb-3 text-center">D</th>
                <th className="pb-3 text-right">Pts</th>
                <th className="pb-3 text-right">Pieces</th>
                <th className="pb-3 text-right">Time</th>
                <th className="pb-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((e, i) => {
                const rank = e.rank ?? i + 1;
                const q = qualification(e, t);
                const isMe = e.user_id === viewerId;
                return (
                  <tr
                    key={e.id}
                    className={`transition-colors ${isMe ? "bg-gold/5" : ""} ${rank <= 3 && t.status === "completed" ? "text-gold" : ""}`}
                  >
                    <td className="py-2.5 pr-2 font-display">{MEDALS[rank - 1] ?? rank}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <PlayerAvatar
                          username={e.username}
                          avatarUrl={e.avatar_url}
                          size="h-7 w-7"
                        />
                        <span className="flex items-center truncate">
                          {e.username ?? "Player"}
                          {isMe && <span className="ml-1 text-[10px] text-emerald">(you)</span>}
                          <PremiumBadge
                            premiumActive={e.premium_active ?? undefined}
                            premiumExpiresAt={e.premium_expires_at}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-center text-emerald">{e.wins}</td>
                    <td className="py-2.5 text-center text-rose-400">{e.losses}</td>
                    <td className="py-2.5 text-center text-muted-foreground">{e.draws}</td>
                    <td className="py-2.5 text-right font-stat">{Number(e.score)}</td>
                    <td className="py-2.5 text-right text-muted-foreground">{e.piece_points}</td>
                    <td className="py-2.5 text-right text-muted-foreground">
                      {e.time_used_ms > 0 ? fmtClock(e.time_used_ms) : "—"}
                    </td>
                    <td className={`py-2.5 text-right text-xs ${q.cls}`}>{q.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
});
