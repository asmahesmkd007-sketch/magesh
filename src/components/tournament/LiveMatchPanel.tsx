import { memo, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Swords, Play, Timer, Flag } from "lucide-react";
import { toast } from "sonner";
import { Card, GoldButton } from "@/components/site/Primitives";
import { claimNoShow, roundLabel, type TournamentMatch } from "@/lib/api/tournamentClient";
import { fmtClock, MiniBoard, PlayerAvatar } from "./bits";

// =====================================================================
// "Your match is live" panel: board preview, opponent, both clocks
// ticking against the server timestamps, move count, whose turn it is,
// and a no-show claim once the grace period passes without a move.
// =====================================================================
function useTickingClocks(m: TournamentMatch, offsetMs: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (m.game_status !== "active") return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [m.game_status]);

  return useMemo(() => {
    void tick; // re-derive every second while the game runs
    const white = m.white_time_ms ?? 0;
    const black = m.black_time_ms ?? 0;
    if (m.game_status !== "active" || !m.last_move_at) return { white, black };
    const elapsed = Math.max(0, Date.now() + offsetMs - new Date(m.last_move_at).getTime());
    return {
      white: m.turn === "w" ? Math.max(0, white - elapsed) : white,
      black: m.turn === "b" ? Math.max(0, black - elapsed) : black,
    };
  }, [m.white_time_ms, m.black_time_ms, m.turn, m.last_move_at, m.game_status, offsetMs, tick]);
}

export const LiveMatchPanel = memo(function LiveMatchPanel({
  m,
  viewerId,
  totalRounds,
  offsetMs,
  onChanged,
}: {
  m: TournamentMatch;
  viewerId: string;
  totalRounds: number;
  offsetMs: number;
  onChanged: () => void;
}) {
  const iAmWhite = m.white_id === viewerId;
  const oppName = (iAmWhite ? m.black_username : m.white_username) ?? "Opponent";
  const myName = (iAmWhite ? m.white_username : m.black_username) ?? "You";
  const clocks = useTickingClocks(m, offsetMs);
  const myClock = iAmWhite ? clocks.white : clocks.black;
  const oppClock = iAmWhite ? clocks.black : clocks.white;
  const myTurn = (m.turn === "w") === iAmWhite;
  const [claiming, setClaiming] = useState(false);

  // No-show hint: black can claim when white never opened; white can claim
  // when they opened and black never replied. The RPC re-verifies all of it.
  const gameAgeMs = m.game_created_at
    ? Date.now() + offsetMs - new Date(m.game_created_at).getTime()
    : 0;
  const moves = m.moves_count ?? 0;
  const canClaimNoShow =
    m.game_status === "active" && gameAgeMs > 95_000 && (iAmWhite ? moves === 1 : moves === 0);

  async function doClaim() {
    setClaiming(true);
    try {
      await claimNoShow(m.id);
      toast.success("No-show win claimed — you advance!");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not claim yet");
    }
    setClaiming(false);
  }

  const clockBox = (label: string, ms: number, active: boolean) => (
    <div
      className={`flex items-center justify-between rounded-xl border px-3 py-2 transition-colors ${
        active ? "border-emerald/40 bg-emerald/10" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span
        className={`font-stat text-lg tabular-nums ${
          ms < 20000 ? "text-rose-400 animate-pulse" : active ? "text-emerald" : ""
        }`}
      >
        <Timer className="mr-1 inline h-3.5 w-3.5 opacity-60" />
        {fmtClock(ms)}
      </span>
    </div>
  );

  return (
    <Card className="border-emerald/30 bg-emerald/5 p-5 md:p-6">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="w-full max-w-[180px] shrink-0 self-center sm:self-start">
          <MiniBoard fen={m.fen} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald/15">
              <Swords className="h-5 w-5 text-emerald" />
            </div>
            <div className="min-w-0">
              <div className="font-display text-lg">Your match is live</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <PlayerAvatar username={oppName} size="h-4 w-4" />
                vs <span className="text-foreground">{oppName}</span> ·{" "}
                {roundLabel(m.round, totalRounds)} · {m.moves_count ?? 0} moves
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {clockBox(`${myName} (you, ${iAmWhite ? "White" : "Black"})`, myClock, myTurn)}
            {clockBox(`${oppName} (${iAmWhite ? "Black" : "White"})`, oppClock, !myTurn)}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
                myTurn
                  ? "bg-emerald/15 text-emerald"
                  : "border border-white/10 text-muted-foreground"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${myTurn ? "bg-emerald animate-pulse" : "bg-white/30"}`}
              />
              {myTurn ? "Your turn" : `Waiting for ${oppName}`}
            </span>
            {m.game_id && (
              <Link to="/game/$id" params={{ id: m.game_id }}>
                <GoldButton className="py-2 text-xs">
                  <Play className="h-3.5 w-3.5" /> Enter Match
                </GoldButton>
              </Link>
            )}
            {canClaimNoShow && (
              <button
                onClick={() => void doClaim()}
                disabled={claiming}
                className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50"
              >
                <Flag className="h-3.5 w-3.5" />
                {claiming ? "Claiming…" : "Claim no-show win"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
});
