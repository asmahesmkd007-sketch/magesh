import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { ArrowLeft, AlertCircle, Ban, Hourglass, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useTournament } from "@/hooks/useTournament";
import { cancelTournament, type TournamentActivityItem } from "@/lib/api/tournamentClient";
import { playGameSound, unlockAudio } from "@/lib/audio/sounds";
import { TournamentHeader } from "@/components/tournament/TournamentHeader";
import { InfoCard } from "@/components/tournament/InfoCard";
import { JoinPanel } from "@/components/tournament/JoinPanel";
import { LiveMatchPanel } from "@/components/tournament/LiveMatchPanel";
import { Bracket } from "@/components/tournament/Bracket";
import { Scoreboard } from "@/components/tournament/Scoreboard";
import { PlayersPanel } from "@/components/tournament/PlayersPanel";
import { PrizePanel } from "@/components/tournament/PrizePanel";
import { RecentMatches } from "@/components/tournament/RecentMatches";
import { ActivityFeed } from "@/components/tournament/ActivityFeed";
import { TournamentPageSkeleton } from "@/components/tournament/Skeletons";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/tournament/$id")({
  head: () =>
    noindexSeo(
      "Chess Tournament — ChessOx",
      "Details, standings and pairings for an online chess tournament on ChessOx.",
    ),
  component: TournamentPage,
});

