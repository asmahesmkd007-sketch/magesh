import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Mail, MailCheck, ShieldQuestion } from "lucide-react";
import { GoldButton } from "@/components/site/Primitives";
import { requestPasswordReset } from "@/lib/api/passwordReset.functions";
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
 * Forgot Password — step 1 of the email reset-link flow. `requestPasswordReset`
 * has Supabase Auth mint the recovery token (cryptographically random,
 * single-use, time-limited) and emails it through the same provider chain as
 * every other ChessOx email, landing on /reset-password. No OTPs, no phone
 * numbers. See src/lib/api/passwordReset.functions.ts for why delivery does
 * not go through Supabase's built-in mailer.
 */
/** The address a cooldown belongs to, normalised the same way the server does. */
const normalise = (raw: string) => raw.trim().toLowerCase();

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // The cooldown is held as a DEADLINE, not a ticking count, and lives only
  // in component state — nothing is written to localStorage or
  // sessionStorage, so a refresh or a new tab starts clean and no cooldown
  // can outlive the page. A deadline also stays accurate when the tab is
  // backgrounded, where browsers throttle timers to about once a minute and
  // a decrement-per-tick counter would simply stop counting down.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  // Which address the deadline belongs to, so editing the field to a
  // different address does not inherit this one's wait.
  const [cooldownFor, setCooldownFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Guards a double submit within a single tick, which `busy` cannot: two
  // clicks in the same tick both read the pre-update state.
  const inFlight = useRef(false);

  const cooldownOwned = cooldownFor !== null && cooldownFor === normalise(email);
  const cooldown = cooldownOwned ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setInterval(() => {
      setNow(Date.now());
      // Re-enables the button on its own the moment the window elapses.
      if (Date.now() >= cooldownUntil) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  function startCooldown(forEmail: string, seconds: number) {
    setCooldownFor(forEmail);
    setCooldownUntil(Date.now() + seconds * 1000);
    setNow(Date.now());
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (inFlight.current) return;
    setError(null);

    const clean = normalise(email);
    if (!EMAIL_RE.test(clean)) {
      setError("Please enter a valid email address.");
      return;
    }

    inFlight.current = true;
    setBusy(true);
    try {
      // Registered, unregistered and Google addresses all resolve
      // identically, so nothing here can be used to probe which addresses
      // have accounts. Three distinct answers, and only one of them is
      // "sent": a delivery failure rejects, and an active cooldown resolves
      // with ok:false — neither may show the success screen.
      const res = await requestPasswordReset({ data: { email: clean } });

      if (!res.ok) {
        // The server is the authority on the remaining time; the client
        // just renders the number it is given.
        startCooldown(clean, res.resendInSeconds);
        setError(
          `A reset link was already sent to this address. You can request another in ${res.resendInSeconds}s.`,
        );
        return;
      }

      setSent(true);
      startCooldown(clean, res.resendInSeconds ?? RESEND_COOLDOWN_SECS);
    } catch (err) {
      // A failed request starts no cooldown — the server did not record one
      // either, so the retry is answered honestly rather than with a wait.
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please check your connection and try again.",
      );
    } finally {
      inFlight.current = false;
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
                    onChange={(e) => {
                      setEmail(e.target.value);
                      // Typing a different address clears the previous
                      // address's error; its cooldown stops applying on its
                      // own, because `cooldownOwned` keys off this field.
                      setError(null);
                    }}
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

              <GoldButton
                className="h-11 w-full text-[14px]"
                disabled={busy || cooldown > 0}
                type="submit"
              >
                {busy ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : cooldown > 0 ? (
                  `Try again in ${cooldown}s`
                ) : (
                  "Send Reset Link"
                )}
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
