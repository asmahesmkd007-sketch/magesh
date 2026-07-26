import { memo, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Coins,
  ListOrdered,
  Loader2,
  Shield,
  Swords,
  TrendingUp,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/site/Primitives";
import { PieceGlyph } from "@/lib/chess/pieceThemes";
import type { PieceSymbol } from "chess.js";
import { useFriends } from "@/hooks/useFriends";
import {
  ARENA_POINTS,
  PIECE_BONUS,
  type CaptureRow,
  type TournamentEntry,
  type TournamentMatch,
  type TournamentRow,
} from "@/lib/api/tournamentClient";
import { AnimatedCoins, PlayerAvatar, fmtTimeAgo } from "./bits";

// =====================================================================
// TR lobby side panels: full leaderboard (Box 2), my position (Box 3),
// my profile (Box 4), the point system (Box 5), the live capture ticker,
// and the opponent friend-request button (Box 11 extra).
// =====================================================================

// ---------------------------------------------------------------------
// Box 2 — full realtime leaderboard
// ---------------------------------------------------------------------
export const ArenaLeaderboard = memo(function ArenaLeaderboard({
  entries,
  t,
  matches,
  playingIds,
  viewerId,
}: {
  entries: TournamentEntry[];
  t: TournamentRow;
  matches?: TournamentMatch[];
  playingIds: Set<string>;
  viewerId: string | null;
}) {
  // Current-round context: who beat their pairing already, and who is
  // facing whom right now (spec: leaderboard shows the current opponent).
  const { wonRound, opponentOf } = useMemo(() => {
    const won = new Set<string>();
    const opp = new Map<string, string>();
    for (const m of matches ?? []) {
      if (m.round !== t.current_round) continue;
      if ((m.status === "finished" || m.status === "bye") && m.winner_id) won.add(m.winner_id);
      if (m.status === "active" && m.player1_id && m.player2_id) {
        opp.set(m.player1_id, m.player2_username ?? "opponent");
        opp.set(m.player2_id, m.player1_username ?? "opponent");
      }
    }
    return { wonRound: won, opponentOf: opp };
  }, [matches, t.current_round]);

  const remaining = entries.filter((e) => e.status !== "eliminated").length;
  const eliminated = entries.length - remaining;

  const statusOf = (e: TournamentEntry): { label: string; cls: string } => {
    if (e.status === "winner") return { label: "Champion", cls: "text-gold" };
    if (e.status === "runner_up") return { label: "2nd", cls: "text-gold/80" };
    if (e.status === "third") return { label: "3rd", cls: "text-amber-400" };
    if (e.status === "fourth") return { label: "4th", cls: "text-amber-400/80" };
    if (e.status === "eliminated")
      return { label: `Out R${e.eliminated_in_round ?? "?"}`, cls: "text-rose-400/70" };
    if (playingIds.has(e.user_id)) return { label: "Playing", cls: "text-emerald" };
    if (t.status === "live" && wonRound.has(e.user_id))
      return { label: `Won R${t.current_round}`, cls: "text-emerald/80" };
    if (t.status === "live") return { label: "Waiting", cls: "text-amber-400" };
    return { label: "Ready", cls: "text-muted-foreground" };
  };

  return (
    <Card className="flex min-h-0 flex-col p-4">
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
        <ListOrdered className="h-3.5 w-3.5" /> Live Leaderboard
      </div>
      <div className="mb-3 text-[10px] text-muted-foreground">
        {t.status === "live" && t.current_round > 0 && (
          <>
            Round <span className="text-foreground">{t.current_round}</span>/{t.total_rounds} ·{" "}
          </>
        )}
        <span className="text-emerald">{remaining}</span> remaining ·{" "}
        <span className="text-rose-400">{eliminated}</span> eliminated
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background/95 text-[9px] uppercase tracking-widest text-muted-foreground backdrop-blur">
            <tr className="border-b border-white/5">
              <th className="pb-2 pr-1 text-left">#</th>
              <th className="pb-2 text-left">Player</th>
              <th className="pb-2 text-right">Pts</th>
              <th className="pb-2 text-center">W/L/D</th>
              <th className="pb-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {entries.map((e, i) => {
              const s = statusOf(e);
              const isMe = e.user_id === viewerId;
              const rank = e.rank ?? i + 1;
              return (
                <tr key={e.id} className={isMe ? "bg-gold/5" : ""}>
                  <td className="py-1.5 pr-1 font-display">{rank}</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <PlayerAvatar username={e.username} avatarUrl={e.avatar_url} size="h-5 w-5" />
                      <div className="min-w-0">
                        <div className="max-w-[110px] truncate">
                          {e.username ?? "Player"}
                          {isMe && <span className="ml-1 text-[9px] text-emerald">(you)</span>}
                        </div>
                        <div className="text-[9px] text-muted-foreground">
                          {opponentOf.has(e.user_id) ? (
                            <span className="text-emerald/80">vs {opponentOf.get(e.user_id)}</span>
                          ) : (
                            <>
                              {e.country ?? "—"} · IQ {e.iq_rating ?? 100}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-1.5 text-right font-stat text-gold">{Number(e.score)}</td>
                  <td className="py-1.5 text-center text-muted-foreground">
                    <span className="text-emerald">{e.wins}</span>/
                    <span className="text-rose-400">{e.losses}</span>/{e.draws}
                  </td>
                  <td className={`py-1.5 text-right ${s.cls}`}>{s.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
});

// ---------------------------------------------------------------------
// Box 3 — my current position + next rank difference
// ---------------------------------------------------------------------
export const MyPositionCard = memo(function MyPositionCard({
  entries,
  viewerId,
}: {
  entries: TournamentEntry[];
  viewerId: string;
}) {
  const idx = entries.findIndex((e) => e.user_id === viewerId);
  if (idx < 0) return null;
  const me = entries[idx];
  const rank = me.rank ?? idx + 1;
  const above = idx > 0 ? entries[idx - 1] : null;
  const needed = above ? Math.max(0, Number(above.score) - Number(me.score)) : 0;
  const games = me.wins + me.losses + me.draws;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
        <TrendingUp className="h-3.5 w-3.5" /> My Position
      </div>
      <div className="flex items-end justify-between">
        <div className="font-display text-4xl text-gradient-gold">#{rank}</div>
        <div className="text-right">
          <div className="font-stat text-2xl text-gold">
            <AnimatedCoins value={Number(me.score)} />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">points</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
        {[
          { l: "Wins", v: me.wins, c: "text-emerald" },
          { l: "Losses", v: me.losses, c: "text-rose-400" },
          { l: "Draws", v: me.draws, c: "" },
          { l: "Games", v: games, c: "" },
        ].map((x) => (
          <div key={x.l} className="rounded-lg border border-white/5 bg-white/[0.02] px-1 py-1.5">
            <div className={`font-stat text-sm ${x.c}`}>{x.v}</div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{x.l}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px]">
        <span className="text-muted-foreground">Piece points</span>
        <span className="text-gold">{me.piece_points}</span>
      </div>
      {above && (
        <div className="mt-2 rounded-lg border border-gold/15 bg-gold/5 px-2.5 py-2 text-[11px] text-muted-foreground">
          Need <span className="text-gold">{needed + 1} pts</span> to pass{" "}
          <span className="text-foreground">{above.username ?? "the player"}</span> for{" "}
          <span className="text-gold">#{rank - 1}</span>
        </div>
      )}
    </Card>
  );
});

// ---------------------------------------------------------------------
// Box 4 — my profile
// ---------------------------------------------------------------------
export const MyProfileCard = memo(function MyProfileCard({
  entry,
  coins,
  clanSlug,
}: {
  entry: TournamentEntry;
  coins: number;
  clanSlug: string | null;
}) {
  const games = entry.wins + entry.losses + entry.draws;
  const winRate = games > 0 ? Math.round((entry.wins / games) * 100) : 0;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <PlayerAvatar
          username={entry.username}
          avatarUrl={entry.avatar_url}
          size="h-12 w-12"
          ring="ring-2 ring-gold/40"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base">
            {entry.full_name || entry.username || "Player"}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            @{entry.username} · {entry.country ?? "—"} · IQ {entry.iq_rating ?? 100}
          </div>
          {clanSlug && (
            <Link
              to="/clan/$slug"
              params={{ slug: clanSlug }}
              className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-gold hover:underline"
            >
              <Shield className="h-3 w-3" /> {clanSlug}
            </Link>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-1 py-1.5">
          <div className="flex items-center justify-center gap-1 font-stat text-sm text-gold">
            <Coins className="h-3 w-3" /> <AnimatedCoins value={coins} />
          </div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Coins</div>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-1 py-1.5">
          <div className="font-stat text-sm text-gold">{Number(entry.score)}</div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Points</div>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-1 py-1.5">
          <div className="font-stat text-sm text-emerald">{winRate}%</div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Win Rate</div>
        </div>
      </div>
    </Card>
  );
});

// ---------------------------------------------------------------------
// Box 5 — the point system, with live totals
// ---------------------------------------------------------------------
export const PointSystemCard = memo(function PointSystemCard({
  matchPoints,
  totalPoints,
}: {
  matchPoints: number;
  totalPoints: number;
}) {
  const pieces: { p: PieceSymbol; label: string }[] = [
    { p: "p", label: "Pawn" },
    { p: "n", label: "Knight" },
    { p: "b", label: "Bishop" },
    { p: "r", label: "Rook" },
    { p: "q", label: "Queen" },
  ];
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gold/80">
        <Swords className="h-3.5 w-3.5" /> Point System
      </div>
      <div className="mb-2 grid grid-cols-2 gap-1.5 text-center">
        <div className="rounded-lg border border-emerald/20 bg-emerald/5 px-1 py-1.5">
          <div className="font-stat text-lg text-emerald">
            <AnimatedCoins value={matchPoints} />
          </div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
            Match Points
          </div>
        </div>
        <div className="rounded-lg border border-gold/20 bg-gold/5 px-1 py-1.5">
          <div className="font-stat text-lg text-gold">
            <AnimatedCoins value={totalPoints} />
          </div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
            Arena Points
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
        <div className="rounded-md bg-white/[0.03] px-1 py-1">
          Win <span className="text-emerald">+{ARENA_POINTS.win}</span>
        </div>
        <div className="rounded-md bg-white/[0.03] px-1 py-1">
          Loss <span className="text-rose-400">{ARENA_POINTS.loss}</span>
        </div>
        <div className="rounded-md bg-white/[0.03] px-1 py-1">
          Draw <span className="text-gold">+{ARENA_POINTS.draw}</span>
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1">
        {pieces.map(({ p, label }) => (
          <div
            key={p}
            title={`Capture a ${label}: +${PIECE_BONUS[p as keyof typeof PIECE_BONUS]}`}
            className="flex flex-col items-center rounded-md bg-white/[0.03] px-1 py-1"
          >
            <div className="h-6 w-6">
              <PieceGlyph theme="classic" color="w" type={p} />
            </div>
            <span className="text-[10px] text-gold">
              +{PIECE_BONUS[p as keyof typeof PIECE_BONUS]}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
        Capture bonuses land instantly. Timeout scores like a normal loss — no bonus at the flag.
      </p>
    </Card>
  );
});

// ---------------------------------------------------------------------
// Live capture ticker
// ---------------------------------------------------------------------
export const CapturesTicker = memo(function CapturesTicker({
  captures,
}: {
  captures: CaptureRow[];
}) {
  if (captures.length === 0) return null;
  return (
    <Card className="p-4">
      <div className="mb-2 text-xs uppercase tracking-[0.22em] text-gold/80">Piece Bonuses</div>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {captures.slice(0, 20).map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2 py-1 text-[11px] animate-in fade-in slide-in-from-top-1"
          >
            <div className="h-5 w-5 shrink-0">
              <PieceGlyph theme="classic" color="b" type={c.piece as PieceSymbol} />
            </div>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              <span className="text-foreground">{c.capturer_username ?? "Player"}</span> took{" "}
              {c.victim_username ? `${c.victim_username}'s` : "a"} {c.piece.toUpperCase()}
            </span>
            <span className="shrink-0 text-gold">+{c.bonus}</span>
            <span className="shrink-0 text-[9px] text-muted-foreground/60">
              {fmtTimeAgo(c.created_at)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
});

// ---------------------------------------------------------------------
// Box 11 extra — friend request button for the opponent
// ---------------------------------------------------------------------
export function FriendButton({ myUserId, otherUserId }: { myUserId: string; otherUserId: string }) {
  const { friends, loading, sendRequest, acceptRequest, declineRequest } = useFriends(myUserId);
  const [busy, setBusy] = useState(false);

  const relation = useMemo(
    () =>
      friends.find(
        (f) =>
          (f.requester_id === myUserId && f.addressee_id === otherUserId) ||
          (f.requester_id === otherUserId && f.addressee_id === myUserId),
      ) ?? null,
    [friends, myUserId, otherUserId],
  );

  if (loading || myUserId === otherUserId) return null;

  const act = async (fn: () => Promise<void>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Friend action failed");
    }
    setBusy(false);
  };

  const cls =
    "mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] transition disabled:opacity-50";

  if (!relation) {
    return (
      <button
        disabled={busy}
        onClick={() => void act(() => sendRequest(otherUserId), "Friend request sent")}
        className={`${cls} border-gold/25 bg-gold/5 text-gold hover:bg-gold/10`}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
        Add Friend
      </button>
    );
  }
  if (relation.status === "accepted") {
    return (
      <span className={`${cls} cursor-default border-emerald/25 bg-emerald/5 text-emerald`}>
        <UserCheck className="h-3 w-3" /> Friends
      </span>
    );
  }
  if (relation.requester_id === myUserId) {
    return (
      <button
        disabled={busy}
        onClick={() => void act(() => declineRequest(relation.id), "Request cancelled")}
        className={`${cls} border-white/15 bg-white/[0.03] text-muted-foreground hover:text-rose-400`}
      >
        <UserX className="h-3 w-3" /> Pending — Cancel
      </button>
    );
  }
  return (
    <button
      disabled={busy}
      onClick={() => void act(() => acceptRequest(relation.id), "Friend request accepted")}
      className={`${cls} border-emerald/25 bg-emerald/5 text-emerald hover:bg-emerald/10`}
    >
      <UserCheck className="h-3 w-3" /> Accept Friend
    </button>
  );
}