// =====================================================================
// Tournament (TR) page. All state comes from useTournament (one RPC +
// realtime channels); every section below is a memoized component that
// only re-renders when its slice changes.
// =====================================================================
function TournamentPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { wallet } = useWallet(user?.id);
  const { isAdmin } = useIsAdmin(user?.id);
  const navigate = useNavigate();

  // Toasts + sounds for engine events as they stream in.
  const onActivity = useCallback(
    (a: TournamentActivityItem) => {
      const meta = a.meta ?? {};
      switch (a.kind) {
        case "tournament_locked":
          playGameSound("notify");
          toast.info("Tournament locked — starting in 2 minutes!", { description: a.message });
          break;
        case "tournament_live":
        case "round_started":
          playGameSound("notify");
          toast.info(a.message);
          break;
        case "match_finished": {
          if (user && meta.winner_id === user.id) {
            playGameSound("victory");
            toast.success("You won your match — you advance!");
          } else if (user && meta.loser_id === user.id) {
            playGameSound("defeat");
            toast.error("You've been eliminated from the tournament.");
          }
          break;
        }
        case "prize_distributed":
          if (user && a.actor_id === user.id) {
            playGameSound("victory");
            toast.success(a.message);
          }
          break;
        case "tournament_finished":
          playGameSound(user && a.actor_id === user.id ? "victory" : "notify");
          toast.info(a.message);
          break;
        case "tournament_cancelled":
          playGameSound("notify");
          toast.error(a.message);
          break;
        default:
          break; // joins/leaves/byes show in the feed without toasting
      }
    },
    [user],
  );

  const { state, loading, error, connection, onlineIds, clockOffsetMs, refetch } = useTournament(
    id,
    user?.id,
    onActivity,
  );

  // Sounds need a user gesture before the AudioContext may start.
  useEffect(() => {
    const prime = () => unlockAudio();
    window.addEventListener("pointerdown", prime, { once: true });
    return () => window.removeEventListener("pointerdown", prime);
  }, []);

  const t = state?.tournament ?? null;

  // While locked past its start time, poll until the cron flips it live.
  useEffect(() => {
    if (!t || t.status !== "locked") return;
    const interval = setInterval(() => void refetch(), 8000);
    return () => clearInterval(interval);
  }, [t, refetch]);

  // ---- Derived slices -------------------------------------------------
  const myEntry = useMemo(
    () => (user ? (state?.entries.find((e) => e.user_id === user.id) ?? null) : null),
    [state?.entries, user],
  );

  // Registered players never wait in the lobby: the moment the tournament
  // locks or goes live they are dropped into the arena automatically (the
  // board opens there with no refresh or click). The arena's Exit button
  // sets a session flag so deliberately leaving is respected.
  useEffect(() => {
    if (!t || !myEntry || myEntry.status !== "active") return;
    if (t.status !== "locked" && t.status !== "live") return;
    if (sessionStorage.getItem(`arena-exited:${t.id}`)) return;
    void navigate({ to: "/arena/$id", params: { id: t.id } });
  }, [t, myEntry, navigate]);

  const myMatch = useMemo(
    () =>
      user && t?.status === "live"
        ? (state?.matches.find(
            (m) =>
              m.status === "active" &&
              m.game_id &&
              (m.player1_id === user.id || m.player2_id === user.id),
          ) ?? null)
        : null,
    [state?.matches, t?.status, user],
  );

  const playingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of state?.matches ?? []) {
      if (m.status === "active") {
        if (m.player1_id) ids.add(m.player1_id);
        if (m.player2_id) ids.add(m.player2_id);
      }
    }
    return ids;
  }, [state?.matches]);

  const winners = useMemo(() => {
    const byRank = (r: number) => state?.entries.find((e) => e.rank === r)?.username ?? null;
    return [byRank(1), byRank(2), byRank(3), byRank(4)];
  }, [state?.entries]);

  async function handleAdminCancel() {
    if (!t) return;
    if (!window.confirm("Cancel this tournament and refund every entrant? This cannot be undone."))
      return;
    try {
      await cancelTournament(t.id);
      toast.success("Tournament cancelled — all entrants refunded.");
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    }
  }

  // ---- Loading / error / empty states ---------------------------------
  if (loading) {
    return (
      <PageShell compact>
        <TournamentPageSkeleton />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <Card className="flex flex-col items-center gap-4 p-12 text-center">
          <AlertCircle className="h-10 w-10 text-rose-400" />
          <div>
            <div className="font-display text-xl">Could not load tournament</div>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <GoldButton onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" /> Try Again
          </GoldButton>
        </Card>
      </PageShell>
    );
  }

  if (!t) {
    return (
      <PageShell eyebrow="Not Found" title="Tournament not found">
        <Card className="p-10 text-center">
          <p className="text-muted-foreground">This tournament does not exist.</p>
          <div className="mt-4">
            <Link to="/tournaments">
              <GoldButton>
                <ArrowLeft className="h-4 w-4" /> All Tournaments
              </GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  const showBracket = state!.matches.length > 0;

  return (
    <PageShell compact>
      <button
        onClick={() => navigate({ to: "/tournaments" })}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" /> All Tournaments
      </button>

      <div className="space-y-6">
        <TournamentHeader
          t={t}
          connection={connection}
          offsetMs={clockOffsetMs}
          spectators={onlineIds.size}
          onCountdownZero={() => void refetch()}
        />

        {t.status === "cancelled" && (
          <Card className="flex items-center gap-3 border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-400">
            <Ban className="h-5 w-5 shrink-0" />
            This tournament was cancelled. All entry fees have been refunded to players&apos;
            wallets.
          </Card>
        )}

        <JoinPanel
          t={t}
          myEntry={myEntry}
          wallet={wallet}
          signedIn={!!user}
          onChanged={() => void refetch()}
        />

        {isAdmin && t.status !== "completed" && t.status !== "cancelled" && (
          <button
            onClick={() => void handleAdminCancel()}
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400 transition hover:bg-rose-500/20"
          >
            <Ban className="mr-1.5 inline h-3.5 w-3.5" />
            Cancel &amp; Refund All (Admin)
          </button>
        )}

        {myMatch && user && (
          <LiveMatchPanel
            m={myMatch}
            viewerId={user.id}
            totalRounds={t.total_rounds}
            offsetMs={clockOffsetMs}
            onChanged={() => void refetch()}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main column */}
          <div className="min-w-0 space-y-6 lg:col-span-2">
            {showBracket ? (
              <Bracket
                matches={state!.matches}
                totalRounds={t.total_rounds}
                currentRound={t.current_round}
                viewerId={user?.id ?? null}
                champion={t.status === "completed" ? (winners[0] ?? t.winner_display) : null}
              />
            ) : t.status === "upcoming" || t.status === "locked" ? (
              <Card className="flex flex-col items-center gap-3 p-10 text-center">
                <Hourglass
                  className={`h-8 w-8 ${t.status === "locked" ? "animate-spin-slow text-amber-400" : "text-gold/40"}`}
                />
                <div className="font-display text-lg">
                  {t.status === "locked"
                    ? "Bracket is being drawn…"
                    : "The bracket appears when the arena fills"}
                </div>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t.status === "locked"
                    ? `All ${t.player_count} players are locked in. Round 1 pairings and boards are created automatically the moment the countdown hits zero.`
                    : `${Math.max(0, t.max_players - t.player_count)} more player${
                        t.max_players - t.player_count === 1 ? "" : "s"
                      } needed. The tournament locks and starts automatically once every seat is taken.`}
                </p>
              </Card>
            ) : (
              <Card className="p-10 text-center text-sm text-muted-foreground">
                No matches were played in this tournament.
              </Card>
            )}

            <Scoreboard entries={state!.entries} t={t} viewerId={user?.id ?? null} />
            <RecentMatches matches={state!.matches} totalRounds={t.total_rounds} />
          </div>

          {/* Sidebar */}
          <div className="min-w-0 space-y-6">
            <PrizePanel
              t={t}
              winners={t.status === "completed" ? winners : [null, null, null, null]}
            />
            <PlayersPanel
              entries={state!.entries}
              t={t}
              playingIds={playingIds}
              onlineIds={onlineIds}
              viewerId={user?.id ?? null}
            />
            <InfoCard t={t} matches={state!.matches} />
            <ActivityFeed items={state!.activity} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
