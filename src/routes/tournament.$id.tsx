import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell, Card, GoldButton, SectionTitle } from "@/components/site/Primitives";
import {
  Crown,
  Calendar,
  Users,
  ArrowLeft,
  Loader2,
  Coins,
  Check,
  Swords,
  Shield,
  Clock,
  Play,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import {
  joinTournamentPaid,
  refundTournamentEntry,
  cancelTournament,
} from "@/lib/api/walletClient";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { toast } from "sonner";

export const Route = createFileRoute("/tournament/$id")({
  head: () => ({ meta: [{ title: "Tournament — ChessOx" }] }),
  component: TournamentPage,
});

type Tournament = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  format: string;
  time_control: string;
  prize_pool: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "upcoming" | "locked" | "live" | "completed" | "cancelled";
  player_count: number;
  max_players: number;
  cover_gradient: string | null;
  winner_display: string | null;
  entry_fee_coins: number;
  prize_1st: number;
  prize_2nd: number;
  prize_3rd: number;
  prizes_distributed: boolean;
};

type Entry = {
  id: string;
  user_id: string;
  score: number | null;
  rank: number | null;
  joined_at: string;
  profiles: {
    username: string;
    premium_active?: boolean;
    premium_expires_at?: string | null;
  } | null;
};

type BracketMatch = {
  id: string;
  round: number;
  slot: number;
  player1_id: string | null;
  player2_id: string | null;
  game_id: string | null;
  winner_id: string | null;
  status: "pending" | "active" | "finished" | "bye";
};

