// =====================================================================
// ADMIN SHELL — sidebar layout + hard access guard
// ---------------------------------------------------------------------
// Every /admin/* page renders inside this. The guard here only controls
// what the browser SHOWS; the real enforcement is that every admin RPC
// re-checks is_admin() server-side. Non-admins are redirected home.
// =====================================================================
import { type ReactNode, useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Trophy,
  Wallet,
  Banknote,
  MessagesSquare,
  MessageSquareWarning,
  Crown,
  Flag,
  Puzzle as PuzzleIcon,
  BarChart3,
  BookOpen,
  FileText,
  ScrollText,
  Settings,
  ShieldAlert,
  Loader2,
  Inbox,
  ListOrdered,
  CalendarClock,
  Swords,
  Shield,
  IdCard,
  LifeBuoy,
  Gauge,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";

type NavItem = { to: string; label: string; icon: ReactNode };

const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" /> },
  { to: "/admin/tournaments", label: "Tournaments", icon: <Trophy className="h-4 w-4" /> },
  { to: "/admin/tr", label: "Tournament Room (TR)", icon: <Swords className="h-4 w-4" /> },
  { to: "/admin/clans", label: "Clans", icon: <Shield className="h-4 w-4" /> },
  { to: "/admin/leaderboard", label: "Leaderboard", icon: <ListOrdered className="h-4 w-4" /> },
  { to: "/admin/seasons", label: "Seasons", icon: <CalendarClock className="h-4 w-4" /> },
  { to: "/admin/ranking", label: "Ranking System", icon: <Gauge className="h-4 w-4" /> },
  { to: "/admin/puzzles", label: "Puzzles", icon: <PuzzleIcon className="h-4 w-4" /> },
  { to: "/admin/wallet", label: "Wallet", icon: <Wallet className="h-4 w-4" /> },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: <Banknote className="h-4 w-4" /> },
  { to: "/admin/kyc", label: "KYC Review", icon: <IdCard className="h-4 w-4" /> },
  { to: "/admin/support", label: "Support Tickets", icon: <LifeBuoy className="h-4 w-4" /> },
  { to: "/admin/community", label: "Community", icon: <MessagesSquare className="h-4 w-4" /> },
  { to: "/admin/chat", label: "Chat", icon: <MessageSquareWarning className="h-4 w-4" /> },
  { to: "/admin/premium", label: "Premium", icon: <Crown className="h-4 w-4" /> },
  { to: "/admin/anticheat", label: "Anti-Cheat", icon: <ShieldAlert className="h-4 w-4" /> },
  { to: "/admin/reports", label: "Reports", icon: <Flag className="h-4 w-4" /> },
  { to: "/admin/feedback", label: "Feedback", icon: <Inbox className="h-4 w-4" /> },
  { to: "/admin/about-chess", label: "About Chess", icon: <BookOpen className="h-4 w-4" /> },
  { to: "/admin/policies", label: "Policies", icon: <FileText className="h-4 w-4" /> },
  { to: "/admin/analytics", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> },
  { to: "/admin/logs", label: "Audit Logs", icon: <ScrollText className="h-4 w-4" /> },
  { to: "/admin/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
];

export function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin(user?.id);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const loading = authLoading || roleLoading;

  // Redirect non-admins away once we're certain of their role.
  useEffect(() => {
    if (!loading && !isAdmin) {
      const t = setTimeout(() => navigate({ to: "/home" }), 1800);
      return () => clearTimeout(t);
    }
  }, [loading, isAdmin, navigate]);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <div className="max-w-sm rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-rose-400" />
          <h1 className="mt-3 font-display text-2xl">Access Denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This area is restricted to administrators. Redirecting you home…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6 lg:px-8">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-20">
          <div className="mb-4 flex items-center gap-2 px-3">
            <ShieldAlert className="h-5 w-5 text-gold" />
            <span className="font-display text-lg text-gradient-gold">Admin</span>
          </div>
          <nav className="space-y-1">
            {NAV.map((n) => {
              const active = n.to === "/admin" ? pathname === "/admin" : pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-gold/10 text-gold"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  {n.icon}
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1">
        {/* Mobile nav */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2 lg:hidden">
          {NAV.map((n) => {
            const active = n.to === "/admin" ? pathname === "/admin" : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                  active
                    ? "border-gold/40 bg-gold/10 text-gold"
                    : "border-white/10 text-muted-foreground"
                }`}
              >
                {n.icon}
                {n.label}
              </Link>
            );
          })}
        </div>

        <h1 className="mb-5 font-display text-3xl md:text-4xl">{title}</h1>
        {children}
      </main>
    </div>
  );
}
