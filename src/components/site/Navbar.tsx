import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, ChevronDown, LogOut, Menu, Search, X, Coins, ShieldCheck } from "lucide-react";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { UserAvatar } from "@/components/site/UserAvatar";
import { SeasonShield } from "@/components/ranking/SeasonShield";
import { useAuth, useProfile, signOut } from "@/hooks/useAuth";
import { useNotificationCount } from "@/hooks/useNotificationCount";
import { useWallet } from "@/hooks/useWallet";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const NAV_AUTH = [
  { to: "/home", label: "Home" },
  { to: "/play", label: "Play" },
  { to: "/puzzles", label: "Puzzles" },
  { to: "/tournaments", label: "Tournaments" },
] as const;

/** Shape shared by every nav list (see NavList below). */
type NavEntry = { to: string; label: string; isComingSoon?: boolean };

const COMMUNITY_ITEMS: readonly NavEntry[] = [
  { to: "/community", label: "Community" },
  { to: "/chat", label: "Chat" },
  { to: "/clans", label: "Clans" },
  { to: "/rankings", label: "Rankings" },
  { to: "/seasons", label: "Seasons" },
  { to: "/events", label: "Events", isComingSoon: true },
  { to: "/watch", label: "Watch" },
  { to: "/friends", label: "👥 Friends" },
];

const MORE_ITEMS = [
  { to: "/news", label: "News" },
  { to: "/settings", label: "Settings" },
  { to: "/analysis", label: "Analysis" },
  { to: "/learn", label: "How To Use" },
  { to: "/about-chess", label: "About Chess" },
  { to: "/about", label: "About Us" },
  { to: "/policies", label: "Policies" },
  { to: "/feedback", label: "Feedback" },
  { to: "/report", label: "Report" },
] as const;

