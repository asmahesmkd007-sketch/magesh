import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, ChevronDown, Crown, LogOut, Menu, Search, X } from "lucide-react";
import { useAuth, useProfile, signOut, initials } from "@/hooks/useAuth";

const NAV_AUTH = [
  { to: "/home", label: "Home" },
  { to: "/play", label: "Play" },
  { to: "/puzzles", label: "Puzzles" },
  { to: "/tournaments", label: "Tournaments" },
] as const;

const COMMUNITY_ITEMS = [
  { to: "/community", label: "Open Community" },
  { to: "/room", label: "Room Chat" },
  { to: "/clubs", label: "Clan / Club" },
  { to: "/leaderboards", label: "Leaderboard" },
  { to: "/news", label: "News" },
] as const;

const MORE_ITEMS = [
  { to: "/settings", label: "Settings" },
  { to: "/analysis", label: "Analyze" },
  { to: "/learn", label: "How To Play" },
  { to: "/premium", label: "Shop" },
  { to: "/profile", label: "About Us" },
] as const;

const NAV_GUEST = [
  { to: "/community", label: "Community" },
  { to: "/news", label: "News" },
  { to: "/tournaments", label: "Tournaments" },
] as const;

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [communityMenu, setCommunityMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { profile } = useProfile(user?.id);
  const navigate = useNavigate();

  function closeAllDropdowns() {
    setUserMenu(false);
    setCommunityMenu(false);
    setMoreMenu(false);
  }

  async function handleSignOut() {
    closeAllDropdowns();
    await signOut();
    navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gold/15 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          to={user ? "/home" : "/"}
          className="flex items-center gap-3"
          onClick={closeAllDropdowns}
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl gradient-gold text-background shadow-gold-glow">
            <Crown className="h-5 w-5" />
          </span>
          <div>
            <div className="font-display text-[1.65rem] leading-none text-gradient-gold">ChessOx</div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Royal Chess Platform</div>
          </div>
        </Link>

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
                      active ? "border border-gold/30 bg-gold/10 text-gold" : "text-ivory/80 hover:text-foreground"
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
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${communityMenu ? "rotate-180" : ""}`} />
                </button>
                {communityMenu && (
                  <DropdownMenu items={COMMUNITY_ITEMS} onClose={() => setCommunityMenu(false)} />
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
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreMenu ? "rotate-180" : ""}`} />
                </button>
                {moreMenu && (
                  <DropdownMenu items={MORE_ITEMS} onClose={() => setMoreMenu(false)} />
                )}
              </div>
            </>
          ) : (
            NAV_GUEST.map((n) => {
              const active = path.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`rounded-full px-4 py-2 text-sm transition-colors ${
                    active ? "border border-gold/30 bg-gold/10 text-gold" : "text-ivory/80 hover:text-foreground"
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
          <Link
            to="/search"
            onClick={closeAllDropdowns}
            className="grid h-10 w-10 place-items-center rounded-full border border-gold/20 bg-white/[0.03] text-muted-foreground transition-colors hover:text-gold"
          >
            <Search className="h-4 w-4" />
          </Link>

          {user && (
            <Link
              to="/notifications"
              onClick={closeAllDropdowns}
              className="relative grid h-10 w-10 place-items-center rounded-full border border-gold/20 bg-white/[0.03] text-muted-foreground transition-colors hover:text-gold"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-emerald animate-pulse-dot" />
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
                className="flex items-center gap-2 rounded-full border border-gold/25 bg-white/[0.03] py-1 pl-1 pr-3 text-sm"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full gradient-gold text-xs font-bold text-background">
                  {initials(profile?.display_name ?? user.email)}
                </span>
                <span className="max-w-[100px] truncate text-foreground">
                  {profile?.username ?? user.email?.split("@")[0]}
                </span>
              </button>
              {userMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-gold/20 bg-background/95 p-1 shadow-xl backdrop-blur-xl">
                  <MenuLink to="/home" label="Home" onClick={() => setUserMenu(false)} />
                  <MenuLink to="/profile" label="Profile" onClick={() => setUserMenu(false)} />
                  <MenuLink to="/settings" label="Settings" onClick={() => setUserMenu(false)} />
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
                className="rounded-full border border-gold/30 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10"
              >
                Sign in
              </Link>
              <Link
                to="/auth"
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
          className="grid h-11 w-11 place-items-center rounded-full border border-gold/20 bg-white/[0.03] lg:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-gold/15 bg-background/95 lg:hidden">
          <div className="mx-auto grid gap-2 px-4 py-4">
            {user ? (
              <>
                {NAV_AUTH.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-gold/15 bg-white/[0.03] px-4 py-3 text-sm text-foreground"
                  >
                    {n.label}
                  </Link>
                ))}
                <div className="px-1 pt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Community
                </div>
                {COMMUNITY_ITEMS.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-gold/15 bg-white/[0.03] px-4 py-3 text-sm text-foreground"
                  >
                    {n.label}
                  </Link>
                ))}
                <Link
                  to="/premium"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl border border-gold/15 bg-white/[0.03] px-4 py-3 text-sm text-foreground"
                >
                  Premium
                </Link>
                <div className="px-1 pt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  More
                </div>
                {MORE_ITEMS.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-gold/15 bg-white/[0.03] px-4 py-3 text-sm text-foreground"
                  >
                    {n.label}
                  </Link>
                ))}
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    handleSignOut();
                  }}
                  className="mt-2 rounded-xl gradient-gold px-4 py-3 text-center text-sm font-medium text-background"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                {NAV_GUEST.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-gold/15 bg-white/[0.03] px-4 py-3 text-sm text-foreground"
                  >
                    {n.label}
                  </Link>
                ))}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Link
                    to="/auth"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-gold/30 px-3 py-3 text-center text-sm font-medium text-gold"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/auth"
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
    </header>
  );
}

function DropdownMenu({
  items,
  onClose,
}: {
  items: readonly { to: string; label: string }[];
  onClose: () => void;
}) {
  return (
    <div className="absolute left-0 mt-2 w-52 rounded-xl border border-gold/20 bg-background/95 p-1 shadow-xl backdrop-blur-xl">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onClose}
          className="block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/5 hover:text-gold"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function MenuLink({
  to,
  label,
  onClick,
}: {
  to: string;
  label: string;
  onClick: () => void;
}) {
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