const ROUND_LABEL = (round: number, total: number): string => {
  const fromEnd = total - round; // 0 = final
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round}`;
};

function fmtDate(iso: string | null) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function statusBadge(status: string) {
  if (status === "live")
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald/15 px-3 py-1 text-xs text-emerald">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" /> Live
      </span>
    );
  if (status === "upcoming")
    return (
      <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold">
        Upcoming
      </span>
    );
  if (status === "locked")
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" /> Starting Soon
      </span>
    );
  if (status === "cancelled")
    return (
      <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-400">
        Cancelled
      </span>
    );
  return (
    <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-muted-foreground">
      Completed
    </span>
  );
}

function TournamentPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { wallet } = useWallet(user?.id);
  const { isAdmin } = useIsAdmin(user?.id);
  const navigate = useNavigate();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);
  const [joining, setJoining] = useState(false);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data: t } = await (
      supabase as unknown as {
        from: (n: string) => {
          select: (s: string) => {
            eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
          };
        };
      }
    )
      .from("tournaments")
      .select(
        "id,slug,name,description,format,time_control,prize_pool,starts_at,ends_at,status,player_count,max_players,cover_gradient,winner_display,entry_fee_coins,prize_1st,prize_2nd,prize_3rd,prizes_distributed",
      )
      .eq("id", id)
      .maybeSingle();

    if (!t) {
      setLoading(false);
      return;
    }
    const tourn = t as unknown as Tournament;
    setTournament(tourn);

    const { data: e } = await (
      supabase as unknown as {
        from: (n: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              order: (
                c: string,
                o: object,
              ) => { limit: (n: number) => Promise<{ data: unknown[] | null }> };
            };
          };
        };
      }
    )
      .from("tournament_entries")
      .select(
        "id,user_id,score,rank,joined_at,profiles(username,premium_active,premium_expires_at)",
      )
      .eq("tournament_id", id)
      .order("score", { ascending: false })
      .limit(50);

    setEntries((e ?? []) as unknown as Entry[]);

    if (user) {
      const { data: me } = await (
        supabase as unknown as {
          from: (n: string) => {
            select: (s: string) => {
              eq: (
                c: string,
                v: string,
              ) => {
                eq: (c2: string, v2: string) => { maybeSingle: () => Promise<{ data: unknown }> };
              };
            };
          };
        }
      )
        .from("tournament_entries")
        .select("id")
        .eq("tournament_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      setIsRegistered(!!me);
    }

    // Bracket (only exists once the tournament is live/completed).
    if (tourn.status === "live" || tourn.status === "completed") {
      const { data: m } = await (
        supabase as unknown as {
          from: (n: string) => {
            select: (s: string) => {
              eq: (
                c: string,
                v: string,
              ) => { order: (c: string, o: object) => Promise<{ data: unknown[] | null }> };
            };
          };
        }
      )
        .from("tournament_matches")
        .select("id,round,slot,player1_id,player2_id,game_id,winner_id,status")
        .eq("tournament_id", id)
        .order("round", { ascending: true });
      const rows = (m ?? []) as unknown as BracketMatch[];
      rows.sort((a, b) => a.round - b.round || a.slot - b.slot);
      setMatches(rows);

      const ids = Array.from(
        new Set(rows.flatMap((r) => [r.player1_id, r.player2_id]).filter(Boolean) as string[]),
      );
      if (ids.length) {
        const { data: profs } = await (
          supabase as unknown as {
            from: (n: string) => {
              select: (s: string) => {
                in: (
                  c: string,
                  v: string[],
                ) => Promise<{ data: { id: string; username: string }[] | null }>;
              };
            };
          }
        )
          .from("profiles")
          .select("id,username")
          .in("id", ids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p) => {
          map[p.id] = p.username;
        });
        setNames(map);
      }
    } else {
      setMatches([]);
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    load();

    // Realtime: re-load whenever tournament status changes
    const ch = supabase
      .channel(`tournament_detail:${id}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${id}` } as never,
        () => load(),
      )
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "tournament_matches",
          filter: `tournament_id=eq.${id}`,
        } as never,
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, id]);

  async function handleJoin() {
    if (!user) {
      toast.error("Sign in to register");
      return;
    }
    if (!tournament) return;
    setJoining(true);
    try {
      await joinTournamentPaid(tournament.id);
      setIsRegistered(true);
      setTournament((t) => (t ? { ...t, player_count: (t.player_count ?? 0) + 1 } : t));
      toast.success(
        tournament.entry_fee_coins > 0
          ? `Registered! ${tournament.entry_fee_coins} coins deducted.`
          : "Registered successfully!",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not register";
      if (msg.includes("Insufficient wallet balance")) {
        toast.error("Insufficient wallet balance.", {
          action: { label: "Get Coins", onClick: () => navigate({ to: "/premium" }) },
        });
      } else if (msg.includes("Already registered")) {
        setIsRegistered(true);
        toast.info("You are already registered.");
      } else {
        toast.error(msg);
      }
    }
    setJoining(false);
  }

  if (loading) {
    return (
      <PageShell>
        <div className="grid place-items-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </PageShell>
    );
  }

  if (!tournament) {
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

  const bg = tournament.cover_gradient
    ? `from-${tournament.cover_gradient.split(" ")[0]}/30`
    : "from-amber-500/30 via-rose-700/20";

  const canRegister =
    !isRegistered &&
    tournament.status === "upcoming" &&
    (tournament.max_players == null || (tournament.player_count ?? 0) < tournament.max_players);

  const canWithdraw = isRegistered && tournament.status === "upcoming";
  const totalRounds = matches.length ? Math.max(...matches.map((m) => m.round)) : 0;
  const rounds = Array.from({ length: totalRounds }, (_, i) =>
    matches.filter((m) => m.round === i + 1),
  );
  const myMatch =
    user && tournament.status === "live"
      ? matches.find(
          (m) =>
            m.status === "active" &&
            m.game_id &&
            (m.player1_id === user.id || m.player2_id === user.id),
        )
      : undefined;

  async function handleCancelTournament() {
    if (!tournament) return;
    if (!window.confirm("Cancel this tournament and refund every entrant? This cannot be undone."))
      return;
    setJoining(true);
    try {
      await cancelTournament(tournament.id);
      toast.success("Tournament cancelled — all entrants refunded.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    }
    setJoining(false);
  }

  async function handleWithdraw() {
    if (!tournament) return;
    setJoining(true);
    try {
      await refundTournamentEntry(tournament.id);
      setIsRegistered(false);
      setTournament((t) =>
        t ? { ...t, player_count: Math.max(0, (t.player_count ?? 1) - 1) } : t,
      );
      toast.success("Withdrawn — entry fee refunded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw");
    }
    setJoining(false);
  }

  return (
    <PageShell>
      <button
        onClick={() => navigate({ to: "/tournaments" })}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" /> All Tournaments
      </button>

      {/* Hero banner */}
      <Card className="relative overflow-hidden p-8 md:p-14">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/30 via-rose-700/20 to-transparent" />
        <div className="pointer-events-none absolute inset-0 mandala-bg opacity-50" />
        <div className="relative">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-display text-xs uppercase tracking-[0.3em] text-gold">
              {tournament.format ?? "Tournament"}
            </div>
            {statusBadge(tournament.status)}
          </div>
          <h1 className="mt-2 font-display text-5xl md:text-6xl">{tournament.name}</h1>
          {tournament.description && (
            <p className="mt-3 max-w-xl text-muted-foreground">{tournament.description}</p>
          )}
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            {tournament.prize_1st > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-gold">
                <Coins className="h-4 w-4" />
                {tournament.prize_1st + tournament.prize_2nd + tournament.prize_3rd} coins pool
              </span>
            )}
            {tournament.status === "upcoming" ? (
              <span className="flex items-center gap-1.5 rounded-full border border-gold/30 px-3 py-1.5 text-gold animate-pulse">
                <Clock className="h-4 w-4" /> Waiting for players...
              </span>
            ) : tournament.starts_at ? (
              <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5">
                <Calendar className="h-4 w-4" /> {fmtDate(tournament.starts_at)}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5">
              <Users className="h-4 w-4" /> {tournament.player_count ?? 0}
              {tournament.max_players ? ` / ${tournament.max_players}` : ""} players
            </span>
            {tournament.time_control && (
              <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5">
                {tournament.time_control}
              </span>
            )}
          </div>

          {/* Prize breakdown */}
          {(tournament.prize_1st > 0 || tournament.prize_2nd > 0 || tournament.prize_3rd > 0) && (
            <div className="mt-5 flex flex-wrap gap-2">
              {tournament.prize_1st > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs text-gold">
                  🥇 {tournament.prize_1st} coins
                </span>
              )}
              {tournament.prize_2nd > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-muted-foreground">
                  🥈 {tournament.prize_2nd} coins
                </span>
              )}
              {tournament.prize_3rd > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-muted-foreground">
                  🥉 {tournament.prize_3rd} coins
                </span>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {isRegistered ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-2.5 text-sm text-emerald">
                  <Check className="h-4 w-4" /> Registered
                </div>
                {canWithdraw && (
                  <button
                    onClick={handleWithdraw}
                    disabled={joining}
                    className="rounded-xl border border-white/10 px-3 py-2.5 text-xs text-muted-foreground hover:text-rose-400"
                  >
                    {joining ? "Withdrawing…" : "Withdraw"}
                  </button>
                )}
              </div>
            ) : canRegister ? (
              <div className="flex items-center gap-3">
                <GoldButton onClick={handleJoin} disabled={joining}>
                  <Crown className="h-4 w-4" />{" "}
                  {joining
                    ? "Registering…"
                    : tournament.entry_fee_coins > 0
                      ? `Register · ${tournament.entry_fee_coins} coins`
                      : "Register Now (Free)"}
                </GoldButton>
                {user && tournament.entry_fee_coins > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Balance: <span className="text-gold">{wallet?.balance ?? 0} coins</span>
                  </span>
                )}
              </div>
            ) : tournament.status === "completed" || tournament.status === "cancelled" ? (
              <div className="text-sm text-muted-foreground">Tournament has ended</div>
            ) : tournament.status === "live" ? (
              <div className="text-sm text-muted-foreground">Registration closed</div>
            ) : (
              <div className="text-sm text-muted-foreground">Tournament full</div>
            )}
            {isAdmin && tournament.status !== "completed" && tournament.status !== "cancelled" && (
              <button
                onClick={handleCancelTournament}
                disabled={joining}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-400 hover:bg-rose-500/20"
              >
                Cancel &amp; Refund (Admin)
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Lobby — locked, waiting for start */}
      {tournament.status === "locked" && (
        <Card className="mt-6 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/15">
              <Clock className="h-4 w-4 text-gold animate-pulse" />
            </div>
            <div>
              <div className="font-display text-lg">Tournament Locked — Starting Soon</div>
              <div className="text-xs text-muted-foreground">
                All {tournament.player_count} players are in. Round 1 is starting automatically —
                the bracket will appear here.
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-8">
            {entries.map((e) => (
              <div
                key={e.id}
                className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center"
              >
                <div className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-sm font-display text-gold">
                  {(e.profiles?.username ?? "P")[0].toUpperCase()}
                </div>
                <div className="text-[11px] truncate w-full text-center text-muted-foreground flex items-center justify-center">
                  {e.profiles?.username ?? "User"}
                  <PremiumBadge
                    premiumActive={e.profiles?.premium_active}
                    premiumExpiresAt={e.profiles?.premium_expires_at}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Your live match — jump straight into the board */}
      {myMatch && (
        <Card className="mt-6 border-emerald/30 bg-emerald/5 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald/15">
                <Swords className="h-5 w-5 text-emerald" />
              </div>
              <div>
                <div className="font-display text-lg">Your match is live</div>
                <div className="text-xs text-muted-foreground">
                  vs{" "}
                  {names[
                    (myMatch.player1_id === user!.id ? myMatch.player2_id : myMatch.player1_id) ??
                      ""
                  ] ?? "Opponent"}{" "}
                  · {ROUND_LABEL(myMatch.round, totalRounds)}
                </div>
              </div>
            </div>
            <Link to="/game/$id" params={{ id: myMatch.game_id! }}>
              <GoldButton>
                <Play className="h-4 w-4" /> Enter Match
              </GoldButton>
            </Link>
          </div>
        </Card>
      )}

      {/* Bracket */}
      {(tournament.status === "live" || tournament.status === "completed") &&
        matches.length > 0 && (
          <Card className="mt-6 p-6">
            <SectionTitle kicker="Single Elimination" title="Bracket" />
            <div className="mt-4 flex gap-6 overflow-x-auto pb-2">
              {rounds.map((roundMatches, ri) => (
                <div key={ri} className="flex min-w-[220px] flex-col gap-3">
                  <div className="text-xs uppercase tracking-widest text-gold">
                    {ROUND_LABEL(ri + 1, totalRounds)}
                  </div>
                  {roundMatches.map((m) => {
                    const p1 = m.player1_id ? (names[m.player1_id] ?? "User") : "—";
                    const p2 = m.player2_id
                      ? (names[m.player2_id] ?? "User")
                      : m.status === "bye"
                        ? "Bye"
                        : "TBD";
                    const row = (pid: string | null, label: string) => (
                      <div
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                          m.winner_id && pid === m.winner_id
                            ? "bg-gold/10 text-gold"
                            : "text-muted-foreground"
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        {m.winner_id && pid === m.winner_id && <Crown className="h-3.5 w-3.5" />}
                      </div>
                    );
                    return (
                      <div key={m.id} className="rounded-xl border border-white/10 bg-white/[0.02]">
                        {row(m.player1_id, p1)}
                        <div className="border-t border-white/5" />
                        {row(m.player2_id, p2)}
                        {m.status === "active" && (
                          <div className="flex items-center gap-1.5 border-t border-white/5 px-3 py-1.5 text-[11px] text-emerald">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
                            {m.game_id ? (
                              <Link
                                to="/game/$id"
                                params={{ id: m.game_id }}
                                className="hover:underline"
                              >
                                Watch live
                              </Link>
                            ) : (
                              "In progress"
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>
        )}

      {/* Standings / Participants */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <SectionTitle
            kicker={tournament.status === "completed" ? "Final Standings" : "Standings"}
            title="Leaderboard"
          />
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {tournament.status === "upcoming"
                ? "No participants yet. Be the first to register!"
                : "No standings data available."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-muted-foreground border-b border-white/5">
                <tr>
                  <th className="pb-3 text-left">#</th>
                  <th className="pb-3 text-left">Player</th>
                  <th className="pb-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {entries.map((e, i) => {
                  const name = e.profiles?.username || "User";
                  const rank = e.rank ?? i + 1;
                  return (
                    <tr key={e.id} className={rank <= 3 ? "text-gold" : ""}>
                      <td className="py-3 pr-3 font-display text-lg">
                        {rank === 1
                          ? "🥇"
                          : rank === 2
                            ? "🥈"
                            : rank === 3
                              ? "🥉"
                              : rank === 4
                                ? "🏅"
                                : rank}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="grid h-7 w-7 place-items-center rounded-full bg-gold/10 text-xs text-gold">
                            {name[0].toUpperCase()}
                          </div>
                          <span className="flex items-center">
                            {name}
                            <PremiumBadge
                              premiumActive={e.profiles?.premium_active}
                              premiumExpiresAt={e.profiles?.premium_expires_at}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-right font-display">
                        {e.score != null ? `${e.score} pts` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        {/* Details sidebar */}
        <Card className="p-6">
          <SectionTitle kicker="Info" title="Details" />
          <div className="space-y-4 text-sm">
            {tournament.format && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">
                  Format
                </div>
                <div className="mt-0.5 capitalize">{tournament.format}</div>
              </div>
            )}
            {tournament.time_control && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">
                  Time Control
                </div>
                <div className="mt-0.5">{tournament.time_control}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                Start Date
              </div>
              <div className="mt-0.5">{fmtDate(tournament.starts_at)}</div>
            </div>
            {tournament.ends_at && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">
                  End Date
                </div>
                <div className="mt-0.5">{fmtDate(tournament.ends_at)}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Players</div>
              <div className="mt-0.5">
                {tournament.player_count ?? 0}
                {tournament.max_players ? ` / ${tournament.max_players}` : ""} registered
              </div>
            </div>
            {tournament.entry_fee_coins != null && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">
                  Entry Fee
                </div>
                <div className="mt-0.5 flex items-center gap-1">
                  {tournament.entry_fee_coins > 0 ? (
                    <>
                      <Coins className="h-3.5 w-3.5 text-gold" />
                      <span className="text-gold">{tournament.entry_fee_coins} coins</span>
                    </>
                  ) : (
                    <span className="text-emerald">Free Entry</span>
                  )}
                </div>
              </div>
            )}

            {tournament.winner_display && tournament.status === "completed" && (
              <div className="rounded-xl border border-gold/20 bg-gold/5 p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-widest">
                  Winner
                </div>
                <div className="mt-1 flex items-center gap-2 text-gold">
                  <Crown className="h-4 w-4" /> {tournament.winner_display}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
