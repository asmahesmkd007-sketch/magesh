import { Link, useLocation } from "@tanstack/react-router";

// Social media icon components — inline SVGs for zero extra dependencies
function IconFacebook({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
    </svg>
  );
}

function IconInstagram({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.259 5.629L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function IconDiscord({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function IconYouTube({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: "https://facebook.com/chessoxcom",
    Icon: IconFacebook,
  },
  {
    label: "Instagram",
    href: "https://instagram.com/chessoxcom",
    Icon: IconInstagram,
  },
  {
    label: "X (Twitter)",
    href: "https://x.com/chessoxcom",
    Icon: IconX,
  },
  {
    label: "Discord",
    href: "https://discord.gg/Ntm6STVCA6",
    Icon: IconDiscord,
  },
  {
    label: "YouTube",
    href: "https://youtube.com/@chessoxcom",
    Icon: IconYouTube,
  },
] as const;

export function Footer() {
  const location = useLocation();
  const isLandingOrAuthPage = location.pathname === "/" || location.pathname === "/auth";

  return (
    <footer className="mt-12 border-t border-gold/12 bg-[linear-gradient(180deg,rgba(32,8,8,0.8),rgba(16,4,4,0.95))]">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 md:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-8">
        {/* Brand column */}
        <div>
          <div className="flex items-center gap-2.5">
            <img
              src="/chessox-icon.ico"
              alt="ChessOx logo — online chess platform"
              className="h-14 w-auto object-contain"
              draggable={false}
            />
            <div className="font-display text-3xl tracking-wide leading-none text-gradient-gold whitespace-nowrap">
              CHESSOX
            </div>
          </div>

          <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
            A premium chess world inspired by the birthplace of the game.
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald/30 bg-emerald/10 px-2.5 py-1 text-[11px] text-emerald">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse-dot" />
            Live arena atmosphere
          </div>

          {/* Social media icons */}
          <div className="mt-4 flex items-center gap-2">
            {SOCIAL_LINKS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`ChessOx on ${label}`}
                className="grid h-8 w-8 place-items-center rounded-lg border border-gold/20 bg-white/[0.03] text-muted-foreground transition-colors hover:border-gold/50 hover:bg-gold/10 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                <Icon className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </div>

        {/* Nav link groups or Big Watermark on landing page/auth */}
        {isLandingOrAuthPage && (
          <div className="hidden md:flex md:col-span-3 flex-col items-center justify-center opacity-10 pointer-events-none select-none">
            <div className="font-display text-[5rem] lg:text-[7rem] leading-none tracking-[0.15em] text-gold text-center whitespace-nowrap">
              CHESSOX
            </div>
          </div>
        )}

        {!isLandingOrAuthPage &&
          [
            {
              title: "Platform",
              links: [
                ["Play", "/play"],
                ["Puzzles", "/puzzles"],
                ["Tournaments", "/tournaments"],
                ["Rankings", "/rankings"],
                ["Leaderboards", "/leaderboards"],
              ],
            },
            {
              title: "Academy",
              links: [
                ["Masterclasses", "/learn"],
                ["Openings", "/openings"],
                ["Analysis", "/analysis"],
                ["About Chess", "/about-chess"],
                ["Premium", "/premium"],
              ],
            },
            {
              title: "World",
              links: [
                ["Community", "/community"],
                ["Clubs", "/clans"],
                ["News", "/news"],
                ["About Us", "/about"],
                ["Settings", "/settings"],
              ],
            },
          ].map((group) => (
            <div key={group.title}>
              <div className="text-[10px] uppercase tracking-[0.24em] text-gold/75">
                {group.title}
              </div>
              <ul className="mt-2.5 space-y-1.5 text-xs text-foreground/85">
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

      {/* Policies */}
      <div className="border-t border-gold/10 px-6 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          <span className="text-[10px] uppercase tracking-[0.24em] text-gold/75">Policies</span>
          {[
            ["Privacy Policy", "/privacy-policy"],
            ["Terms & Conditions", "/terms-and-conditions"],
            ["Refund Policy", "/refund-policy"],
            ["Withdrawal Policy", "/withdrawal-policy"],
            ["Community Policy", "/community-policy"],
            ["Fair Play & Anti-Cheating Policy", "/fair-play-anti-cheating-policy"],
            ["Contact & Grievance Policy", "/contact-grievance-policy"],
          ].map(([label, to]) => (
            <Link key={to} to={to} className="transition-colors hover:text-gold">
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gold/10 px-6 py-3 text-center text-[11px] text-muted-foreground">
        © {new Date().getFullYear()} ChessOx · Royal Indian Chess Experience
      </div>
    </footer>
  );
}
