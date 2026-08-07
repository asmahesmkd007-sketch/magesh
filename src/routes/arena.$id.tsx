import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Ban,
  Crown,
  Eye,
  Hourglass,
  Loader2,
  LogOut,
  Skull,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useMyClan } from "@/hooks/useMyClan";
import { useTournament } from "@/hooks/useTournament";
import {
  nudgeTournamentEngine,
  prizePoolOf,
  roundLabel,
  timeClassOf,
  type CaptureRow,
  type TournamentActivityItem,
} from "@/lib/api/tournamentClient";
import { playGameSound, unlockAudio } from "@/lib/audio/sounds";
import { ArenaBoard } from "@/components/tournament/ArenaBoard";
import {
  ChampionOverlay,
  RoundIntermissionOverlay,
  WaitingForRoundPanel,
} from "@/components/tournament/RoundOverlays";
import {
  ArenaLeaderboard,
  CapturesTicker,
  FriendButton,
  MyPositionCard,
  MyProfileCard,
  PointSystemCard,
} from "@/components/tournament/ArenaPanels";
import { ConnectionBadge, Countdown, StatusBadge } from "@/components/tournament/bits";
import { noindexSeo } from "@/lib/seo";

import { RequireAuth } from "@/components/auth/RequireAuth";

export const Route = createFileRoute("/arena/$id")({
  head: () =>
    noindexSeo(
      "Tournament Arena — ChessOx",
      "The live arena for an online chess tournament on ChessOx.",
    ),
  component: () => (
    <RequireAuth>
      <ArenaPage />
    </RequireAuth>
  ),
});

