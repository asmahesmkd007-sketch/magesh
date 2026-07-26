import { memo, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Swords, ChevronRight } from "lucide-react";
import { Card, SectionTitle } from "@/components/site/Primitives";
import { roundLabel, type TournamentMatch } from "@/lib/api/tournamentClient";
import { END_REASON_LABEL, fmtDuration } from "./bits";

// =====================================================================
// Recent matches: winner, loser, round, end reason, move count and
// duration — newest first, straight from the match/game snapshots.
// =====================================================================
export const RecentMatches = memo(function RecentMatches({
  matches,
  totalRounds,
}: {
  matches: TournamentMatch[];
  totalRounds: number;
}) {
  const finished = useMemo(
    () =>
      matches
        .filter((m) => m.status === "finished" && m.winner_id)
        .sort(
          (a, b) =>
            new Date(b.game_ended_at ?? 0).getTime() - new Date(a.game_ended_at ?? 0).getTime(),
        )
        .slice(0, 10),
    [matches],
  );

  if (finished.length === 0) return null;

  return (
    <Card className="p-6">
      <SectionTitle
        kicker="Results"
        title="Recent Matches"
        action={<Swords className="h-5 w-5 text-gold/50" />}
      />
      <div className="space-y-2">
        {finished.map((m) => {
          const winnerName = m.winner_id === m.player1_id ? m.player1_username : m.player2_username;
          const loserName = m.winner_id === m.player1_id ? m.player2_username : m.player1_username;
          const isDraw = m.game_result === "draw";
          const reason = END_REASON_LABEL[m.end_reason ?? ""] ?? m.end_reason ?? "Finished";

          const inner = (
            <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-gold/25">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="text-gold">{winnerName ?? "Winner"}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {isDraw ? "advances vs" : "def."}
                  </span>
                  <span className="text-muted-foreground line-through decoration-white/20">
                    {loserName ?? "opponent"}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {roundLabel(m.round, totalRounds)} · {reason}
                  {isDraw ? " (draw — clock tiebreak)" : ""} · {m.moves_count ?? 0} moves ·{" "}
                  {fmtDuration(m.game_created_at, m.game_ended_at)}
                </div>
              </div>
              {m.game_id && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </div>
          );

          return m.game_id ? (
            <Link key={m.id} to="/game/$id" params={{ id: m.game_id }} className="block">
              {inner}
            </Link>
          ) : (
            <div key={m.id}>{inner}</div>
          );
        })}
      </div>
    </Card>
  );
});