const NAV_GUEST = [
  { to: "/watch", label: "Watch" },
  { to: "/community", label: "Community" },
  { to: "/news", label: "News" },
  { to: "/tournaments", label: "Tournaments" },
] as const;

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [communityMenu, setCommunityMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [mobileCommunityOpen, setMobileCommunityOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { profile } = useProfile(user?.id);
  const navigate = useNavigate();
  const unreadCount = useNotificationCount(user?.id);
  const { wallet } = useWallet(user?.id);
  const { isAdmin } = useIsAdmin(user?.id);

  function closeAllDropdowns() {
    setUserMenu(false);
    setCommunityMenu(false);
    setMoreMenu(false);
    setMobileCommunityOpen(false);
    setMobileMoreOpen(false);
  }

  async function handleSignOut() {
    closeAllDropdowns();
    await signOut();
    navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gold/15 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        {/* Logo — Static non-clickable text & icon */}
        <div className="flex shrink-0 items-center gap-2.5 cursor-default select-none">
          <img
            src="/chessox-icon.png"
            alt="ChessOx"
            width={56}
            height={56}
            fetchPriority="high"
            className="h-14 w-auto object-contain pointer-events-none"
            draggable={false}
          />
          <div className="font-display text-[1.75rem] tracking-wide leading-none text-gradient-gold whitespace-nowrap">
            CHESSOX
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {user ? (
            <>
              {NAV_AUTH.map((n) => {
                const active = path === n.to || (n.to !== "/home" && path.startsWith(n.to));
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={closeAllDropdowns}
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${
                      active
                        ? "border border-gold/30 bg-gold/10 text-gold"
                        : "text-ivory/80 hover:text-foreground"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}

              {/* Community dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setCommunityMenu((v) => !v);
                    setMoreMenu(false);
                    setUserMenu(false);
                  }}
                  className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm transition-colors ${
                    COMMUNITY_ITEMS.some((i) => path.startsWith(i.to))
                      ? "border border-gold/30 bg-gold/10 text-gold"
                      : "text-ivory/80 hover:text-foreground"
                  }`}
                >
                  Community{" "}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${communityMenu ? "rotate-180" : ""}`}
                  />
                </button>
                {communityMenu && (
                  <DropdownMenu
                    items={COMMUNITY_ITEMS}
                    onClose={() => setCommunityMenu(false)}
                    onComingSoon={() => setShowComingSoon(true)}
                  />
                )}
              </div>

              {/* Premium */}
              <Link
                to="/premium"
                onClick={closeAllDropdowns}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  path.startsWith("/premium")
                    ? "border border-gold/30 bg-gold/10 text-gold"
                    : "text-ivory/80 hover:text-foreground"
                }`}
              >
                Premium
              </Link>

              {/* More dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setMoreMenu((v) => !v);
                    setCommunityMenu(false);
                    setUserMenu(false);
                  }}
                  className="flex items-center gap-1 rounded-full px-4 py-2 text-sm text-ivory/80 transition-colors hover:text-foreground"
                >
                  More{" "}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${moreMenu ? "rotate-180" : ""}`}
                  />
                </button>
                {moreMenu && <DropdownMenu items={MORE_ITEMS} onClose={() => setMoreMenu(false)} />}
              </div>
            </>
          ) : (
            NAV_GUEST.map((n) => {
              const active = path.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to="/login"
                  search={{ redirect: n.to }}
                  className={`rounded-full px-4 py-2 text-sm transition-colors ${
                    active
                      ? "border border-gold/30 bg-gold/10 text-gold"
                      : "text-ivory/80 hover:text-foreground"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })
          )}
        </nav>

        {/* Desktop right side */}
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          {/* Wallet balance chip */}
          {user && (
            <Link
              to="/wallet"
              onClick={closeAllDropdowns}
              className="flex items-center gap-1.5 rounded-full border border-gold/20 bg-white/[0.03] px-3 py-2 text-xs text-gold transition-colors hover:border-gold/40 hover:bg-gold/10"
            >
              <Coins className="h-3.5 w-3.5" />
              <span className="font-display text-sm">{wallet?.balance ?? 0}</span>
            </Link>
          )}

          {user && (
            <Link
              to="/notifications"
              onClick={closeAllDropdowns}
              className="relative grid h-10 w-10 place-items-center rounded-full border border-gold/20 bg-white/[0.03] text-muted-foreground transition-colors hover:text-gold"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-gold text-[9px] font-bold text-[#0B0D10]">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : (
                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-emerald animate-pulse-dot" />
              )}
            </Link>
          )}

          {user ? (
            <div className="relative">
              <button
                onClick={() => {
                  setUserMenu((v) => !v);
                  setCommunityMenu(false);
                  setMoreMenu(false);
                }}
                className="flex items-center gap-2 rounded-full border border-gold/25 bg-white/[0.03] py-1 pl-1.5 pr-3 text-sm"
              >
                <SeasonShield
                  sp={profile?.season_points ?? 0}
                  rungId={profile?.rung_id}
                  size="xs"
                  variant="icon"
                />
                <UserAvatar
                  avatarUrl={
                    profile?.avatar_url ||
                    (user?.user_metadata?.avatar_url as string | undefined) ||
                    (user?.user_metadata?.picture as string | undefined)
                  }
                  displayName={profile?.full_name ?? user.email}
                  size="sm"
                />
                <span className="max-w-[100px] truncate text-foreground flex items-center gap-1">
                  {profile?.full_name ?? user.email?.split("@")[0]}
                  <PremiumBadge
                    premiumActive={profile?.premium_active}
                    premiumExpiresAt={profile?.premium_expires_at}
                  />
                </span>
              </button>
              {userMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gold/20 bg-background/95 p-2 shadow-xl backdrop-blur-xl space-y-1">
                  <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/10 pb-2">
                    <SeasonShield
                      sp={profile?.season_points ?? 0}
                      rungId={profile?.rung_id}
                      size="sm"
                      variant="chip"
                    />
                  </div>
                  <MenuLink to="/profile" label="Profile" onClick={() => setUserMenu(false)} />
                  <MenuLink to="/dashboard" label="Dashboard" onClick={() => setUserMenu(false)} />
                  <MenuLink
                    to="/play/history"
                    label="Match History"
                    onClick={() => setUserMenu(false)}
                  />
                  <MenuLink
                    to="/notifications"
                    label="Notifications"
                    onClick={() => setUserMenu(false)}
                  />
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setUserMenu(false)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gold hover:bg-gold/10"
                    >
                      <ShieldCheck className="h-4 w-4" /> Admin Panel
                    </Link>
                  )}
                  {/* Wallet link with live balance */}
                  <Link
                    to="/wallet"
                    onClick={() => setUserMenu(false)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/5 hover:text-gold"
                  >
                    <span className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-gold" /> Wallet
                    </span>
                    <span className="rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-xs text-gold">
                      {wallet?.balance ?? 0}
                    </span>
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-white/5 hover:text-gold"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className="rounded-full border border-gold/30 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10"
              >
                Sign in
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="rounded-full gradient-gold px-4 py-2 text-sm font-medium text-background"
              >
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => {
            setMobileOpen((v) => !v);
            closeAllDropdowns();
          }}
          className="ml-auto grid h-11 w-11 place-items-center rounded-full border border-gold/20 bg-white/[0.03] lg:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-gold/15 bg-background/95 lg:hidden max-h-[calc(100vh-72px)] overflow-y-auto custom-scrollbar z-50">
          <div className="mx-auto grid gap-2 px-4 py-4">
            {user ? (
              <>
                {/* 1. Home */}
                <Link
                  to="/home"
                  onClick={() => setMobileOpen(false)}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    path === "/home"
                      ? "border-gold/40 bg-gold/15 text-gold"
                      : "border-gold/15 bg-white/[0.03] text-foreground hover:bg-gold/10 hover:text-gold"
                  }`}
                >
                  Home
                </Link>

                {/* 2. Play */}
                <Link
                  to="/play"
                  onClick={() => setMobileOpen(false)}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    path.startsWith("/play")
                      ? "border-gold/40 bg-gold/15 text-gold"
                      : "border-gold/15 bg-white/[0.03] text-foreground hover:bg-gold/10 hover:text-gold"
                  }`}
                >
                  Play
                </Link>

                {/* 4. Puzzles */}
                <Link
                  to="/puzzles"
                  onClick={() => setMobileOpen(false)}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    path.startsWith("/puzzles")
                      ? "border-gold/40 bg-gold/15 text-gold"
                      : "border-gold/15 bg-white/[0.03] text-foreground hover:bg-gold/10 hover:text-gold"
                  }`}
                >
                  Puzzles
                </Link>

                {/* 5. Tournaments */}
                <Link
                  to="/tournaments"
                  onClick={() => setMobileOpen(false)}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    path.startsWith("/tournaments")
                      ? "border-gold/40 bg-gold/15 text-gold"
                      : "border-gold/15 bg-white/[0.03] text-foreground hover:bg-gold/10 hover:text-gold"
                  }`}
                >
                  Tournaments
                </Link>

                {/* 6. Community Accordion Dropdown */}
                <div className="rounded-xl border border-gold/15 bg-white/[0.03]">
                  <button
                    onClick={() => setMobileCommunityOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:text-gold"
                  >
                    <span>Community</span>
                    <ChevronDown
                      className={`h-4 w-4 text-gold/70 transition-transform ${
                        mobileCommunityOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {mobileCommunityOpen && (
                    <div className="space-y-1 border-t border-gold/10 px-3 py-2 bg-black/20">
                      {COMMUNITY_ITEMS.map((n) =>
                        n.isComingSoon ? (
                          <button
                            key={n.to}
                            onClick={() => {
                              setMobileOpen(false);
                              setShowComingSoon(true);
                            }}
                            className="block w-full text-left rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-white/5 hover:text-gold"
                          >
                            {n.label} (Coming Soon)
                          </button>
                        ) : (
                          <Link
                            key={n.to}
                            to={n.to}
                            onClick={() => setMobileOpen(false)}
                            className={`block rounded-lg px-3 py-2 text-xs font-medium transition ${
                              path.startsWith(n.to)
                                ? "bg-gold/15 text-gold"
                                : "text-foreground hover:bg-white/5 hover:text-gold"
                            }`}
                          >
                            {n.label}
                          </Link>
                        ),
                      )}
                    </div>
                  )}
                </div>

                {/* 7. Premium */}
                <Link
                  to="/premium"
                  onClick={() => setMobileOpen(false)}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    path.startsWith("/premium")
                      ? "border-gold/40 bg-gold/15 text-gold"
                      : "border-gold/15 bg-white/[0.03] text-foreground hover:bg-gold/10 hover:text-gold"
                  }`}
                >
                  Premium
                </Link>

                {/* 8. More Accordion Dropdown */}
                <div className="rounded-xl border border-gold/15 bg-white/[0.03]">
                  <button
                    onClick={() => setMobileMoreOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:text-gold"
                  >
                    <span>More</span>
                    <ChevronDown
                      className={`h-4 w-4 text-gold/70 transition-transform ${
                        mobileMoreOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {mobileMoreOpen && (
                    <div className="space-y-1 border-t border-gold/10 px-3 py-2 bg-black/20">
                      {MORE_ITEMS.map((n) => (
                        <Link
                          key={n.to}
                          to={n.to}
                          onClick={() => setMobileOpen(false)}
                          className={`block rounded-lg px-3 py-2 text-xs font-medium transition ${
                            path.startsWith(n.to)
                              ? "bg-gold/15 text-gold"
                              : "text-foreground hover:bg-white/5 hover:text-gold"
                          }`}
                        >
                          {n.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* User Account / Shortcuts */}
                <div className="pt-2 border-t border-gold/10 space-y-2">
                  <Link
                    to="/notifications"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-xl border border-gold/15 bg-white/[0.03] px-4 py-3 text-sm text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-gold" /> Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-[#0B0D10]">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Link>

                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-gold"
                    >
                      <ShieldCheck className="h-4 w-4" /> Admin Panel
                    </Link>
                  )}

                  <Link
                    to="/wallet"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-xl border border-gold/25 bg-gold/5 px-4 py-3 text-sm text-gold"
                  >
                    <span className="flex items-center gap-2">
                      <Coins className="h-4 w-4" /> Wallet
                    </span>
                    <span className="font-display">{wallet?.balance ?? 0} coins</span>
                  </Link>

                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      handleSignOut();
                    }}
                    className="mt-2 w-full rounded-xl gradient-gold px-4 py-3 text-center text-sm font-medium text-background"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              /* GUEST VIEW */
              <>
                <Link
                  to="/login"
                  search={{ redirect: "/watch" }}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl border border-gold/15 bg-white/[0.03] px-4 py-3 text-sm text-foreground"
                >
                  Watch
                </Link>
                <Link
                  to="/login"
                  search={{ redirect: "/community" }}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl border border-gold/15 bg-white/[0.03] px-4 py-3 text-sm text-foreground"
                >
                  Community
                </Link>
                <Link
                  to="/login"
                  search={{ redirect: "/news" }}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl border border-gold/15 bg-white/[0.03] px-4 py-3 text-sm text-foreground"
                >
                  News
                </Link>
                <Link
                  to="/login"
                  search={{ redirect: "/tournaments" }}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl border border-gold/15 bg-white/[0.03] px-4 py-3 text-sm text-foreground"
                >
                  Tournaments
                </Link>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Link
                    to="/auth"
                    search={{ mode: "signin" }}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-gold/30 px-3 py-3 text-center text-sm font-medium text-gold"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/auth"
                    search={{ mode: "signup" }}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl gradient-gold px-3 py-3 text-center text-sm font-medium text-background"
                  >
                    Sign up
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showComingSoon && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gold/20 bg-background p-6 shadow-2xl relative">
            <button
              onClick={() => setShowComingSoon(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="font-display text-2xl text-gradient-gold mb-2">Coming Soon</h3>
            <p className="text-sm text-muted-foreground mb-6">
              This feature is currently under development and will be available soon.
            </p>
            <button
              onClick={() => setShowComingSoon(false)}
              className="w-full rounded-xl gradient-gold py-2.5 font-medium text-background"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

function DropdownMenu({
  items,
  onClose,
  onComingSoon,
}: {
  items: readonly { to: string; label: string; isComingSoon?: boolean }[];
  onClose: () => void;
  onComingSoon?: () => void;
}) {
  return (
    <div className="absolute left-0 mt-2 w-52 rounded-xl border border-gold/20 bg-background/95 p-1 shadow-xl backdrop-blur-xl">
      {items.map((item) =>
        item.isComingSoon ? (
          <button
            key={item.to}
            onClick={() => {
              onClose();
              onComingSoon?.();
            }}
            className="w-full text-left block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/5 hover:text-gold"
          >
            {item.label}
          </button>
        ) : (
          <Link
            key={item.to}
            to={item.to}
            onClick={onClose}
            className="block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/5 hover:text-gold"
          >
            {item.label}
          </Link>
        ),
      )}
    </div>
  );
}

function MenuLink({ to, label, onClick }: { to: string; label: string; onClick: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/5 hover:text-gold"
    >
      {label}
    </Link>
  );
}