// =====================================================================
// TR ARENA LOBBY — full-screen tournament room (no site chrome).
// Rendered as a fixed overlay above the app shell, chess.com-arena style:
// header strip (Box 1), my profile/position/point-system rail (Boxes 3-5),
// the playable match surface (Boxes 6-11) and the live leaderboard (Box 2).
// Match flow: wait → auto-assigned board → play → leaderboard updates →
// next round appears automatically → repeat until the final.
// =====================================================================
function ArenaPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const { wallet } = useWallet(user?.id);
  const { clanSlug } = useMyClan();
  const navigate = useNavigate();

  const onActivity = useCallback(
    (a: TournamentActivityItem) => {
      const meta = a.meta ?? {};
      switch (a.kind) {
        case "tournament_live":
        case "round_started":
          playGameSound("notify");
          toast.info(a.message);
          break;
        case "match_finished":
          if (user && meta.winner_id === user.id) toast.success("You won — you advance!");
          else if (user && meta.loser_id === user.id)
            toast.error("You've been eliminated. You can keep watching from the lobby.");
          break;
        case "tournament_finished":
          playGameSound(user && a.actor_id === user.id ? "victory" : "notify");
          toast.info(a.message);
          break;
        case "tournament_cancelled":
          toast.error(a.message);
          break;
        default:
          break;
      }
    },
    [user],
  );

  const onCapture = useCallback(
    (c: CaptureRow) => {
      if (user && c.victim_id === user.id) {
        toast.warning(
          `${c.capturer_username ?? "Opponent"} took your ${c.piece.toUpperCase()} (+${c.bonus})`,
          {
            duration: 2000,
          },
        );
      }
    },
    [user],
  );

  const { state, loading, error, connection, onlineIds, clockOffsetMs, refetch } = useTournament(
    id,
    user?.id,
    onActivity,
    onCapture,
  );

  // Countdown hitting zero should kick the engine (locked → live + Round 1)
  // immediately instead of waiting for the next cron/nudge tick.
  const onCountdownZero = useCallback(() => {
    void nudgeTournamentEngine().finally(() => void refetch());
  }, [refetch]);

  useEffect(() => {
    const prime = () => unlockAudio();
    window.addEventListener("pointerdown", prime, { once: true });
    return () => window.removeEventListener("pointerdown", prime);
  }, []);

  const t = state?.tournament ?? null;

  // Keep the server clockwork moving even without pg_cron: nudge the
  // locked→live transition and the dead-clock sweep while things run.
  useEffect(() => {
    if (!t || (t.status !== "locked" && t.status !== "live")) return;
    void nudgeTournamentEngine();
    const iv = setInterval(() => void nudgeTournamentEngine(), 25000);
    return () => clearInterval(iv);
  }, [t?.status, t]);

  const entries = useMemo(() => state?.entries ?? [], [state?.entries]);
  const captures = useMemo(() => state?.captures ?? [], [state?.captures]);
  const myEntry = useMemo(
    () => (user ? (entries.find((e) => e.user_id === user.id) ?? null) : null),
    [entries, user],
  );
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
  const oppId = myMatch
    ? myMatch.player1_id === user?.id
      ? myMatch.player2_id
      : myMatch.player1_id
    : null;
  const oppEntry = useMemo(
    () => (oppId ? (entries.find((e) => e.user_id === oppId) ?? null) : null),
    [entries, oppId],
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
  const myMatchPoints = useMemo(
    () =>
      user && myMatch?.game_id
        ? captures
            .filter((c) => c.game_id === myMatch.game_id && c.user_id === user.id)
            .reduce((s, c) => s + c.bonus, 0)
        : 0,
    [captures, myMatch?.game_id, user],
  );
  const liveBoards = useMemo(
    () =>
      (state?.matches ?? []).filter(
        (m) => m.status === "active" && m.game_id && m.game_status === "active",
      ),
    [state?.matches],
  );
  const roundProgress = useMemo(() => {
    if (!t || t.status !== "live") return null;
    const inRound = (state?.matches ?? []).filter((m) => m.round === t.current_round);
    const done = inRound.filter((m) => m.status === "finished" || m.status === "bye").length;
    return { done, total: inRound.length };
  }, [state?.matches, t]);

  // Opponent's live presence: arena/tournament page presence first, the
  // app-wide profiles.is_online flag as fallback.
  const oppOnline = oppId ? onlineIds.has(oppId) || oppEntry?.is_online === true : null;

  // ---- Elimination popup + auto-exit ------------------------------------
  // Knockout rule: a loser sees "You have been eliminated", then leaves the
  // arena automatically and lands back on the tournament lobby page.
  const [elimOpen, setElimOpen] = useState(false);
  const [elimSeconds, setElimSeconds] = useState(8);
  const [champDismissed, setChampDismissed] = useState(false);
  const elimShownRef = useRef(false);
  const isEliminated = t?.status === "live" && myEntry?.status === "eliminated";

  const leaveArena = useCallback(() => {
    setElimOpen(false);
    void navigate({ to: "/tournament/$id", params: { id } });
  }, [navigate, id]);

  useEffect(() => {
    if (!isEliminated || elimShownRef.current) return;
    elimShownRef.current = true;
    playGameSound("defeat");
    setElimOpen(true);
  }, [isEliminated]);

  useEffect(() => {
    if (!elimOpen) return;
    setElimSeconds(8);
    const iv = setInterval(() => {
      setElimSeconds((s) => {
        if (s <= 1) {
          clearInterval(iv);
          leaveArena();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [elimOpen, leaveArena]);

  // ---- Full-screen shell ------------------------------------------------
  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-page text-foreground">
      <div className="pointer-events-none fixed inset-0 opacity-40 royal-grid" />
      <div className="relative mx-auto min-h-full max-w-[1500px] px-3 py-3 md:px-5">{children}</div>
    </div>
  );

  if (authLoading || loading) {
    return shell(
      <div className="grid min-h-[90vh] place-items-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold" />
          <div className="mt-3 font-display text-lg text-muted-foreground">Entering the arena…</div>
        </div>
      </div>,
    );
  }

  if (error || !t) {
    return shell(
      <div className="grid min-h-[90vh] place-items-center">
        <Card className="max-w-sm p-8 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-400" />
          <div className="mt-3 font-display text-xl">
            {error ? "Could not load the arena" : "Tournament not found"}
          </div>
          {error && <p className="mt-1 text-sm text-muted-foreground">{error}</p>}
          <div className="mt-5 flex justify-center gap-2">
            {error && <GoldButton onClick={() => void refetch()}>Retry</GoldButton>}
            <Link to="/tournaments">
              <GhostButton>All Tournaments</GhostButton>
            </Link>
          </div>
        </Card>
      </div>,
    );
  }

  if (!user || !myEntry) {
    return shell(
      <div className="grid min-h-[90vh] place-items-center">
        <Card className="max-w-sm p-8 text-center">
          <Ban className="mx-auto h-10 w-10 text-amber-400" />
          <div className="mt-3 font-display text-xl">
            {user ? "You didn't join this tournament." : "Sign in to enter the arena"}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {user
              ? "The arena is reserved for registered players — you can still spectate from the tournament page."
              : "Only registered players can take a seat in the tournament room."}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {!user && (
              <Link to="/login">
                <GoldButton>Sign In</GoldButton>
              </Link>
            )}
            <Link to="/tournament/$id" params={{ id }}>
              <GhostButton>
                <Eye className="h-4 w-4" /> Spectate
              </GhostButton>
            </Link>
          </div>
        </Card>
      </div>,
    );
  }

  // ---- Box 1: header strip -----------------------------------------------
  const pool = prizePoolOf(t);
  const header = (
    <Card className="mb-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-gold shadow-gold-glow">
          <Crown className="h-5 w-5 text-background" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-lg leading-tight">{t.name}</span>
            <StatusBadge status={t.status} />
          </div>
          <div className="font-mono text-[10px] text-muted-foreground/60">
            TR-{t.id.slice(0, 8).toUpperCase()} · {t.format || "knockout"}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {timeClassOf(t.time_control)} ·{" "}
            <span className="text-foreground">{t.time_control}</span>
          </span>
          <span>
            Prize <span className="text-gold">{pool}</span>
          </span>
          <span>
            Entry{" "}
            {t.entry_fee_coins > 0 ? (
              <span className="text-gold">{t.entry_fee_coins}</span>
            ) : (
              <span className="text-emerald">Free</span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {t.player_count}/{t.max_players}
          </span>
          {t.status === "live" && t.current_round > 0 && (
            <span className="text-emerald">
              {roundLabel(t.current_round, t.total_rounds)}
              {roundProgress && ` · ${roundProgress.done}/${roundProgress.total} done`}
            </span>
          )}
          {t.status === "locked" && (
            <span className="text-amber-400">
              Starts in{" "}
              <Countdown target={t.starts_at} offsetMs={clockOffsetMs} onZero={onCountdownZero} />
            </span>
          )}
          <ConnectionBadge connection={connection} />
          <button
            onClick={() => {
              // Remember the deliberate exit so the lobby doesn't bounce
              // the player straight back into the arena.
              sessionStorage.setItem(`arena-exited:${id}`, "1");
              void navigate({ to: "/tournament/$id", params: { id } });
            }}
            title="Leave the arena (your seat is kept)"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-rose-500/30 hover:text-rose-400"
          >
            <LogOut className="h-3.5 w-3.5" /> Exit
          </button>
        </div>
      </div>
    </Card>
  );

  // ---- Center content by phase --------------------------------------------
  let center: React.ReactNode;
  if (t.status === "cancelled") {
    center = (
      <Card className="grid min-h-[420px] place-items-center p-8 text-center">
        <div>
          <Ban className="mx-auto h-10 w-10 text-rose-400" />
          <div className="mt-3 font-display text-xl">Tournament cancelled</div>
          <p className="mt-1 text-sm text-muted-foreground">
            All entry fees were refunded to players&apos; wallets.
          </p>
        </div>
      </Card>
    );
  } else if (t.status === "completed") {
    const champion = entries.find((e) => e.rank === 1);
    center = (
      <Card className="grid min-h-[420px] place-items-center p-8 text-center">
        <div>
          <Trophy className="mx-auto h-12 w-12 text-gold" />
          <div className="mt-3 font-display text-2xl text-gradient-gold">
            {champion?.username ?? t.winner_display ?? "Champion"} takes the crown!
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            You finished <span className="text-gold">#{myEntry.rank ?? "—"}</span> with{" "}
            <span className="text-gold">{Number(myEntry.score)} points</span> ({myEntry.wins}W ·{" "}
            {myEntry.losses}L · {myEntry.draws}D).
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link to="/tournament/$id" params={{ id }}>
              <GoldButton>Final Standings & Bracket</GoldButton>
            </Link>
            <Link to="/tournaments">
              <GhostButton>New Tournament</GhostButton>
            </Link>
          </div>
        </div>
      </Card>
    );
  } else if (myMatch && myMatch.game_id && user && oppId) {
    center = (
      <div className="flex justify-center">
        <ArenaBoard
          gameId={myMatch.game_id}
          matchId={myMatch.id}
          userId={user.id}
          meEntry={myEntry}
          oppEntry={oppEntry}
          captures={captures}
          offsetMs={clockOffsetMs}
          connected={connection === "live"}
          oppOnline={oppOnline}
          friendSlot={<FriendButton myUserId={user.id} otherUserId={oppId} />}
          onChanged={() => void refetch()}
        />
      </div>
    );
  } else if (myEntry.status === "eliminated") {
    center = (
      <Card className="p-8 text-center">
        <Swords className="mx-auto h-10 w-10 text-rose-400/70" />
        <div className="mt-3 font-display text-xl">
          Eliminated in Round {myEntry.eliminated_in_round ?? "?"}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Your run ends here — the leaderboard keeps updating live, and you can watch the remaining
          boards.
        </p>
        {liveBoards.length > 0 && (
          <div className="mx-auto mt-5 grid max-w-md gap-2">
            {liveBoards.map((m) => (
              <Link
                key={m.id}
                to="/game/$id"
                params={{ id: m.game_id! }}
                className="flex items-center justify-between rounded-xl border border-emerald/25 bg-emerald/5 px-4 py-2.5 text-sm transition hover:bg-emerald/10"
              >
                <span className="truncate">
                  {m.player1_username ?? "—"} vs {m.player2_username ?? "—"}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-emerald">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" /> Watch
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    );
  } else if (t.status === "locked") {
    center = (
      <Card className="grid min-h-[420px] place-items-center p-8 text-center">
        <div>
          <Hourglass className="mx-auto h-10 w-10 animate-spin-slow text-amber-400" />
          <div className="mt-4 font-display text-2xl">Round 1 begins in</div>
          <div className="mt-2 font-display text-5xl text-gradient-gold">
            <Countdown
              target={t.starts_at}
              offsetMs={clockOffsetMs}
              onZero={() => void refetch()}
            />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            All {t.player_count} players are locked in. Your board opens here automatically —
            don&apos;t go anywhere.
          </p>
        </div>
      </Card>
    );
  } else if (t.status === "live") {
    // Round-by-round rule: early winners wait here with live progress until
    // EVERY board in the round is decided — nobody advances alone.
    center = <WaitingForRoundPanel t={t} matches={state?.matches ?? []} entries={entries} />;
  } else {
    center = (
      <Card className="grid min-h-[420px] place-items-center p-8 text-center">
        <div>
          <Users className="mx-auto h-10 w-10 text-gold/50" />
          <div className="mt-3 font-display text-xl">
            Waiting for players — {Math.max(0, t.max_players - t.player_count)} seats left
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The tournament locks and starts automatically once every seat is taken.
          </p>
        </div>
      </Card>
    );
  }

  return shell(
    <>
      {header}
      <div className="grid gap-3 lg:grid-cols-12">
        {/* Left rail — Boxes 4, 3, 5 */}
        <div className="order-2 space-y-3 lg:order-1 lg:col-span-3">
          <MyProfileCard entry={myEntry} coins={wallet?.balance ?? 0} clanSlug={clanSlug} />
          <MyPositionCard entries={entries} viewerId={user.id} />
          <PointSystemCard matchPoints={myMatchPoints} totalPoints={Number(myEntry.score)} />
        </div>

        {/* Center — Boxes 6-11 */}
        <div className="order-1 min-w-0 lg:order-2 lg:col-span-6">{center}</div>

        {/* Right rail — Box 2 + capture ticker */}
        <div className="order-3 flex min-h-0 flex-col gap-3 lg:col-span-3 lg:max-h-[calc(100vh-96px)]">
          <ArenaLeaderboard
            entries={entries}
            t={t}
            matches={state?.matches ?? []}
            playingIds={playingIds}
            viewerId={user.id}
          />
          <CapturesTicker captures={captures} />
        </div>
      </div>

      {/* Full-screen intermission: every board is done, next round in 10s.
          Rendered above the whole arena (board included) for survivors. */}
      {t.status === "live" && t.next_round_at && myEntry.status === "active" && (
        <RoundIntermissionOverlay
          t={t}
          matches={state?.matches ?? []}
          entries={entries}
          offsetMs={clockOffsetMs}
          onZero={onCountdownZero}
        />
      )}

      {/* Champion overlay: podium, prizes and viewer stats after the final */}
      {t.status === "completed" && !champDismissed && (
        <ChampionOverlay
          t={t}
          entries={entries}
          viewerId={user.id}
          onClose={() => setChampDismissed(true)}
        />
      )}

      {/* Elimination popup — auto-returns the loser to the tournament lobby */}
      <Dialog open={elimOpen} onOpenChange={(o) => !o && leaveArena()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Skull className="h-5 w-5 text-rose-400" /> You have been eliminated.
            </DialogTitle>
            <DialogDescription>
              You were knocked out in Round {myEntry.eliminated_in_round ?? t.current_round} of{" "}
              {t.name}. You finished with {Number(myEntry.score)} points ({myEntry.wins}W ·{" "}
              {myEntry.losses}L · {myEntry.draws}D). Returning to the tournament lobby in{" "}
              <span className="text-gold">{elimSeconds}s</span>…
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <GhostButton onClick={() => void navigate({ to: "/tournaments" })}>
              All Tournaments
            </GhostButton>
            <GoldButton onClick={leaveArena}>Back to Lobby</GoldButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>,
  );
}
