import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LogIn, Sparkles, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { seo, breadcrumbLd, webApplicationLd, webPageLd } from "@/lib/seo";
import heroRegal from "@/assets/hero-regal.jpg";
import tourTrophy from "@/assets/tour-trophy.jpg";
import tourDiwali from "@/assets/tour-diwali.jpg";
import tourPalace from "@/assets/tour-palace.jpg";
import tourLaurel from "@/assets/tour-laurel.jpg";

export const Route = createFileRoute("/")({
  head: () =>
    seo({
      title: "Play Chess Online Free — Online Chess Game | ChessOx",
      description:
        "Play chess online free on ChessOx. Enjoy multiplayer chess online, play chess with friends, solve daily chess puzzles, learn chess, join online chess tournaments and climb the global chess rankings.",
      keywords: [
        "play chess online",
        "online chess game",
        "free online chess",
        "multiplayer chess online",
        "chess puzzles",
        "online chess tournament",
        "online chess India",
      ],
      path: "/",
      jsonLd: [
        webApplicationLd(),
        webPageLd({
          name: "Play Chess Online Free — ChessOx",
          description:
            "ChessOx home page: play chess online against players worldwide, play chess with friends, train with chess puzzles, learn chess and compete in online chess tournaments.",
          path: "/",
          primaryTopic: "Online chess game",
          about: [
            "Online chess game",
            "Chess puzzles",
            "Online chess tournaments",
            "Chess rankings",
          ],
        }),
        breadcrumbLd([{ name: "Home", path: "/" }]),
      ],
    }),
  component: LandingPage,
});

// The arena formats ChessOx actually runs. Entry and prizes are in coins,
// and daily arenas are seeded per time control — see seed_daily_tournaments.
// Nothing here states a prize figure the platform does not award.
const TOURNAMENTS = [
  { name: "Bullet Arena", prize: "1+0 · fastest time control", img: tourLaurel },
  { name: "Blitz Arena", prize: "3+2 · the classic online pace", img: tourDiwali },
  { name: "Rapid Arena", prize: "10+0 · time to think", img: tourPalace },
  { name: "Daily Arenas", prize: "New events opened every day", img: tourTrophy },
];

