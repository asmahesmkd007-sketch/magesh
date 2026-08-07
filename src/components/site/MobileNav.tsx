import { useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  GraduationCap,
  Home,
  Newspaper,
  Puzzle,
  Swords,
  Trophy,
  User,
  Users,
  LogIn,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const AUTH_ITEMS = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/play", label: "Play", icon: Swords },
  { to: "/puzzles", label: "Puzzles", icon: Puzzle },
  { to: "/learn", label: "How To Use", icon: GraduationCap },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const GUEST_ITEMS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/community", label: "Community", icon: Users },
  { to: "/news", label: "News", icon: Newspaper },
  { to: "/tournaments", label: "Tourneys", icon: Trophy },
  { to: "/auth", label: "Sign in", icon: LogIn },
] as const;

export function MobileNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const navRef = useRef<HTMLElement>(null);

  // Publish this bar's real height so full-height panes (chat) can subtract it
  // instead of guessing. The height is not a constant: signed-in renders six
  // columns instead of five, so a long label like "How To Use" wraps to a
  // second line at 320px and the bar grows. A hardcoded token drifts silently
  // and the bar starts covering the message composer. `lg:hidden` makes this
  // measure 0 at lg, which is also the correct value there.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty("--mobile-nav-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--mobile-nav-h");
    };
  }, [user]);

  const ITEMS = user ? AUTH_ITEMS : GUEST_ITEMS;
  return (
    <nav
      ref={navRef}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-gold/12 bg-background/88 backdrop-blur-xl lg:hidden"
    >
      <ul className={`mx-auto grid max-w-md px-2 py-1 ${user ? "grid-cols-6" : "grid-cols-5"}`}>
        {ITEMS.map((item) => {
          const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
          const Icon = item.icon;
          return (
            <li key={item.label}>
              <Link
                to={item.to}
                className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] ${active ? "text-gold" : "text-muted-foreground"}`}
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full ${active ? "bg-gold/12" : "bg-white/[0.03]"}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
