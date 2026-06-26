import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle, GoldButton } from "@/components/site/Primitives";
import {
  Trophy,
  Crown,
  Calendar,
  Users,
  Loader2,
  Coins,
  Wallet,
  AlertCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
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
  format: string | null;
  prize_pool: string | null;
  starts_at: string | null;
  status: "upcoming" | "live" | "finished";
  player_count: number | null;
  max_players: number | null;
  cover_gradient: string | null;
  winner_display: string | null;
  time_control: string | null;
  entry_fee_coins: number;
  prize_1st: number;
  prize_2nd: number;
  prize_3rd: number;
};

const GRADIENTS = [
  "from-amber-500 to-rose-700",
  "from-emerald-500 to-teal-700",
  "from-violet-500 to-indigo-700",
];

function relDate(iso: string | null) {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  const d = Math.ceil(diff / 86400000);
  if (d <= 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

function shortDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function PrizeBadges({ t }: { t: Tournament }) {
  if (!t.prize_1st && !t.prize_2nd && !t.prize_3rd) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {t.prize_1st > 0 && (
        <span className="flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] text-gold">
          🥇 {t.prize_1st}
        </span>
      )}
      {t.prize_2nd > 0 && (
        <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
          🥈 {t.prize_2nd}
        </span>
      )}
      {t.prize_3rd > 0 && (
        <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
          🥉 {t.prize_3rd}
        </span>
      )}
    </div>
  );
}

function Tournaments() {
  const { user } = useAuth();
  const { wallet } = useWallet(user?.id);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [myEntries, setMyEntries] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("tournaments")
      .select(
        "id,name,format,prize_pool,starts_at,status,player_count,max_players,cover_gradient,winner_display,time_control,entry_fee_coins,prize_1st,prize_2nd,prize_3rd",
      )
      .order("starts_at", { ascending: true })
      .limit(30)
      .then(({ data }) => {
        setTournaments((data ?? []) as unknown as Tournament[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("tournament_entries")
      .select("tournament_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setMyEntries(new Set((data ?? []).map((r: { tournament_id: string }) => r.tournament_id)));
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
      if (t.entry_fee_coins > 0) {
        toast.success(`Registered! ${t.entry_fee_coins} coins deducted from your wallet.`);
      } else {
        toast.success("Registered successfully!");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not register";
      if (msg.includes("Insufficient wallet balance")) {
        const needed = t.entry_fee_coins - (wallet?.balance ?? 0);
        toast.error(
          `Insufficient wallet balance. You need ${needed} more coins.`,
          {
            action: {
              label: "Get Coins",
              onClick: () => window.location.assign("/premium"),
            },
          },
        );
      } else if (msg.includes("Already registered")) {
        toast.info("You are already registered for this tournament.");
        setMyEntries((prev) => new Set([...prev, t.id]));
      } else {
        toast.error(msg);
      }
    }
    setJoining(null);
  }

  const upcoming = tournaments.filter((t) => t.status === "upcoming");
  const live = tournaments.filter((t) => t.status === "live");
  const finished = tournaments.filter((t) => t.status === "finished");

  if (loading) {
    return (
      <PageShell
        eyebrow="The Royal Arena"
        title="Tournaments"
        subtitle="From Friday night arenas to royal championships."
      >
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="The Royal Arena"
      title="Tournaments"
      subtitle="From Friday night arenas to royal championships, the throne is contested daily."
    >
      {/* Wallet balance strip for logged-in users */}
      {user && (
        <div className="mb-8 flex items-center justify-between rounded-2xl border border-gold/15 bg-white/[0.02] px-5 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Coins className="h-4 w-4 text-gold" />
            <span className="text-muted-foreground">Your balance:</span>
            <span className="font-display text-lg text-gradient-gold">
              {wallet?.balance ?? 0} coins
            </span>
          </div>
          <Link to="/wallet" className="flex items-center gap-1 text-xs text-gold hover:underline">
            <Wallet className="h-3.5 w-3.5" /> View Wallet
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <SectionTitle kicker="Upcoming" title="Coming up" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((t, i) => {
              const canAfford =
                !t.entry_fee_coins || (wallet?.balance ?? 0) >= t.entry_fee_coins;
              const registered = myEntries.has(t.id);

              return (
                <Link to="/tournament" key={t.id}>
                  <Card className="overflow-hidden transition-transform hover:-translate-y-1">
                    <div
                      className={`relative aspect-[16/9] bg-gradient-to-br ${t.cover_gradient ?? GRADIENTS[i % GRADIENTS.length]}`}
                    >
                      <div className="absolute inset-0 mandala-bg opacity-50" />
                      <Crown className="absolute right-4 top-4 h-6 w-6 text-white/80" />
                      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                        <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs backdrop-blur">
                          {t.format ?? "Open"}
                        </span>
                        <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs text-gold backdrop-blur">
                          {relDate(t.starts_at)}
                        </span>
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="font-display text-xl">{t.name}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" /> {relDate(t.starts_at)} ·{" "}
                        {shortDate(t.starts_at)}
                      </div>

                      {/* Entry fee + prize pool */}
                      <div className="mt-3 flex items-center justify-between">
                        <div>
                          {t.entry_fee_coins > 0 ? (
                            <span className="flex items-center gap-1 text-sm font-medium text-gold">
                              <Coins className="h-3.5 w-3.5" />
                              {t.entry_fee_coins} coins entry
                            </span>
                          ) : (
                            <span className="text-sm text-emerald-400">Free Entry</span>
                          )}
                          <PrizeBadges t={t} />
                        </div>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" /> {t.player_count ?? 0}
                          {t.max_players ? `/${t.max_players}` : ""}
                        </span>
                      </div>

                      {/* Insufficient balance warning */}
                      {user && !registered && !canAfford && t.entry_fee_coins > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          Need {t.entry_fee_coins - (wallet?.balance ?? 0)} more coins
                          <Link
                            to="/premium"
                            className="ml-auto font-medium underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Get Coins
                          </Link>
                        </div>
                      )}

                      <div className="mt-3" onClick={(e) => e.preventDefault()}>
                        {registered ? (
                          <span className="rounded-full border border-gold/30 px-3 py-1 text-xs text-gold">
                            Registered ✓
                          </span>
                        ) : (
                          <GoldButton
                            onClick={() => handleJoin(t)}
                            disabled={joining === t.id}
                            className={!canAfford && user ? "opacity-50" : ""}
                          >
                            {joining === t.id ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Registering…</>
                            ) : t.entry_fee_coins > 0 ? (
                              <><Coins className="h-3.5 w-3.5" /> Pay &amp; Register</>
                            ) : (
                              "Register"
                            )}
                          </GoldButton>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {live.length > 0 && (
        <>
          <SectionTitle kicker="Live" title="Now playing" />
          <div className="grid gap-3 md:grid-cols-2">
            {live.map((t) => (
              <Card key={t.id} className="flex items-center justify-between p-5">
                <div>
                  <div className="font-display text-lg">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.format}</div>
                  {t.prize_1st > 0 && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-gold">
                      <Coins className="h-3 w-3" /> Prize Pool:{" "}
                      {t.prize_1st + t.prize_2nd + t.prize_3rd} coins
                    </div>
                  )}
                </div>
                <span className="rounded-full bg-emerald/20 px-3 py-1 text-xs text-emerald">
                  ● Live · {t.player_count ?? 0} players
                </span>
              </Card>
            ))}
          </div>
        </>
      )}

      {finished.length > 0 && (
        <>
          <SectionTitle kicker="Archive" title="Completed events" />
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Event</th>
                  <th className="px-4 py-3 text-left">Format</th>
                  <th className="px-4 py-3 text-left">Winner</th>
                  <th className="px-4 py-3 text-left">Prize Pool</th>
                </tr>
              </thead>
              <tbody>
                {finished.map((t) => (
                  <tr key={t.id} className="border-t border-white/5">
                    <td className="px-4 py-3 font-display">{t.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.format ?? "—"}</td>
                    <td className="px-4 py-3">
                      {t.winner_display ? (
                        <span className="flex items-center gap-1">
                          <Trophy className="h-3.5 w-3.5 text-gold" />
                          {t.winner_display}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.prize_1st ? (
                        <span className="flex items-center gap-1 text-gold">
                          <Coins className="h-3.5 w-3.5" />
                          {t.prize_1st + t.prize_2nd + t.prize_3rd}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t.prize_pool ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tournaments.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No tournaments scheduled. Check back soon!
        </Card>
      )}
    </PageShell>
  );
}
