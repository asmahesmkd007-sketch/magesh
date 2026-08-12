import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldAlert } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordFields } from "@/components/auth/PasswordFields";
import { GoldButton } from "@/components/site/Primitives";
import { resetPasswordWithAuth } from "@/lib/api/passwordReset.functions";
import { passwordMeetsPolicy } from "@/lib/auth/password";
import { clearResetHandoff, readResetGrant, type ResetGrant } from "@/lib/auth/resetHandoff";
import { releaseSessionLockSuppression, suppressSessionLock } from "@/lib/auth/sessionLock";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/reset-password")({
  head: () =>
    noindexSeo(
      "Reset Password — ChessOx",
      "Set a new password for your ChessOx chess account.",
      "noindex, nofollow",
    ),
  component: ResetPasswordPage,
});

/** How long the success card sits before it sends the user to sign in. */
const REDIRECT_DELAY_MS = 3000;

/**
 * Reset Password — step 3 of 3. Reached only by verifying an emailed
 * 6-digit code, which yields the single-use grant this page spends.
 *
 * There is no recovery session and no token in the URL: the grant is
 * validated server-side, the password is written through the Auth admin
 * API, and every existing session is revoked as part of the same call.
 */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [grant, setGrant] = useState<ResetGrant | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);

  // sessionStorage is client-only — read after mount.
  useEffect(() => {
    setGrant(readResetGrant());
    // Recovery is not a login. Nothing here holds a user_sessions claim,
    // and this keeps the single-device heartbeat from ever mistaking the
    // page for a second device and interrupting the reset.
    suppressSessionLock();
    return () => releaseSessionLockSuppression();
  }, []);

  // Redirect to sign-in once the password is changed.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => navigate({ to: "/auth" }), REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [done, navigate]);

  async function handleSubmit() {
    if (!grant || busy) return;
    setError(null);

    if (!password || !confirm) {
      setError("Please fill in both password fields.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!passwordMeetsPolicy(password)) {
      setError("Please choose a password that meets all the requirements below.");
      return;
    }

    setBusy(true);
    try {
      const res = await resetPasswordWithAuth({
        data: { resetAuth: grant.resetAuth, password },
      });

      if (!res.ok) {
        if (res.reason === "weak_password") {
          setError(res.message);
          return;
        }
        // The grant is gone or stale — a fresh code is the only way on.
        clearResetHandoff();
        setExpired(true);
        return;
      }

      // Nothing left to replay; wipe the tab's copy immediately.
      clearResetHandoff();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password.");
    } finally {
      setBusy(false);
    }
  }

  // ── Reading the grant ──────────────────────────────────────────────
  if (grant === undefined) {
    return (
      <AuthShell title="Set a new password" step={[3, 3]}>
        <div className="grid place-items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      </AuthShell>
    );
  }

  // ── Done ───────────────────────────────────────────────────────────
  if (done) {
    return (
      <AuthShell
        title="Password reset successfully"
        icon={<CheckCircle2 className="h-8 w-8 text-emerald-400" />}
        step={[3, 3]}
      >
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Password reset successfully. Please sign in with your new password.
        </p>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          All previous sessions have been signed out. Taking you to sign in…
        </p>
        <GoldButton
          className="mt-6 w-full justify-center"
          onClick={() => navigate({ to: "/auth" })}
        >
          SIGN IN NOW
        </GoldButton>
      </AuthShell>
    );
  }

  // ── No usable grant in this tab ────────────────────────────────────
  if (grant === null || expired) {
    return (
      <AuthShell
        title="Verification needed first"
        subtitle="This reset session is no longer valid"
        icon={<ShieldAlert className="h-8 w-8 text-amber-400" />}
      >
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Reset codes are single-use and expire quickly. Request a new code to set your password.
        </p>
        <Link to="/forgot-password" className="mt-6 block">
          <GoldButton className="w-full justify-center">Request a New Code</GoldButton>
        </Link>
        <Link
          to="/auth"
          className="mt-3 block text-center text-xs text-muted-foreground underline-offset-2 hover:text-gold hover:underline"
        >
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  // ── The form ───────────────────────────────────────────────────────
  const canSubmit =
    !busy && password.length > 0 && password === confirm && passwordMeetsPolicy(password);

  return (
    <AuthShell
      title="Set a New Password"
      subtitle={grant.email}
      icon={<KeyRound className="h-7 w-7 text-gold" />}
      step={[3, 3]}
    >
      <PasswordFields
        password={password}
        onPasswordChange={setPassword}
        confirm={confirm}
        onConfirmChange={setConfirm}
        disabled={busy}
        onSubmit={() => void handleSubmit()}
        autoFocus
      />

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-400"
        >
          {error}
        </p>
      )}

      <GoldButton
        className="mt-5 w-full justify-center"
        onClick={() => void handleSubmit()}
        disabled={!canSubmit}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? "Updating your password…" : "Reset Password"}
      </GoldButton>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
        Your password is encrypted and never stored in plain text. Changing it signs out every other
        device.
      </p>
    </AuthShell>
  );
}
