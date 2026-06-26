import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Crown, Puzzle, Trophy, User, LogIn, Sparkles, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import heroRegal from "@/assets/hero-regal.jpg";
import tourTrophy from "@/assets/tour-trophy.jpg";
import tourDiwali from "@/assets/tour-diwali.jpg";
import tourPalace from "@/assets/tour-palace.jpg";
import tourLaurel from "@/assets/tour-laurel.jpg";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "ChessOx — The Regal Game: Chess of India" }] }),
  component: LandingPage,
});

const RAIL = [
  { label: "Play", to: "/play", icon: Crown },
  { label: "Puzzles", to: "/puzzles", icon: Puzzle },
  { label: "Tournaments", to: "/tournaments", icon: Trophy },
  { label: "Profile", to: "/profile", icon: User },
] as const;

const TOURNAMENTS = [
  { name: "Grandmaster Challenge", prize: "₹10,00,000+", img: tourLaurel },
  { name: "Diwali Open", prize: "₹10,00,000+", img: tourDiwali },
  { name: "The Pallace Open", prize: "₹10,00,000+", img: tourPalace },
  { name: "Gold Tournament", prize: "₹10,00,000+", img: tourTrophy },
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
        <img
          src={heroRegal}
          alt="Hand-carved rosewood chess set with ornate gold inlay"
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover object-right"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#160707_0%,rgba(22,7,7,0.95)_28%,rgba(22,7,7,0.55)_52%,rgba(22,7,7,0.1)_78%,transparent_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(22,7,7,0.45)_0%,transparent_22%,transparent_78%,rgba(22,7,7,0.6)_100%)]" />

        {/* Left vertical rail */}
        <div className="absolute left-0 top-0 hidden h-full w-[108px] flex-col items-center border-r border-gold/15 bg-[#0f0505]/60 backdrop-blur-sm lg:flex">
          <Link
            to="/"
            className="mt-7 grid h-12 w-12 place-items-center rounded-lg border border-gold/30 bg-background/40"
          >
            <span className="text-2xl text-gold/80">✦</span>
          </Link>
          <div className="mt-10 flex flex-col gap-2">
            {RAIL.map((item, i) => {
              const active = i === 0;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`group relative flex w-[72px] flex-col items-center gap-1.5 rounded-xl px-2 py-3 transition-colors ${
                    active ? "bg-gold/10" : "hover:bg-gold/5"
                  }`}
                >
                  {active && (
                    <span className="absolute right-[-12px] top-1/2 h-10 w-[3px] -translate-y-1/2 rounded-l-full gradient-gold" />
                  )}
                  <item.icon
                    className={`h-5 w-5 ${active ? "text-gold" : "text-gold/55 group-hover:text-gold/80"}`}
                  />
                  <span
                    className={`text-[10px] uppercase tracking-[0.2em] ${active ? "text-gold" : "text-gold/55 group-hover:text-gold/80"}`}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="relative mx-auto flex min-h-[calc(100vh-80px)] max-w-[1400px] items-center px-6 pl-6 lg:pl-[148px]">
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

            <div className="mt-10 flex items-center gap-8">
              {/* PLAY NOW emerald plate */}
              <Link
                to="/play"
                className="group relative inline-flex h-[58px] items-center justify-center"
                aria-label="Play now"
              >
                <span className="absolute inset-0 rounded-[14px] bg-[linear-gradient(180deg,#1f9a7d_0%,#0d7a5f_55%,#0a5b4a_100%)] shadow-[0_8px_24px_-8px_rgba(15,139,109,0.7),inset_0_1px_0_rgba(255,255,255,0.15)]" />
                <span className="absolute inset-[3px] rounded-[11px] border border-gold/60" />
                <span className="absolute -left-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-[linear-gradient(180deg,#1f9a7d,#0a5b4a)] border-l border-t border-gold/60" />
                <span className="absolute -right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-[linear-gradient(180deg,#1f9a7d,#0a5b4a)] border-r border-b border-gold/60" />
                <span className="relative px-10 font-display text-lg uppercase tracking-[0.28em] text-[#f7e8bf] transition-transform group-hover:scale-[1.02]">
                  Play Now
                </span>
              </Link>

              {/* Only show Login link when not authenticated */}
              {!user && (
                <Link
                  to="/auth"
                  className="group inline-flex items-baseline gap-2 font-display text-xl uppercase tracking-[0.28em] text-gold/90 hover:text-gold"
                >
                  <span className="border-b border-gold/60 pb-0.5 group-hover:border-gold">
                    Login
                  </span>
                  <LogIn className="h-4 w-4 self-center" />
                </Link>
              )}
            </div>

            {/* Subtle live indicator */}
            <div className="mt-14 flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-gold/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse-dot" />
              Maharaja Cup 2026 · live qualifiers
            </div>
          </div>
        </div>

        {/* Top-right login (only for guests) */}
        {!user && (
          <Link
            to="/auth"
            className="absolute right-8 top-6 hidden items-center gap-2 font-display text-sm uppercase tracking-[0.28em] text-gold/85 hover:text-gold lg:inline-flex"
          >
            <LogIn className="h-4 w-4" /> Login
          </Link>
        )}
      </section>

      {/* FEATURED TOURNAMENTS */}
      <section className="mx-auto max-w-[1400px] px-6 py-20 lg:pl-[148px]">
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
                  alt={t.name}
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
                  Prize Pool: <span className="text-gold">{t.prize}</span>
                </div>
                <div className="text-xs text-muted-foreground">Entry Fee: Free</div>
                <Link
                  to="/tournament"
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
      <section className="mx-auto max-w-[1400px] px-6 pb-24 lg:pl-[148px]">
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
