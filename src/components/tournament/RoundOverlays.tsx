import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Check, Coins, Crown, Hourglass, Loader2, Medal, Swords, Trophy } from "lucide-react";
import { Card, GoldButton } from "@/components/site/Primitives";
import type { TournamentEntry, TournamentMatch, TournamentRow } from "@/lib/api/tournamentClient";
import { PlayerAvatar } from "./bits";

// =====================================================================
// Round-by-round progression UI (knockout spec):
//   • WaitingForRoundPanel — early finishers wait here with live progress
//     until EVERY board in the round is done
//   • RoundIntermissionOverlay — full-screen "Round N Complete" with the
//     10-second countdown, qualified players and round funnel
//   • ChampionOverlay — podium + prizes + viewer stats when the final ends
// All countdowns run against server timestamps (offsetMs-corrected).
// =====================================================================

/** Whole seconds until a server timestamp; fires onZero exactly once. */
function useServerCountdown(
  target: string | null | undefined,
  offsetMs: number,
  onZero?: () => void,
) {
  const [left, setLeft] = useState<number | null>(null);
  const onZeroRef = useRef(onZero);
  onZeroRef.current = onZero;

  useEffect(() => {
    if (!target) {
      setLeft(null);
      return;
    }
    let fired = false;
    const compute = () =>
      Math.max(0, Math.ceil((new Date(target).getTime() - (Date.now() + offsetMs)) / 1000));
    setLeft(compute());
    const iv = setInterval(() => {
      const s = compute();
      setLeft(s);
      if (s <= 0 && !fired) {
        fired = true;
        onZeroRef.current?.();
      }
    }, 250);
    return () => clearInterval(iv);
  }, [target, offsetMs]);

  return left;
}

/** Everything the round screens need about the round in progress. */
function roundFacts(t: TournamentRow, matches: TournamentMatch[], entries: TournamentEntry[]) {
  const inRound = matches.filter((m) => m.round === t.current_round);
  const done = inRound.filter((m) => m.status === "finished" || m.status === "bye");
  const winnerIds = new Set(done.map((m) => m.winner_id).filter(Boolean) as string[]);
  const byId = new Map(entries.map((e) => [e.user_id, e]));
  const winners = [...winnerIds]
    .map((id) => byId.get(id))
    .filter((e): e is TournamentEntry => !!e)
    .sort((a, b) => Number(b.score) - Number(a.score));
  const players = inRound.reduce((n, m) => n + (m.player1_id ? 1 : 0) + (m.player2_id ? 1 : 0), 0);
  return { inRound, done, winners, players, eliminated: Math.max(0, players - winnerIds.size) };
}

