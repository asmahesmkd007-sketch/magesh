import { memo, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, Eye } from "lucide-react";
import { Card, SectionTitle } from "@/components/site/Primitives";
import { roundLabel, type TournamentMatch } from "@/lib/api/tournamentClient";

// =====================================================================
// Knockout bracket. Columns per round with CSS connector stubs, live
// match highlighting, winner crowns, and spectate links. Scrolls
// horizontally inside its own container on small screens.
// =====================================================================
const MatchBox = memo(function MatchBox({
  m,
  viewerId,
}: {
  m: TournamentMatch;
  viewerId: string | null;
}) {
  const mine = viewerId != null && (m.player1_id === viewerId || m.player2_id === viewerId);

  const row = (pid: string | null, label: string) => {
    const won = m.winner_id != null && pid != null && pid === m.winner_id;
    const lost =
      m.status === "finished" && m.winner_id != null && pid != null && pid !== m.winner_id;
    return (
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors ${
          won
            ? "bg-gold/10 text-gold"
            : lost
              ? "text-muted-foreground/50 line-through decoration-white/20"
              : "text-muted-foreground"
        }`}
      >
        <span className="truncate">
          {label}
          {pid === viewerId && <span className="ml-1 text-[10px] text-emerald">(you)</span>}
        </span>
        {won && <Crown className="h-3.5 w-3.5 shrink-0 animate-in fade-in zoom-in duration-500" />}
      </div>
    );
  };

  const p1 = m.player1_id ? (m.player1_username ?? "Player") : "—";
  const p2 = m.player2_id ? (m.player2_username ?? "Player") : m.status === "bye" ? "Bye" : "TBD";

  return (
    <div
      className={`relative rounded-xl border bg-white/[0.02] transition-all duration-300 ${
        m.status === "active"
          ? "border-emerald/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
          : mine
            ? "border-gold/40"
            : "border-white/10"
      }`}
    >
      {row(m.player1_id, p1)}
      <div className="border-t border-white/5" />
      {row(m.player2_id, p2)}
      {m.status === "active" && m.game_id && (
        <Link
          to="/game/$id"
          params={{ id: m.game_id }}
          className="flex items-center gap-1.5 border-t border-white/5 px-3 py-1.5 text-[11px] text-emerald hover:bg-emerald/5"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
          {mine ? "Enter match" : "Watch live"}
          <Eye className="ml-auto h-3 w-3 opacity-60" />
          {typeof m.moves_count === "number" && (
            <span className="text-muted-foreground">{m.moves_count} moves</span>
          )}
        </Link>
      )}
      {m.status === "finished" && m.game_id && (
        <Link
          to="/game/$id"
          params={{ id: m.game_id }}
          className="flex items-center gap-1.5 border-t border-white/5 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-gold"
        >
          Review game
        </Link>
      )}
    </div>
  );
});

export const Bracket = memo(function Bracket({
  matches,
  totalRounds,
  currentRound,
  viewerId,
  champion,
}: {
  matches: TournamentMatch[];
  totalRounds: number;
  currentRound: number;
  viewerId: string | null;
  champion: string | null;
}) {
  const rounds = useMemo(() => {
    const maxRound = matches.length ? Math.max(...matches.map((m) => m.round)) : 0;
    return Array.from({ length: maxRound }, (_, i) =>
      matches.filter((m) => m.round === i + 1).sort((a, b) => a.slot - b.slot),
    );
  }, [matches]);

  if (!rounds.length) return null;
  const labelTotal = Math.max(totalRounds, rounds.length);

  return (
    <Card className="p-6">
      <SectionTitle kicker="Single Elimination" title="Bracket" />
      <div className="-mx-2 overflow-x-auto px-2 pb-2">
        <div className="flex min-w-max gap-8">
          {rounds.map((roundMatches, ri) => (
            <div key={ri} className="flex w-[230px] flex-col">
              <div
                className={`mb-3 text-xs uppercase tracking-widest ${
                  ri + 1 === currentRound ? "text-emerald" : "text-gold"
                }`}
              >
                {roundLabel(ri + 1, labelTotal)}
                {ri + 1 === currentRound && (
                  <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
                )}
              </div>
              {/* Even vertical distribution so connector geometry reads correctly */}
              <div className="flex flex-1 flex-col justify-around gap-3">
                {roundMatches.map((m) => (
                  <div key={m.id} className="relative">
                    <MatchBox m={m} viewerId={viewerId} />
                    {/* connector stub to the next round */}
                    {ri < rounds.length - 1 && (
                      <span className="pointer-events-none absolute -right-8 top-1/2 hidden h-px w-8 bg-gradient-to-r from-gold/30 to-transparent md:block" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Champion column */}
          {champion && (
            <div className="flex w-[190px] flex-col">
              <div className="mb-3 text-xs uppercase tracking-widest text-gold">Champion</div>
              <div className="flex flex-1 items-center">
                <div className="w-full rounded-xl border border-gold/40 bg-gold/10 p-4 text-center shadow-gold-glow animate-in fade-in zoom-in duration-700">
                  <Crown className="mx-auto h-6 w-6 text-gold" />
                  <div className="mt-2 font-display text-lg text-gold">{champion}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
});
