import { Link } from "@tanstack/react-router";
import { Crown } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-gold/12 bg-[linear-gradient(180deg,rgba(32,8,8,0.8),rgba(16,4,4,0.95))]">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl gradient-gold text-background shadow-gold-glow">
              <Crown className="h-5 w-5" />
            </span>
            <div>
              <div className="font-display text-3xl leading-none text-gradient-gold">ChessOx</div>
              <div className="text-[10px] uppercase tracking-[0.26em] text-muted-foreground">Birthplace of chess · reimagined</div>
            </div>
          </div>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
            A premium chess world inspired by the birthplace of the game.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-3 py-1.5 text-xs text-emerald">
            <span className="h-2 w-2 rounded-full bg-emerald animate-pulse-dot" />
            Live arena atmosphere
          </div>
        </div>

        {[
          { title: "Platform", links: [["Play", "/play"], ["Puzzles", "/puzzles"], ["Tournaments", "/tournaments"], ["Leaderboards", "/leaderboards"]] },
          { title: "Academy", links: [["Masterclasses", "/learn"], ["Openings", "/openings"], ["Analysis", "/analysis"], ["Premium", "/premium"]] },
          { title: "World", links: [["Community", "/community"], ["Clubs", "/clubs"], ["News", "/news"], ["Settings", "/settings"]] },
        ].map((group) => (
          <div key={group.title}>
            <div className="text-[11px] uppercase tracking-[0.24em] text-gold/75">{group.title}</div>
            <ul className="mt-4 space-y-2.5 text-sm text-foreground/85">
              {group.links.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="transition-colors hover:text-gold">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-gold/10 px-6 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ChessOx · Royal Indian Chess Experience
      </div>
    </footer>
  );
}
