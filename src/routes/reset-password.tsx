import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  X,
} from "lucide-react";
import { GoldButton } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { releaseSessionServerFn } from "@/lib/api/session.functions";
import { PASSWORD_RULES } from "@/lib/auth/password";
import {
  clearSessionId,
  releaseSessionLockSuppression,
  suppressSessionLock,
} from "@/lib/auth/sessionLock";
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

// Captured the moment this route module loads, BEFORE supabase-js
// (detectSessionInUrl) consumes and strips the recovery hash. Everything
// below reads these frozen values, never the live location.
const landing =
  typeof window !== "undefined"
    ? { hash: window.location.hash, search: window.location.search }
    : { hash: "", search: "" };

// The one policy definition, shared with registration's create-password
// screen and the Security tab in settings.tsx (@/lib/auth/password).
const PASSWORD_REQUIREMENTS = PASSWORD_RULES;

const STRENGTH_TIERS = [
  { label: "Too weak", color: "bg-destructive", text: "text-destructive" },
  { label: "Weak", color: "bg-orange-500", text: "text-orange-400" },
  { label: "Fair", color: "bg-amber-500", text: "text-amber-400" },
  { label: "Good", color: "bg-lime-500", text: "text-lime-400" },
  { label: "Strong", color: "bg-emerald", text: "text-emerald" },
] as const;

function passwordStrength(pw: string) {
  if (!pw) return 0;
  const met = PASSWORD_REQUIREMENTS.filter((r) => r.test(pw)).length;
  let score = Math.max(0, met - 1);
  if (met === PASSWORD_REQUIREMENTS.length && pw.length >= 12) score = 4;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}

type Phase = "validating" | "invalid" | "ready" | "done";

/**
 * Reset Password — step 2 of the email reset-link flow. The link's token was
 * minted by Supabase Auth (cryptographically random, single-use, expiring);
 * GoTrue verifies it before redirecting here, so a valid landing carries a
 * recovery session while an expired/used link carries error params. The new
 * password is hashed server-side by Supabase, and every session (including
 * this recovery one) is revoked after the reset.
 */