function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Authenticated users should never see the landing page — send them home.
  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/home" });
    }
  }, [user, loading, navigate]);

  return (
    <div className="relative">
      {/* HERO — left rail + title left, ornate board scene right */}
      <section className="relative min-h-[calc(100vh-80px)] overflow-hidden">
        {/* Background scene */}
        {/* LCP element. Without an explicit priority the browser assigns
            images a low initial priority and starts them behind the entry
            JS/CSS, which delays the largest paint on the landing page by
            roughly a round trip on real connections. */}
        <img
          src={heroRegal}
          alt="Play chess online on ChessOx — hand-carved rosewood chess set with ornate gold inlay"
          width={1920}
          height={1080}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-right"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#160707_0%,rgba(22,7,7,0.95)_28%,rgba(22,7,7,0.55)_52%,rgba(22,7,7,0.1)_78%,transparent_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(22,7,7,0.45)_0%,transparent_22%,transparent_78%,rgba(22,7,7,0.6)_100%)]" />

        {/* Content */}
        <div className="relative mx-auto flex min-h-[calc(100vh-80px)] max-w-[1400px] items-center px-6">
          <div className="max-w-2xl py-16">
            <h1 className="font-display text-[44px] uppercase leading-[0.95] tracking-[0.01em] text-gradient-gold sm:text-[64px] md:text-[78px] lg:text-[88px]">
              The Regal
              <br />
              Game:
              <br />
              Chess of India
            </h1>
            <p className="mt-6 max-w-md text-[15px] tracking-wide text-foreground/75 sm:text-base">
              Experience the Ultimate Premium Chess Journey.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4 sm:gap-6">
              {/* PLAY NOW emerald plate */}
              <Link
                to="/play"
                className="group relative inline-flex h-[58px] items-center justify-center"
                aria-label="Play chess online"
              >
                <span className="absolute inset-0 rounded-[14px] bg-[linear-gradient(180deg,#1f9a7d_0%,#0d7a5f_55%,#0a5b4a_100%)] shadow-[0_8px_24px_-8px_rgba(15,139,109,0.7),inset_0_1px_0_rgba(255,255,255,0.15)]" />
                <span className="absolute inset-[3px] rounded-[11px] border border-gold/60" />
                <span className="absolute -left-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-[linear-gradient(180deg,#1f9a7d,#0a5b4a)] border-l border-t border-gold/60" />
                <span className="absolute -right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-[linear-gradient(180deg,#1f9a7d,#0a5b4a)] border-r border-b border-gold/60" />
                <span className="relative px-8 font-display text-[15px] uppercase tracking-[0.28em] text-[#f7e8bf] transition-transform group-hover:scale-[1.02] sm:px-10 sm:text-lg">
                  Play Now
                </span>
              </Link>

              {/* Join Community CTA */}
              <Link
                to="/community"
                className="group relative inline-flex h-[58px] items-center justify-center"
              >
                <span className="absolute inset-0 rounded-[14px] bg-gold/10" />
                <span className="absolute inset-[3px] rounded-[11px] border border-gold/40 transition-colors group-hover:border-gold/80" />
                <span className="relative px-6 font-display text-[14px] uppercase tracking-[0.2em] text-gold transition-colors group-hover:text-gold/90 sm:px-8 sm:text-[15px]">
                  Join Community
                </span>
              </Link>

              {!user && (
                <div className="flex w-full flex-wrap items-center gap-4 sm:w-auto sm:gap-6 pt-2 sm:pt-0">
                  <Link
                    to="/auth"
                    className="group inline-flex items-center gap-2 font-display text-sm uppercase tracking-[0.2em] text-gold/80 hover:text-gold sm:text-base"
                  >
                    <span className="border-b border-transparent pb-0.5 group-hover:border-gold">
                      Create Account
                    </span>
                  </Link>

                  <Link
                    to="/auth"
                    className="group inline-flex items-center gap-2 font-display text-sm uppercase tracking-[0.2em] text-gold/80 hover:text-gold sm:text-base"
                  >
                    <span className="border-b border-transparent pb-0.5 group-hover:border-gold">
                      Login
                    </span>
                    <LogIn className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>

            {/* Subtle live indicator */}
            <div className="mt-14 flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-gold/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse-dot" />
              Daily arenas · bullet, blitz and rapid
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED TOURNAMENTS */}
      <section className="mx-auto max-w-[1400px] px-6 py-20">
        <div className="flex items-end justify-between gap-6">
          <h2 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            Featured Tournaments
          </h2>
          <Link
            to="/tournaments"
            className="text-xs uppercase tracking-[0.24em] text-gold/70 hover:text-gold"
          >
            View all →
          </Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TOURNAMENTS.map((t) => (
            <div key={t.name} className="surface-card overflow-hidden rounded-2xl">
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={t.img}
                  alt={`${t.name} — online chess tournament on ChessOx`}
                  loading="lazy"
                  width={768}
                  height={576}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
              </div>
              <div className="p-5">
                <div className="font-display text-lg text-foreground">{t.name}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Format: <span className="text-gold">{t.prize}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Coin entry · top 3 share the pool
                </div>
                <Link
                  to="/auth"
                  className="mt-4 grid h-9 place-items-center rounded-md border border-gold/30 bg-gold/10 text-[11px] uppercase tracking-[0.24em] text-gold hover:bg-gold/20"
                >
                  Join Now
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PREMIUM BANNER */}
      <section className="mx-auto max-w-[1400px] px-6 pb-24">
        <Link to="/premium" className="relative block overflow-hidden rounded-[28px]">
          <div className="rosewood-sheen relative p-8 md:p-12">
            <div className="pointer-events-none absolute inset-0 mandala-bg opacity-50" />
            <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div className="flex items-center gap-5">
                <div className="grid h-16 w-16 place-items-center rounded-2xl gradient-gold shadow-gold-glow">
                  <Sparkles className="h-7 w-7 text-background" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.28em] text-gold/80">
                    Premium Membership
                  </div>
                  <div className="mt-1 font-display text-3xl text-gradient-gold">
                    Luxury Membership
                  </div>
                </div>
              </div>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-foreground/90">
                {[
                  "Ad-Free Play",
                  "Exclusive AI Analysis",
                  "Premium Tournaments",
                  "Personalized Learning",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Link>
      </section>
    </div>
  );
}
