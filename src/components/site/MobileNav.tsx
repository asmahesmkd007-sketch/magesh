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

type GuestItem = {
  to: string;
  target: string;
  redirect?: string;
  label: string;
  icon: typeof Home;
};

const GUEST_ITEMS: readonly GuestItem[] = [
  { to: "/", target: "/", label: "Home", icon: Home },
  { to: "/community", target: "/login", redirect: "/community", label: "Community", icon: Users },
  { to: "/news", target: "/login", redirect: "/news", label: "News", icon: Newspaper },
  { to: "/tournaments", target: "/login", redirect: "/tournaments", label: "Tourneys", icon: Trophy },
  { to: "/login", target: "/login", label: "Sign in", icon: LogIn },
];

export function MobileNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const navRef = useRef<HTMLElement>(null);

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

  return (
    <nav
      ref={navRef}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-gold/12 bg-background/88 backdrop-blur-xl lg:hidden"
    >
      <ul className={`mx-auto grid max-w-md px-2 py-1 ${user ? "grid-cols-6" : "grid-cols-5"}`}>
        {user ? (
          AUTH_ITEMS.map((item) => {
            const active = path.startsWith(item.to);
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
          })
        ) : (
          GUEST_ITEMS.map((item) => {
            const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <Link
                  to={item.target}
                  search={item.redirect ? { redirect: item.redirect } : undefined}
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
          })
        )}
      </ul>
    </nav>
  );
}
