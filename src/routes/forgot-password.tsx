import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Loader2, Mail, MailCheck, ShieldQuestion } from "lucide-react";
import { GoldButton } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/forgot-password")({
  head: () =>
    noindexSeo(
      "Forgot Password — ChessOx",
      "Reset the password for your ChessOx chess account.",
      "noindex, nofollow",
    ),
  component: ForgotPasswordPage,
});

// Shown for every submitted email, existing account or not, so the form
// can never be used to probe which addresses are registered.
const GENERIC_SUCCESS =
  "If an account exists with this email address, we've sent a password reset link.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_SECS = 60;

/**
 * Forgot Password — step 1 of the email reset-link flow. Sends a Supabase
 * Auth recovery link (cryptographically random, single-use, time-limited,
 * generated and e-mailed server-side by GoTrue) that lands on
 * /reset-password. No OTPs, no phone numbers.
 */
function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError("Please enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(clean, {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (err) {
        const m = err.message.toLowerCase();
        // Unknown accounts must look identical to known ones.
        if (m.includes("not found") || m.includes("does not exist")) {
          setSent(true);
          setCooldown(RESEND_COOLDOWN_SECS);
          return;
        }
        if (m.includes("rate limit") || m.includes("too many")) {
          throw new Error(
            "Too many reset requests. Please wait a few minutes before trying again.",
          );
        }
        if (m.includes("invalid") && m.includes("email")) {
          throw new Error("Please enter a valid email address.");
        }
        // SMTP / server failure — generic, reveals nothing about the account.
        throw new Error("We couldn't send the email right now. Please try again in a moment.");
      }
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECS);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-80px)] w-full items-center justify-center bg-[#0f0505] p-6 sm:p-12">
      <div className="pointer-events-none absolute inset-0 mandala-bg opacity-[0.03]" />

      <div className="relative z-10 w-full max-w-[420px]">
        <Link
          to="/auth"
          className="mb-6 inline-flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.2em] text-gold/50 transition-colors hover:text-gold"
        >
          <ChevronLeft className="h-3 w-3" /> Back to Sign In
        </Link>

        {sent ? (
          /* ---- Success state (identical for every email address) ---- */
          <div className="rounded-2xl border border-gold/15 bg-black/40 p-8 backdrop-blur-md">
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-emerald/10">
              <MailCheck className="h-7 w-7 text-emerald" />
            </div>
            <h1 className="mb-3 font-display text-3xl text-ivory">Check Your Email</h1>
            <p className="text-sm leading-relaxed text-foreground/60">{GENERIC_SUCCESS}</p>
            <p className="mt-3 text-xs leading-relaxed text-foreground/40">
              The link expires after a short time and can only be used once. If you don&apos;t see
              the email, check your spam folder.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="mt-6 space-y-3">
              <Link to="/auth" className="block">
                <GoldButton className="h-11 w-full text-[14px]">Back to Sign In</GoldButton>
              </Link>
              <button
                onClick={() => void handleSubmit()}
                disabled={busy || cooldown > 0}
                className="w-full rounded-xl border border-gold/20 py-2.5 text-sm text-foreground/60 transition-colors hover:border-gold/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : cooldown > 0 ? (
                  `Resend link in ${cooldown}s`
                ) : (
                  "Resend link"
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ---- Request form ---- */
          <div className="rounded-2xl border border-gold/15 bg-black/40 p-8 backdrop-blur-md">
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gold/10">
              <ShieldQuestion className="h-7 w-7 text-gold" />
            </div>
            <h1 className="mb-3 font-display text-3xl text-ivory">Forgot Password?</h1>
            <p className="mb-6 text-sm leading-relaxed text-foreground/60">
              Enter your registered email address and we&apos;ll send you a secure link to reset
              your password.
            </p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <label
                  htmlFor="fp-email"
                  className="ml-1 block text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/60"
                >
                  Email Address
                </label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-foreground/40 transition-colors group-focus-within:text-gold">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="fp-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    autoComplete="email"
                    autoFocus
                    className="w-full rounded-xl border border-gold/15 bg-black/40 py-3 pl-10 pr-4 text-sm text-ivory outline-none transition-all placeholder:text-foreground/30 focus:border-gold/40 focus:bg-black/60 focus:ring-1 focus:ring-gold/40"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <div className="mt-0.5">•</div>
                  <div>{error}</div>
                </div>
              )}

              <GoldButton className="h-11 w-full text-[14px]" disabled={busy} type="submit">
                {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Send Reset Link"}
              </GoldButton>
            </form>

            <div className="mt-6 text-center text-xs text-foreground/40">
              Remembered it?{" "}
              <Link
                to="/auth"
                className="text-gold/70 underline decoration-gold/30 underline-offset-2 transition-colors hover:text-gold"
              >
                Sign in instead
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
