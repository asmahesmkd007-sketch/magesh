import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import {
  Trophy,
  Crown,
  Users,
  Loader2,
  Coins,
  Wallet,
  AlertCircle,
  Swords,
  Eye,
  Clock,
  Lock,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { joinTournamentPaid } from "@/lib/api/walletClient";
import { toast } from "sonner";

export const Route = createFileRoute("/tournaments")({
  head: () => ({ meta: [{ title: "Tournaments — ChessOx" }] }),
  component: Tournaments,
});

type Tournament = {
  id: string;
  name: string;
  format: string;
  prize_pool: string | null;
  starts_at: string | null;
  status: "upcoming" | "locked" | "live";
  player_count: number;
  max_players: number;
  cover_gradient: string | null;
  time_control: string;
  entry_fee_coins: number;
  prize_1st: number;
  prize_2nd: number;
  prize_3rd: number;
  created_at: string;
};

const GRADIENTS = [
  "from-amber-500 to-rose-700",
  "from-emerald-500 to-teal-700",
  "from-violet-500 to-indigo-700",
  "from-sky-500 to-blue-700",
  "from-pink-500 to-fuchsia-700",
  "from-orange-500 to-red-700",
];

function timeLabel(time_control: string) {
  if (time_control.startsWith("1+")) return "Bullet · " + time_control;
  if (time_control.startsWith("3+")) return "Blitz · " + time_control;
  return "Rapid · " + time_control;
}

function prizePool(t: Tournament) {
  return (t.prize_1st ?? 0) + (t.prize_2nd ?? 0) + (t.prize_3rd ?? 0);
}

function Countdown({ startTime }: { startTime: string | null }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function calc() {
      if (!startTime) {
        setLabel(""); // Handled by parent
        return;
      }
      const diff = new Date(startTime).getTime() - Date.now();
      if (diff <= 0) {
        setLabel("Starting now");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 48) {
        setLabel("In " + Math.ceil(diff / 86400000) + " days");
      } else if (h > 0) {
        setLabel(h + "h " + m + "m");
      } else {
        setLabel(m + "m " + s + "s");
      }
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  if (!label) return null;
  return <span>{label}</span>;
}

function Tournaments() {
  const { user } = useAuth();
  const { wallet } = useWallet(user?.id);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [myEntries, setMyEntries] = useState<Set<string>>(new Set());

  const loadTournaments = useCallback(async () => {
    setError(null);
    try {
      const { data, error: qErr } = await (
        supabase as unknown as {
          from: (t: string) => {
            select: (s: string) => {
              in: (
                col: string,
                vals: string[],
              ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
            };
          };
        }
      )
        .from("tournaments")
        .select(
          "id,name,format,prize_pool,starts_at,status,player_count,max_players,cover_gradient,time_control,entry_fee_coins,prize_1st,prize_2nd,prize_3rd,created_at",
        )
        .in("status", ["upcoming", "locked", "live"]);

      if (qErr) throw new Error(qErr.message);

      const unsorted = (data ?? []) as unknown as Tournament[];

      // Sort: upcoming -> locked -> live, then by created_at ascending
      const statusOrder = { upcoming: 1, locked: 2, live: 3 };
      unsorted.sort((a, b) => {
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      setTournaments(unsorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tournaments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTournaments();
  }, [loadTournaments]);

  useEffect(() => {
    const channel = supabase
      .channel("tournaments_list_realtime")
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "tournaments" } as never,
        () => {
          void loadTournaments();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadTournaments]);

  useEffect(() => {
    if (!user) return;
    void (
      supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (col: string, val: string) => Promise<{ data: { tournament_id: string }[] | null }>;
          };
        };
      }
    )
      .from("tournament_entries")
      .select("tournament_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setMyEntries(new Set((data ?? []).map((r) => r.tournament_id)));
      });
  }, [user]);

  async function handleJoin(t: Tournament) {
    if (!user) {
      toast.error("Sign in to register");
      return;
    }
    setJoining(t.id);
    try {
      await joinTournamentPaid(t.id);
      setMyEntries((prev) => new Set([...prev, t.id]));
      setTournaments((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, player_count: (x.player_count ?? 0) + 1 } : x)),
      );
      toast.success(
        t.entry_fee_coins > 0
          ? "Registered! " + t.entry_fee_coins + " coins deducted."
          : "Registered successfully!",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not register";
      if (msg.includes("Insufficient wallet balance")) {
        toast.error("Need " + (t.entry_fee_coins - (wallet?.balance ?? 0)) + " more coins.", {
          action: { label: "Get Coins", onClick: () => window.location.assign("/premium") },
        });
      } else if (msg.includes("Already registered")) {
        toast.info("Already registered.");
        setMyEntries((prev) => new Set([...prev, t.id]));
      } else {
        toast.error(msg);
      }
    }
    setJoining(null);
  }

  const oneMin = tournaments.filter((t) => t.time_control.startsWith("1+"));
  const threeMin = tournaments.filter((t) => t.time_control.startsWith("3+"));
  const fiveMin = tournaments.filter((t) => t.time_control.startsWith("5+"));
  const tenMin = tournaments.filter((t) => t.time_control.startsWith("10+"));

  const renderSection = (title: string, data: Tournament[], indexOffset: number) => {
    if (data.length === 0) return null;

    return (
      <div className="mb-12">
        <h2 className="mb-6 flex items-center gap-2 font-display text-2xl">{title}</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((t, i) => {
            const canAfford = !t.entry_fee_coins || (wallet?.balance ?? 0) >= t.entry_fee_coins;
            const registered = myEntries.has(t.id);
            const pool = prizePool(t);

            return (
              <div
                key={t.id}
                className={
                  "group relative flex flex-col overflow-hidden rounded-2xl border bg-white/[0.02] transition " +
                  (t.status === "live"
                    ? "border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)] "
                    : t.status === "locked"
                      ? "border-amber-500/30 "
                      : "border-white/10 hover:border-gold/30 hover:-translate-y-0.5")
                }
              >
                <div
                  className={
                    "relative aspect-[3/1] bg-gradient-to-br " +
                    (t.cover_gradient ?? GRADIENTS[(i + indexOffset) % GRADIENTS.length]) +
                    (t.status === "live" ? " opacity-80" : "")
                  }
                >
                  <div className="absolute inset-0 mandala-bg opacity-40" />
                  <Crown className="absolute right-3 top-3 h-5 w-5 text-white/70" />
                  <span className="absolute bottom-2 left-3 rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] backdrop-blur">
                    {timeLabel(t.time_control)}
                  </span>

                  {t.status === "live" && (
                    <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300 backdrop-blur border border-emerald-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
                      LIVE
                    </span>
                  )}
                  {t.status === "locked" && (
                    <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300 backdrop-blur border border-amber-500/30">
                      <Lock className="h-3 w-3" /> LOCKED
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <div className="font-display text-base leading-tight">{t.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">
                      {t.id.slice(0, 8)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                      <div className="text-[10px] text-muted-foreground">Entry Fee</div>
                      {t.entry_fee_coins > 0 ? (
                        <div className="flex items-center gap-1 text-sm font-medium text-gold">
                          <Coins className="h-3 w-3" /> {t.entry_fee_coins}
                        </div>
                      ) : (
                        <div className="text-sm font-medium text-emerald-400">Free</div>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                      <div className="text-[10px] text-muted-foreground">Prize Pool</div>
                      <div className="flex items-center gap-1 text-sm font-medium text-gold">
                        <Trophy className="h-3 w-3" /> {pool > 0 ? pool : "—"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                      <div className="text-[10px] text-muted-foreground">Players</div>
                      <div
                        className={
                          "flex items-center gap-1 text-sm font-medium " +
                          (t.player_count >= t.max_players ? "text-emerald-400" : "")
                        }
                      >
                        <Users className="h-3 w-3 text-muted-foreground" />
                        {t.player_count ?? 0}
                        {t.max_players ? "/" + t.max_players : ""}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                      <div className="text-[10px] text-muted-foreground">Status</div>
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {t.status === "live" ? (
                          <span className="text-emerald-400">In Progress</span>
                        ) : t.status === "locked" ? (
                          <span className="text-amber-400">
                            <Countdown startTime={t.starts_at} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Waiting...</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {user &&
                    !registered &&
                    !canAfford &&
                    t.entry_fee_coins > 0 &&
                    t.status === "upcoming" && (
                      <div className="flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Need {t.entry_fee_coins - (wallet?.balance ?? 0)} more coins
                        <Link to="/premium" className="ml-auto font-medium underline">
                          Get Coins
                        </Link>
                      </div>
                    )}

                  <div className="mt-auto flex gap-2">
                    <Link
                      to="/tournament/$id"
                      params={{ id: t.id }}
                      className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-center text-xs text-muted-foreground transition hover:border-gold/30 hover:text-foreground"
                    >
                      Details
                    </Link>
                    {t.status === "live" ? (
                      <Link
                        to="/tournament/$id"
                        params={{ id: t.id }}
                        className="flex w-full flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/20"
                      >
                        <Eye className="h-3.5 w-3.5" /> Watch
                      </Link>
                    ) : t.status === "locked" ? (
                      <span className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500/70 cursor-not-allowed">
                        <Lock className="h-3.5 w-3.5" /> Locked
                      </span>
                    ) : registered ? (
                      <span className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-gold">
                        Registered ✓
                      </span>
                    ) : (
                      <GoldButton
                        onClick={() => handleJoin(t)}
                        disabled={joining === t.id || t.player_count >= t.max_players}
                        className={"flex-1 text-xs " + (!canAfford && user ? "opacity-50" : "")}
                      >
                        {joining === t.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Joining…
                          </>
                        ) : t.entry_fee_coins > 0 ? (
                          <>
                            <Coins className="h-3.5 w-3.5" /> Pay &amp; Join
                          </>
                        ) : (
                          "Join Free"
                        )}
                      </GoldButton>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <PageShell
      eyebrow="The Royal Arena"
      title="Tournaments"
      subtitle="From Friday night arenas to royal championships, the throne is contested daily."
    >
      {user && (
        <div className="mb-8 flex items-center justify-between rounded-2xl border border-gold/15 bg-white/[0.02] px-5 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Coins className="h-4 w-4 text-gold" />
            <span className="text-muted-foreground">Balance:</span>
            <span className="font-display text-lg text-gradient-gold">
              {wallet?.balance ?? 0} coins
            </span>
          </div>
          <Link to="/wallet" className="flex items-center gap-1 text-xs text-gold hover:underline">
            <Wallet className="h-3.5 w-3.5" /> View Wallet
          </Link>
        </div>
      )}

      {loading && (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      )}

      {!loading && error && (
        <Card className="flex items-center gap-3 p-6 text-rose-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <div className="font-medium">Failed to load tournaments</div>
            <div className="text-xs text-muted-foreground">{error}</div>
          </div>
          <button
            onClick={() => void loadTournaments()}
            className="ml-auto text-xs text-gold hover:underline"
          >
            Retry
          </button>
        </Card>
      )}

      {!loading && !error && tournaments.length === 0 && (
        <Card className="p-12 text-center">
          <Crown className="mx-auto mb-3 h-10 w-10 text-gold/30" />
          <div className="text-muted-foreground">No tournaments right now.</div>
        </Card>
      )}

      {!loading && !error && (
        <>
          {renderSection("1 Min Tournaments", oneMin, 0)}
          {renderSection("3 Min Tournaments", threeMin, 10)}
          {renderSection("5 Min Tournaments", fiveMin, 20)}
          {renderSection("10 Min Tournaments", tenMin, 30)}
        </>
      )}
    </PageShell>
  );
}