// ---------------------------------------------------------------------
// Waiting panel — shown to players who already won while boards remain
// ---------------------------------------------------------------------
export const WaitingForRoundPanel = memo(function WaitingForRoundPanel({
  t,
  matches,
  entries,
}: {
  t: TournamentRow;
  matches: TournamentMatch[];
  entries: TournamentEntry[];
}) {
  const { inRound, done, winners } = roundFacts(t, matches, entries);
  const remaining = inRound.length - done.length;

  // Upper bound on how long the stragglers can still take: the slowest
  // active board cannot outlive both of its clocks combined.
  const estMs = useMemo(
    () =>
      Math.max(
        0,
        ...inRound
          .filter((m) => m.status === "active" && m.game_status === "active")
          .map((m) => (m.white_time_ms ?? 0) + (m.black_time_ms ?? 0)),
      ),
    [inRound],
  );
  const estMin = Math.ceil(estMs / 60000);

  const stat = (label: string, value: React.ReactNode, cls = "") => (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-center">
      <div className={`font-stat text-xl ${cls}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );

  return (
    <Card className="grid min-h-[420px] place-items-center p-8 text-center">
      <div className="w-full max-w-sm">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald" />
        <div className="mt-4 font-display text-xl">Waiting for remaining matches to finish…</div>
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;ve qualified for the next round. The whole field advances together the moment the
          last board of Round {t.current_round} is decided.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {stat(
            "Completed",
            <>
              <span className="text-emerald">{done.length}</span>
              <span className="text-muted-foreground"> / {inRound.length}</span>
            </>,
          )}
          {stat("Remaining", remaining, "text-amber-400")}
          {stat("Qualified", winners.length, "text-gold")}
          {stat("Est. wait", estMs > 0 ? `≤ ${estMin}m` : "—")}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground/70">
          The leaderboard on the right updates live while you wait.
        </p>
      </div>
    </Card>
  );
});

// ---------------------------------------------------------------------
// Full-screen intermission — "Round N Complete", 10-second countdown
// ---------------------------------------------------------------------
export const RoundIntermissionOverlay = memo(function RoundIntermissionOverlay({
  t,
  matches,
  entries,
  offsetMs,
  onZero,
}: {
  t: TournamentRow;
  matches: TournamentMatch[];
  entries: TournamentEntry[];
  offsetMs: number;
  onZero: () => void;
}) {
  const seconds = useServerCountdown(t.next_round_at, offsetMs, onZero);
  const { winners, players, eliminated } = roundFacts(t, matches, entries);

  const funnel = (label: string, value: number, cls: string) => (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-center">
      <div className={`font-stat text-2xl ${cls}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-page/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl gradient-gold shadow-gold-glow">
          <Trophy className="h-8 w-8 text-background" />
        </div>
        <h2 className="mt-4 font-display text-3xl text-gradient-gold md:text-4xl">
          Round {t.current_round} Complete
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Preparing next round…</p>

        <div className="mt-4 font-display text-7xl tabular-nums text-ivory md:text-8xl">
          {seconds !== null && seconds > 0 ? (
            seconds
          ) : (
            <Loader2 className="mx-auto h-14 w-14 animate-spin text-gold" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {seconds !== null && seconds > 0
            ? "Random pairings are drawn when the countdown hits zero — your board opens automatically."
            : "Pairing the next round…"}
        </p>

        {/* Round funnel: players → winners → eliminated */}
        <div className="mt-6 flex items-center gap-2">
          {funnel("Players", players, "text-ivory")}
          <span className="text-lg text-gold/60">→</span>
          {funnel("Winners", winners.length, "text-emerald")}
          <span className="text-lg text-gold/60">→</span>
          {funnel("Eliminated", eliminated, "text-rose-400")}
        </div>

        {/* Qualified players */}
        <div className="mt-6 w-full rounded-2xl border border-gold/15 bg-black/30 p-4">
          <div className="mb-3 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
            <Swords className="h-3.5 w-3.5" /> Qualified Players
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {winners.map((e) => (
              <div
                key={e.user_id}
                className="flex items-center gap-2.5 rounded-xl border border-emerald/20 bg-emerald/5 px-3 py-2 text-left"
              >
                <Check className="h-4 w-4 shrink-0 text-emerald" />
                <PlayerAvatar username={e.username} avatarUrl={e.avatar_url} size="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {e.full_name || e.username || "Player"}
                    <span className="ml-1.5 text-[10px] text-muted-foreground">@{e.username}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {e.country ?? "—"} · IQ {e.iq_rating ?? 100} ·{" "}
                    <span className="text-gold">{Number(e.score)} pts</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------
// Champion overlay — podium, prizes, viewer stats after the final
// ---------------------------------------------------------------------
export const ChampionOverlay = memo(function ChampionOverlay({
  t,
  entries,
  viewerId,
  onClose,
}: {
  t: TournamentRow;
  entries: TournamentEntry[];
  viewerId: string;
  onClose: () => void;
}) {
  const byRank = (r: number) => entries.find((e) => e.rank === r) ?? null;
  const champion = byRank(1);
  const runner = byRank(2);
  const third = byRank(3);
  const me = entries.find((e) => e.user_id === viewerId) ?? null;
  const myPrize =
    me?.rank === 1
      ? t.prize_1st
      : me?.rank === 2
        ? t.prize_2nd
        : me?.rank === 3
          ? t.prize_3rd
          : me?.rank === 4
            ? t.prize_4th
            : 0;

  const podium = (
    entry: TournamentEntry | null,
    place: string,
    prize: number,
    icon: React.ReactNode,
    big = false,
  ) => (
    <div
      className={`flex flex-col items-center rounded-2xl border px-4 py-4 ${
        big ? "border-gold/40 bg-gold/10" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      {icon}
      <PlayerAvatar
        username={entry?.username ?? null}
        avatarUrl={entry?.avatar_url ?? null}
        size={big ? "h-16 w-16" : "h-11 w-11"}
        ring={big ? "ring-2 ring-gold/60" : undefined}
      />
      <div className={`mt-2 max-w-[140px] truncate ${big ? "font-display text-lg" : "text-sm"}`}>
        {entry?.full_name || entry?.username || "—"}
      </div>
      <div className="text-[10px] text-muted-foreground">@{entry?.username ?? "—"}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{place}</div>
      {prize > 0 && (
        <div className="mt-1 flex items-center gap-1 text-sm text-gold">
          <Coins className="h-3.5 w-3.5" /> {prize}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-page/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl gradient-gold shadow-gold-glow">
          <Crown className="h-8 w-8 text-background" />
        </div>
        <h2 className="mt-4 font-display text-3xl text-gradient-gold md:text-4xl">
          {champion?.full_name || champion?.username || t.winner_display || "Champion"} takes the
          crown!
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.name} — final result</p>

        <div className="mt-6 grid w-full grid-cols-3 items-end gap-2">
          {podium(
            runner,
            "Runner-up",
            t.prize_2nd,
            <Medal className="mb-1 h-5 w-5 text-gold/70" />,
          )}
          {podium(
            champion,
            "Champion",
            t.prize_1st,
            <Trophy className="mb-1 h-6 w-6 text-gold" />,
            true,
          )}
          {podium(
            third,
            "Third Place",
            t.prize_3rd,
            <Medal className="mb-1 h-5 w-5 text-amber-400" />,
          )}
        </div>

        {me && (
          <div className="mt-5 w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-gold/80">
              Your Tournament
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { l: "Finish", v: me.rank ? `#${me.rank}` : "—", c: "text-gold" },
                { l: "Points", v: Number(me.score), c: "text-gold" },
                { l: "W / L / D", v: `${me.wins}/${me.losses}/${me.draws}`, c: "" },
                {
                  l: "Coins Won",
                  v: myPrize > 0 ? `+${myPrize}` : "0",
                  c: myPrize > 0 ? "text-emerald" : "",
                },
              ].map((x) => (
                <div key={x.l} className="rounded-lg bg-white/[0.02] px-1 py-2">
                  <div className={`font-stat text-base ${x.c}`}>{x.v}</div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    {x.l}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Hourglass className="h-3 w-3" />
              IQ rating {me.iq_rating ?? 100} — per-game rating changes are already applied.
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Prizes were credited automatically and the tournament is archived — every match, pairing
          and payout stays in the history.
        </p>

        <div className="mt-5">
          <GoldButton onClick={onClose}>View Final Standings</GoldButton>
        </div>
      </div>
    </div>
  );
});
