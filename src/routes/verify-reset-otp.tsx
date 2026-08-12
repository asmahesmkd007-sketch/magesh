import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, MailCheck, ShieldAlert } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { OtpInput } from "@/components/auth/OtpInput";
import { GoldButton } from "@/components/site/Primitives";
import { requestPasswordResetOtp, verifyPasswordResetOtp } from "@/lib/api/passwordReset.functions";
import {
  OTP_LENGTH,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  sentAtFromCooldown,
} from "@/lib/auth/otpPolicy";
import { readResetRequest, writeResetGrant, writeResetRequest } from "@/lib/auth/resetHandoff";
import { suppressSessionLock, releaseSessionLockSuppression } from "@/lib/auth/sessionLock";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/verify-reset-otp")({
  head: () =>
    noindexSeo(
      "Verify Reset Code — ChessOx",
      "Enter the verification code we emailed you.",
      "noindex, nofollow",
    ),
  component: VerifyResetOtpPage,
});

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Verify Reset Code — step 2 of 3. The code is verified server-side; this
 * page only collects it. It is never written to storage, never put in the
 * URL and never logged.
 */
function VerifyResetOtpPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [dead, setDead] = useState(false);

  // Deadlines, not tick-counters: browsers throttle background timers to
  // roughly once a minute, which stalls a decrementing counter but leaves
  // a deadline exactly as accurate. Both are derived from when the code
  // was actually sent (carried in the handoff), so a refresh — or arriving
  // here on a cooldown reply — shows the real time left, not a fresh one.
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const verifying = useRef(false);
  const requesting = useRef(false);

  useEffect(() => {
    const req = readResetRequest();
    setEmail(req?.email ?? null);
    if (req) {
      setExpiresAt(req.sentAt + OTP_TTL_MS);
      setResendAt(req.sentAt + RESEND_COOLDOWN_MS);
    }
    // A recovery flow is not a login. Nothing here creates a Supabase
    // session, but the suppression is explicit so the single-device
    // heartbeat can never decide this tab is a second device and sign the
    // user out midway through entering their code.
    suppressSessionLock();
    return () => releaseSessionLockSuppression();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const expiresIn = Math.max(0, expiresAt - now);
  const resendIn = Math.max(0, resendAt - now);
  const expired = expiresIn === 0;

  const handleVerify = useCallback(async () => {
    if (verifying.current || otp.length !== OTP_LENGTH || !email) return;
    verifying.current = true;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await verifyPasswordResetOtp({ data: { email, otp } });

      if (res.ok) {
        // The grant goes to the next step in sessionStorage — not the URL,
        // and not localStorage. It is single-use and server-validated.
        writeResetGrant({ resetAuth: res.resetAuth, email: res.email });
        navigate({ to: "/reset-password" });
        return;
      }

      setOtp("");
      if (res.reason === "otp_expired") {
        setError("That code has expired. Request a new one to continue.");
        setExpiresAt(Date.now());
      } else if (res.reason === "too_many_attempts") {
        setError("Too many incorrect attempts. This code is no longer valid — request a new one.");
        setDead(true);
        setExpiresAt(Date.now());
      } else {
        setError(
          res.attemptsLeft > 0
            ? `That code isn't right. ${res.attemptsLeft} attempt${res.attemptsLeft === 1 ? "" : "s"} remaining.`
            : "That code isn't right.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code. Please try again.");
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }, [otp, email, navigate]);

  async function handleResend() {
    if (requesting.current || !email || resendIn > 0) return;
    requesting.current = true;
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      const res = await requestPasswordResetOtp({ data: { email } });

      if (!res.ok && res.reason === "delivery_failed") {
        // No cooldown was started server-side, so the button stays live.
        setError("We couldn't send the verification code right now. Please try again later.");
        return;
      }

      if (!res.ok && res.reason === "cooldown") {
        // The server is the authority on the wait; re-derive the send time
        // from it so the expiry countdown stays truthful too.
        const sentAt = sentAtFromCooldown(res.resendInSeconds);
        writeResetRequest({ email, sentAt });
        setExpiresAt(sentAt + OTP_TTL_MS);
        setResendAt(sentAt + RESEND_COOLDOWN_MS);
        setNotice(`A code was already sent. You can request another in ${res.resendInSeconds}s.`);
        return;
      }

      const sentAt = Date.now();
      writeResetRequest({ email, sentAt });
      setOtp("");
      setDead(false);
      setExpiresAt(sentAt + OTP_TTL_MS);
      setResendAt(sentAt + res.resendInSeconds * 1000);
      setNotice("A new code is on its way. The previous code no longer works.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code.");
    } finally {
      requesting.current = false;
      setResending(false);
    }
  }

  // ── No address in this tab ─────────────────────────────────────────
  if (email === undefined) {
    return (
      <AuthShell title="Verify your code" step={[2, 3]}>
        <div className="grid place-items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      </AuthShell>
    );
  }

  if (email === null) {
    return (
      <AuthShell
        title="Start again"
        subtitle="We couldn't find an active reset in this tab"
        icon={<ShieldAlert className="h-8 w-8 text-amber-400" />}
      >
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Enter your email address again and we&rsquo;ll send a fresh verification code.
        </p>
        <Link to="/forgot-password" className="mt-6 block">
          <GoldButton className="w-full justify-center">Back to Forgot Password</GoldButton>
        </Link>
      </AuthShell>
    );
  }

  const canVerify = !busy && !expired && !dead && otp.length === OTP_LENGTH;

  return (
    <AuthShell
      title="Enter your code"
      subtitle={email}
      icon={<MailCheck className="h-7 w-7 text-gold" />}
      step={[2, 3]}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleVerify();
        }}
      >
        <div>
          <label className="mb-2 block text-xs text-muted-foreground">Verification code</label>
          <OtpInput
            value={otp}
            onChange={(v) => {
              setOtp(v);
              setError(null);
            }}
            onComplete={() => void handleVerify()}
            disabled={busy || expired || dead}
            invalid={!!error}
            autoFocus
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {expired || dead ? (
              <span className="text-red-400">Code expired</span>
            ) : (
              <>Code expires in {mmss(expiresIn)}</>
            )}
          </span>
          <span>
            {resendIn > 0 ? `Resend in ${Math.ceil(resendIn / 1000)}s` : "Ready to resend"}
          </span>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-400"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-gold/90"
          >
            {notice}
          </p>
        )}

        <GoldButton className="w-full justify-center" type="submit" disabled={!canVerify}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {busy ? "Verifying…" : "Verify Code"}
        </GoldButton>
      </form>

      <button
        type="button"
        onClick={() => void handleResend()}
        disabled={resending || resendIn > 0}
        className="mt-3 w-full rounded-lg border border-gold/20 py-2.5 text-xs text-muted-foreground transition-colors hover:border-gold/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {resending ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        ) : resendIn > 0 ? (
          `Resend code in ${Math.ceil(resendIn / 1000)}s`
        ) : (
          "Resend Code"
        )}
      </button>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
        Never share this code with anyone. ChessOx staff will never ask you for it.
      </p>

      <div className="mt-3 text-center text-xs text-muted-foreground">
        Wrong address?{" "}
        <Link to="/forgot-password" className="text-gold/80 underline-offset-2 hover:underline">
          Start again
        </Link>
      </div>
    </AuthShell>
  );
}
