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
  ShieldAlert,
  LifeBuoy,
  MessageSquareText,
  Puzzle as PuzzleIcon,
  UserX,
} from "lucide-react";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { getDashboardStats, type AdminStats } from "@/lib/api/adminClient";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin — Dashboard — ChessOx" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell title="Dashboard">
      <Dashboard />
    </AdminShell>
  ),
});

type Metric = { key: keyof AdminStats; label: string; icon: React.ReactNode };

// Grouped to match the real live schema this now reads from:
// wallets.balance/locked_balance, matches (not games), withdraw_requests,
// tournaments, community_posts/comments, reports+community_reports+chat_reports,
// support_tickets, kyc_requests, puzzles/puzzle_attempts, clans/clan_wars.
const GROUPS: { title: string; metrics: Metric[] }[] = [
  {
    title: "Users",
    metrics: [
      { key: "total_users", label: "Total Users", icon: <Users className="h-5 w-5" /> },
      { key: "online_users", label: "Online Now", icon: <Wifi className="h-5 w-5" /> },
      { key: "new_users_today", label: "New Today", icon: <TrendingUp className="h-5 w-5" /> },
      { key: "premium_users", label: "Premium Users", icon: <Crown className="h-5 w-5" /> },
      { key: "banned_users", label: "Banned / Blocked", icon: <UserX className="h-5 w-5" /> },
      { key: "suspended_users", label: "Suspended / Muted", icon: <UserX className="h-5 w-5" /> },
    ],
  },
  {
    title: "Wallet & Withdrawals",
    metrics: [
      { key: "coins_in_system", label: "Coins in System", icon: <Coins className="h-5 w-5" /> },
      { key: "locked_coins", label: "Locked Coins", icon: <Lock className="h-5 w-5" /> },
      {
        key: "pending_withdrawals",
        label: "Pending Withdrawals",
        icon: <Banknote className="h-5 w-5" />,
      },
      {
        key: "completed_withdrawals",
        label: "Completed Withdrawals",
        icon: <Banknote className="h-5 w-5" />,
      },
      {
        key: "rejected_withdrawals",
        label: "Rejected Withdrawals",
        icon: <Banknote className="h-5 w-5" />,
      },
      {
        key: "withdrawals_amount_pending",
        label: "Pending Amount",
        icon: <Banknote className="h-5 w-5" />,
      },
    ],
  },
  {
    title: "Games & Tournaments",
    metrics: [
      { key: "total_matches", label: "Total Matches", icon: <Gamepad2 className="h-5 w-5" /> },
      { key: "matches_today", label: "Matches Today", icon: <Gamepad2 className="h-5 w-5" /> },
      { key: "live_matches", label: "Live Matches", icon: <Radio className="h-5 w-5" /> },
      {
        key: "total_tournaments",
        label: "Total Tournaments",
        icon: <Trophy className="h-5 w-5" />,
      },
      { key: "live_tournaments", label: "Live Tournaments", icon: <Swords className="h-5 w-5" /> },
      { key: "prize_distributed", label: "Prizes Distributed", icon: <Gift className="h-5 w-5" /> },
    ],
  },
  {
    title: "Community & Moderation",
    metrics: [
      {
        key: "community_posts",
        label: "Community Posts",
        icon: <MessagesSquare className="h-5 w-5" />,
      },
      {
        key: "community_comments",
        label: "Comments",
        icon: <MessageSquareText className="h-5 w-5" />,
      },
      { key: "reports_pending", label: "Reports Pending", icon: <Flag className="h-5 w-5" /> },
      {
        key: "feedback_total",
        label: "Feedback Received",
        icon: <MessageSquareText className="h-5 w-5" />,
      },
      {
        key: "support_tickets_open",
        label: "Open Support Tickets",
        icon: <LifeBuoy className="h-5 w-5" />,
      },
      { key: "kyc_pending", label: "KYC Pending", icon: <ShieldAlert className="h-5 w-5" /> },
    ],
  },
  {
    title: "Puzzles & Clans",
    metrics: [
      { key: "total_puzzles", label: "Total Puzzles", icon: <PuzzleIcon className="h-5 w-5" /> },
      { key: "puzzles_solved", label: "Puzzles Solved", icon: <PuzzleIcon className="h-5 w-5" /> },
      { key: "total_clans", label: "Total Clans", icon: <ShieldAlert className="h-5 w-5" /> },
      { key: "active_clan_wars", label: "Active Clan Wars", icon: <Swords className="h-5 w-5" /> },
    ],
  },
];

// Tables whose changes should trigger a dashboard refetch. Kept to the
// tables that actually back admin_dashboard_stats() so this stays cheap.
const WATCHED_TABLES = [
  "profiles",
  "wallets",
  "withdraw_requests",
  "matches",
  "tournaments",
  "community_posts",
  "community_comments",
  "reports",
  "community_reports",
  "chat_reports",
  "feedbacks",
  "support_tickets",
  "kyc_requests",
  "puzzle_attempts",
  "clan_wars",
];

function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);

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

    // True realtime: any insert/update/delete on a watched table triggers
    // a fresh aggregate fetch. Debounced so a burst of writes (e.g. many
    // puzzle_attempts rows landing at once) collapses into one refetch.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(load, 500);
    };

    const channel = supabase.channel("admin_dashboard_live");
    for (const table of WATCHED_TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table },
        scheduleReload,
      );
    }
    channel.subscribe((status: string) => setLive(status === "SUBSCRIBED"));

    // Fallback poll in case realtime drops (network blip, tab backgrounded).
    const t = setInterval(load, 30000);

    return () => {
      if (debounce) clearTimeout(debounce);
      clearInterval(t);
      supabase.removeChannel(channel);
    };
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
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"}`}
          />
          {live ? "Live — updates automatically" : "Reconnecting…"} · 30s fallback refresh
        </p>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-gold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {group.metrics.map((m) => (
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
      ))}
    </div>
  );
}
