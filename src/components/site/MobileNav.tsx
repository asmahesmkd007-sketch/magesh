import { Link, useRouterState } from "@tanstack/react-router";
import { GraduationCap, Home, Newspaper, Puzzle, Swords, Trophy, User, Users, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const AUTH_ITEMS = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/play", label: "Play", icon: Swords },
  { to: "/puzzles", label: "Puzzles", icon: Puzzle },
  { to: "/learn", label: "Learn", icon: GraduationCap },
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

  const ITEMS = user ? AUTH_ITEMS : GUEST_ITEMS;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gold/12 bg-background/88 backdrop-blur-xl lg:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5 px-2 py-1">
        {ITEMS.map((item) => {
          const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
          const Icon = item.icon;
          return (
            <li key={item.label}>
              <Link to={item.to} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] ${active ? "text-gold" : "text-muted-foreground"}`}>
                <span className={`grid h-8 w-8 place-items-center rounded-full ${active ? "bg-gold/12" : "bg-white/[0.03]"}`}>
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
