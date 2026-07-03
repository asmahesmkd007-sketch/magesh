import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Wifi,
  Crown,
  Swords,
  Gamepad2,
  Trophy,
  Radio,
  Banknote,
  Flag,
  MessagesSquare,
  Coins,
  Lock,
  Gift,
  TrendingUp,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { getDashboardStats, type AdminStats } from "@/lib/api/adminClient";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin — Dashboard — ChessOx" }] }),
  component: () => (
    <AdminShell title="Dashboard">
      <Dashboard />
    </AdminShell>
  ),
});

type Metric = { key: keyof AdminStats; label: string; icon: React.ReactNode; suffix?: string };

const METRICS: Metric[] = [
  { key: "total_users", label: "Total Users", icon: <Users className="h-5 w-5" /> },
  { key: "online_users", label: "Online Now", icon: <Wifi className="h-5 w-5" /> },
  { key: "premium_users", label: "Premium Users", icon: <Crown className="h-5 w-5" /> },
  { key: "new_users_today", label: "New Today", icon: <TrendingUp className="h-5 w-5" /> },
  { key: "active_matches", label: "Active Matches", icon: <Swords className="h-5 w-5" /> },
  { key: "total_games", label: "Total Games", icon: <Gamepad2 className="h-5 w-5" /> },
  { key: "games_today", label: "Games Today", icon: <Gamepad2 className="h-5 w-5" /> },
  { key: "total_tournaments", label: "Tournaments", icon: <Trophy className="h-5 w-5" /> },
  { key: "upcoming_tournaments", label: "Upcoming", icon: <Trophy className="h-5 w-5" /> },
  { key: "live_tournaments", label: "Live Now", icon: <Radio className="h-5 w-5" /> },
  {
    key: "pending_withdrawals",
    label: "Pending Withdrawals",
    icon: <Banknote className="h-5 w-5" />,
  },
  { key: "reports_pending", label: "Reports Pending", icon: <Flag className="h-5 w-5" /> },
  {
    key: "community_posts",
    label: "Community Posts",
    icon: <MessagesSquare className="h-5 w-5" />,
  },
  { key: "coins_in_system", label: "Coins in System", icon: <Coins className="h-5 w-5" /> },
  { key: "locked_coins", label: "Locked Coins", icon: <Lock className="h-5 w-5" /> },
  { key: "prize_distributed", label: "Prizes Paid", icon: <Gift className="h-5 w-5" /> },
  { key: "entry_fees_collected", label: "Entry Fees", icon: <Coins className="h-5 w-5" /> },
  { key: "withdrawals_paid", label: "Withdrawals Paid", icon: <Banknote className="h-5 w-5" /> },
];

function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await getDashboardStats());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load stats");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // near-realtime refresh
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (err) {
    return <Card className="p-6 text-sm text-rose-400">{err}</Card>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Live platform metrics · auto-refresh 15s</p>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-gold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {METRICS.map((m) => (
          <Card key={m.key} className="p-4">
            <div className="flex items-center gap-2 text-gold/80">{m.icon}</div>
            <div className="mt-2 font-display text-2xl">
              {(stats?.[m.key] ?? 0).toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {m.label}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
