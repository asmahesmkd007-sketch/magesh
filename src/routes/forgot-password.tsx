import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Mail, ShieldQuestion } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { GoldButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { requestPasswordResetOtp } from "@/lib/api/passwordReset.functions";
import { sentAtFromCooldown } from "@/lib/auth/otpPolicy";
import { writeResetRequest } from "@/lib/auth/resetHandoff";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Forgot Password — step 1 of 3. Asks the server to email a 6-digit code
 * and moves on to /verify-reset-otp. Deliberately no link is sent: the
 * code is typed back into the site, so nothing secret travels in a URL.
 *
 * The response is identical for registered, unregistered and Google
 * addresses (and padded to the same duration server-side), so this form
 * cannot be used to discover which addresses have accounts.
 */
function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-fill logged-in user's email address
  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user]);

  // Catches a double submit inside a single tick, which `busy` cannot:
  // both clicks would read the pre-update state.
  const inFlight = useRef(false);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (inFlight.current) return;
    setError(null);

    if (!user) {
      setError("Please sign in first to reset your password.");
      return;
    }

    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError("Please enter a valid email address.");
      return;
    }

    inFlight.current = true;
    setBusy(true);
    try {
      const res = await requestPasswordResetOtp({
        data: { email: clean },
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`,
        },
      });

      if (!res.ok && res.reason === "delivery_failed") {
        // Never claim a code was sent when the provider refused it.
        setError("We couldn't send the verification code right now. Please try again later.");
        return;
      }

      // A cooldown still means a live code is sitting in that inbox, so the
      // right move is to go and enter it. Reconstruct when it was sent from
      // the remaining cooldown the server reported — both countdowns on the
      // next page hang off that, so neither starts out wrong.
      const sentAt =
        !res.ok && res.reason === "cooldown" ? sentAtFromCooldown(res.resendInSeconds) : Date.now();

      writeResetRequest({ email: clean, sentAt });
      navigate({ to: "/verify-reset-otp" });
    } catch (err) {
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
    <AuthShell
      title="Forgot Password?"
      subtitle="We'll email you a 6-digit verification code"
      icon={<ShieldQuestion className="h-7 w-7 text-gold" />}
      step={[1, 3]}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="fp-email" className="mb-1 block text-xs text-muted-foreground">
            Email address
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="fp-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="your@email.com"
              required
              autoComplete="email"
              autoFocus
              disabled={busy}
              className="w-full rounded-lg border border-gold/20 bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-gold/60 disabled:opacity-50"
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-400"
          >
            {error}
          </p>
        )}

        <GoldButton className="w-full justify-center" type="submit" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? "Sending code…" : "Send Verification Code"}
        </GoldButton>
      </form>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
        If an account exists, we&rsquo;ll send a verification code to your email. The code expires
        in 5 minutes.
      </p>

      <div className="mt-4 text-center text-xs text-muted-foreground">
        Remembered it?{" "}
        <Link to="/auth" className="text-gold/80 underline-offset-2 hover:underline">
          Sign in instead
        </Link>
      </div>
    </AuthShell>
  );
}
