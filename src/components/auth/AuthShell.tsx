// =====================================================================
// AuthShell — the frame every standalone auth screen sits in
// ---------------------------------------------------------------------
// Verification, password setup and their success/failure states all
// share one centred card over the regal hero backdrop, so the onboarding
// journey looks like a single continuous flow rather than a series of
// unrelated pages.
// =====================================================================
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Crown } from "lucide-react";

import heroRegal from "@/assets/hero-regal.jpg";

type Props = {
  title: string;
  subtitle?: string;
  /** Replaces the default crown mark — e.g. a success tick. */
  icon?: ReactNode;
  children: ReactNode;
  /** Optional progress indicator: [currentStep, totalSteps]. */
  step?: [number, number];
};

export function AuthShell({ title, subtitle, icon, children, step }: Props) {
  return (
    // Height matches the other auth pages: the root layout already
    // supplies the navbar (~80px), so min-h-screen here would push the
    // footer off-screen and force a scroll on every step.
    <div className="relative grid min-h-[calc(100vh-80px)] place-items-center overflow-hidden px-4 py-10">
      {/* Backdrop */}
      <img
        src={heroRegal}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(212,175,55,0.14),transparent_60%)]"
      />

      <main className="relative w-full max-w-md">
        <Link
          to="/"
          className="mb-6 flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-gold"
        >
          <Crown className="h-4 w-4 text-gold" aria-hidden="true" />
          <span className="font-display tracking-wide">ChessOx</span>
        </Link>

        <div className="rounded-2xl border border-gold/25 bg-background/80 p-6 shadow-luxe backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            {icon ? (
              <div className="mb-3 grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/[0.04]">
                {icon}
              </div>
            ) : null}
            <h1 className="font-display text-2xl leading-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}

            {step && (
              <div
                className="mt-4 flex items-center gap-1.5"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={step[1]}
                aria-valuenow={step[0]}
                aria-label={`Step ${step[0]} of ${step[1]}`}
              >
                {Array.from({ length: step[1] }, (_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i < step[0] ? "w-8 bg-gold" : "w-4 bg-white/15"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