function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("validating");
  const [invalidReason, setInvalidReason] = useState(
    "This password reset link is invalid or has expired.",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- Token / link validation --------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const hashParams = new URLSearchParams(landing.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(landing.search);
    const get = (k: string) => hashParams.get(k) ?? queryParams.get(k);

    // GoTrue rejected the token before redirecting (expired / already used /
    // tampered) — it lands here with error params instead of a session.
    if (get("error") || get("error_code")) {
      const code = get("error_code") ?? "";
      setInvalidReason(
        code === "otp_expired"
          ? "This reset link has expired or has already been used. Reset links are single-use and only valid for a limited time."
          : "This password reset link is invalid.",
      );
      setPhase("invalid");
      return;
    }

    // How the emails this app sends carry the token: a Supabase Auth
    // recovery token hash, redeemed below with verifyOtp. It needs no
    // redirect allow-list entry and no browser-local verifier, so it works
    // when a phone's mail app opens the link in its own webview.
    const tokenHash = get("token_hash");
    const hasRecoveryHash = hashParams.get("type") === "recovery" && hashParams.get("access_token");
    const code = queryParams.get("code");

    // No recovery token and no error: the URL was opened bare. Never show the
    // form on the strength of an ordinary login session alone.
    if (!tokenHash && !hasRecoveryHash && !code) {
      setPhase("invalid");
      return;
    }

    // The recovery session about to be established is not a login and holds
    // no user_sessions claim — exempt it from single-device enforcement for
    // as long as this page is open, or the heartbeat signs the user out
    // mid-reset. See sessionLock.suppressSessionLock.
    suppressSessionLock();

    // Belt and braces: GoTrue announces the consumed link as PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!cancelled && event === "PASSWORD_RECOVERY") {
        setPhase((p) => (p === "validating" ? "ready" : p));
      }
    });

    (async () => {
      if (tokenHash) {
        const { error: err } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
        });
        if (cancelled) return;
        if (err) {
          const m = err.message.toLowerCase();
          setInvalidReason(
            m.includes("expired") || m.includes("invalid") || m.includes("used")
              ? "This reset link has expired or has already been used. Reset links are single-use and only valid for a limited time."
              : "We couldn't verify this reset link. Please request a new one.",
          );
          setPhase("invalid");
          return;
        }
        // Spent now, so keep it out of this history entry (and out of the
        // Referer of anything the page links to).
        if (typeof window !== "undefined") {
          window.history.replaceState({}, "", window.location.pathname);
        }
        setPhase((p) => (p === "validating" ? "ready" : p));
        return;
      }

      if (code) {
        // PKCE-style link: exchange the one-time code ourselves.
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (err) {
          const m = err.message.toLowerCase();
          setInvalidReason(
            m.includes("expired") || m.includes("invalid") || m.includes("used")
              ? "This reset link has expired or has already been used. Reset links are single-use and only valid for a limited time."
              : "We couldn't verify this reset link. Please request a new one.",
          );
          setPhase("invalid");
        } else {
          setPhase((p) => (p === "validating" ? "ready" : p));
        }
        return;
      }

      // Implicit-flow link: supabase-js consumes the hash on init. Wait for
      // the recovery session to materialise, then unlock the form.
      for (let i = 0; i < 16; i++) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          setPhase((p) => (p === "validating" ? "ready" : p));
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!cancelled) setPhase((p) => (p === "validating" ? "invalid" : p));
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      // Normal single-device enforcement resumes as soon as this page goes.
      releaseSessionLockSuppression();
    };
  }, []);

  // ---- Submit --------------------------------------------------------------
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const failing = PASSWORD_REQUIREMENTS.filter((r) => !r.test(password));
    if (failing.length > 0) {
      setError("Your new password doesn't meet the requirements below yet.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      // The recovery session may have expired while the form sat open.
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        setInvalidReason("Your reset session expired. Please request a new link.");
        setPhase("invalid");
        return;
      }

      // Captured before the sign-out below drops the session — needed to
      // clear the single-device lock afterwards.
      const userId = s.session.user.id;

      // Supabase hashes the password server-side; it is never stored or
      // logged in plain text anywhere in this flow.
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        const m = err.message.toLowerCase();
        if (m.includes("different from the old") || m.includes("new password should be")) {
          throw new Error("Your new password must be different from your old password.");
        }
        if (m.includes("session") || m.includes("not authenticated")) {
          setInvalidReason("Your reset session expired. Please request a new link.");
          setPhase("invalid");
          return;
        }
        if (m.includes("weak") || (m.includes("password") && m.includes("characters"))) {
          throw new Error("That password is too weak. Please choose a stronger one.");
        }
        throw new Error("Could not reset your password. Please try again.");
      }

      // The global sign-out below kills the other devices' Supabase
      // sessions, but their user_sessions claim would survive it — and
      // those devices keep heartbeating it alive, so the very next login
      // with the new password would be refused as ALREADY_LOGGED_IN.
      // Release it: every session is about to be revoked, so the lock has
      // nothing left to protect. Best-effort — a failure here must not
      // fail a password change that has already succeeded.
      try {
        await releaseSessionServerFn({ data: { userId } });
      } catch {
        /* the row goes stale on its own after the session timeout */
      }
      clearSessionId();

      // Security: revoke every session everywhere — old logins, other
      // devices, and this recovery session. The used token is already dead;
      // any other outstanding recovery token dies with the sessions.
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch {
        await supabase.auth.signOut().catch(() => undefined);
      }

      setPhase("done");
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

  // ---- Screens --------------------------------------------------------------
  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-[calc(100vh-80px)] w-full items-center justify-center bg-[#0f0505] p-6 sm:p-12">
      <div className="pointer-events-none absolute inset-0 mandala-bg opacity-[0.03]" />
      <div className="relative z-10 w-full max-w-[420px]">{children}</div>
    </div>
  );

  if (phase === "validating") {
    return shell(
      <div className="rounded-2xl border border-gold/15 bg-black/40 p-8 text-center backdrop-blur-md">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" />
        <div className="mt-4 font-display text-xl text-ivory">Verifying your reset link…</div>
        <p className="mt-2 text-sm text-foreground/60">This only takes a moment.</p>
      </div>,
    );
  }

  if (phase === "invalid") {
    return shell(
      <div className="rounded-2xl border border-gold/15 bg-black/40 p-8 backdrop-blur-md">
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="mb-3 font-display text-3xl text-ivory">Link Not Valid</h1>
        <p className="text-sm leading-relaxed text-foreground/60">{invalidReason}</p>
        <div className="mt-6 space-y-3">
          <Link to="/forgot-password" className="block">
            <GoldButton className="h-11 w-full text-[14px]">Request a New Reset Link</GoldButton>
          </Link>
          <Link
            to="/auth"
            className="block w-full rounded-xl border border-gold/20 py-2.5 text-center text-sm text-foreground/60 transition-colors hover:border-gold/40 hover:text-foreground"
          >
            Back to Sign In
          </Link>
        </div>
      </div>,
    );
  }

  if (phase === "done") {
    return shell(
      <div className="rounded-2xl border border-gold/15 bg-black/40 p-8 backdrop-blur-md">
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-emerald/10">
          <CheckCircle2 className="h-7 w-7 text-emerald" />
        </div>
        <h1 className="mb-3 font-display text-3xl text-ivory">Password reset successfully.</h1>
        <p className="text-sm leading-relaxed text-foreground/60">
          Your password has been updated and all previous sessions have been signed out. Sign in
          with your new password to continue.
        </p>
        <div className="mt-6">
          <Link to="/auth" className="block">
            <GoldButton className="h-11 w-full text-[14px]">Continue to Login</GoldButton>
          </Link>
        </div>
      </div>,
    );
  }

  // phase === "ready" — the reset form
  return shell(
    <div className="rounded-2xl border border-gold/15 bg-black/40 p-8 backdrop-blur-md">
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gold/10">
        <KeyRound className="h-7 w-7 text-gold" />
      </div>
      <h1 className="mb-3 font-display text-3xl text-ivory">Set a New Password</h1>
      <p className="mb-6 text-sm leading-relaxed text-foreground/60">
        Choose a strong password you haven&apos;t used before.
      </p>

      <form className="space-y-4" onSubmit={handleReset}>
        <PasswordField
          label="New Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          autoFocus
        />
        {password.length > 0 && <StrengthMeter password={password} />}

        <ul className="space-y-1 rounded-xl border border-gold/10 bg-black/30 p-3.5">
          {PASSWORD_REQUIREMENTS.map((r) => {
            const passing = r.test(password);
            return (
              <li
                key={r.key}
                className={`flex items-center gap-2 text-xs transition-colors ${
                  passing ? "text-emerald" : "text-foreground/40"
                }`}
              >
                {passing ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <X className="h-3.5 w-3.5 shrink-0" />
                )}
                {r.label}
              </li>
            );
          })}
        </ul>

        <PasswordField
          label="Confirm Password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={confirm.length > 0 && confirm !== password ? "Passwords do not match." : undefined}
        />

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        <GoldButton className="h-11 w-full text-[14px]" disabled={busy} type="submit">
          {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Reset Password"}
        </GoldButton>
      </form>
    </div>,
  );
}

function PasswordField({
  label,
  value,
  onChange,
  error,
  autoComplete,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="ml-1 block text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/60">
        {label}
      </label>
      <div className="group relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-foreground/40 transition-colors group-focus-within:text-gold">
          <Lock className="h-4 w-4" />
        </div>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className={`w-full rounded-xl border bg-black/40 py-3 pl-10 pr-11 text-sm text-ivory outline-none transition-all placeholder:text-foreground/30 focus:bg-black/60 focus:ring-1 focus:ring-gold/40 ${
            error
              ? "border-destructive/50 focus:border-destructive/60"
              : "border-gold/15 focus:border-gold/40"
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-foreground/40 transition-colors hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

function StrengthMeter({ password }: { password: string }) {
  const score = passwordStrength(password);
  const tier = STRENGTH_TIERS[score];
  return (
    <div>
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < score ? tier.color : "bg-white/10"
            }`}
          />
        ))}
      </div>
      <div className={`mt-1.5 text-xs font-medium ${tier.text}`} role="status" aria-live="polite">
        Password strength: {tier.label}
      </div>
    </div>
  );
}
