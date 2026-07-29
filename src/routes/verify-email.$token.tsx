import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MailWarning, RefreshCw } from "lucide-react";

import { GoldButton } from "@/components/site/Primitives";
import { AuthShell } from "@/components/auth/AuthShell";
import { SETUP_TOKEN_KEY, readSetupHandoff, type SetupHandoff } from "@/lib/auth/setupHandoff";
import { resendVerification, verifyEmailToken } from "@/lib/api/registration.functions";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/verify-email/$token")({
  head: () =>
    noindexSeo(
      "Verify your email — ChessOx",
      "Confirm your email address to activate your account.",
    ),
  component: VerifyEmailPage,
});

type State =
  | { kind: "checking" }
  | { kind: "verified"; email: string; username: string }
  | { kind: "failed"; reason: "invalid" | "expired" | "already_verified" }
  | { kind: "error"; message: string };

function VerifyEmailPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "checking" });
  const [resendEmail, setResendEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  // React 18 StrictMode double-mounts in dev; the token is single-use so
  // the second call would report "invalid". Guard the effect.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    verifyEmailToken({ data: { token } })
      .then((result) => {
        if (!result.ok) {
          // A refresh of this page re-sends the (now consumed) token.
          // If this tab still holds the grant the user is mid-setup, so
          // resume instead of sending them to a sign-in they can't use —
          // they haven't chosen a password yet.
          if (result.reason === "already_verified") {
            const existing = readSetupHandoff();
            if (existing) {
              setState({ kind: "verified", email: existing.email, username: existing.username });
              return;
            }
          }
          setState({ kind: "failed", reason: result.reason });
          return;
        }
        // Hand the setup grant to the password page through session
        // storage rather than the URL, so it never lands in browser
        // history, server logs or a Referer header.
        const handoff: SetupHandoff = {
          setupToken: result.setupToken,
          email: result.email,
          username: result.username,
        };
        try {
          sessionStorage.setItem(SETUP_TOKEN_KEY, JSON.stringify(handoff));
        } catch {
          /* private mode — the Continue button explains what to do */
        }
        setState({ kind: "verified", email: result.email, username: result.username });
      })
      .catch((err: unknown) => {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Verification failed. Please try again.",
        });
      });
  }, [token]);

  async function handleResend() {
    setResendNote(null);
    const email = resendEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setResendNote("Enter the email address you signed up with.");
      return;
    }
    setResendBusy(true);
    try {
      await resendVerification({ data: { email } });
      setResendNote("If that address is awaiting verification, a new link is on its way.");
    } catch (err) {
      setResendNote(err instanceof Error ? err.message : "Could not send the email.");
    } finally {
      setResendBusy(false);
    }
  }

  if (state.kind === "checking") {
    return (
      <AuthShell title="Verifying your email" subtitle="One moment…">
        <div className="grid place-items-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-gold" />
        </div>
      </AuthShell>
    );
  }

  if (state.kind === "verified") {
    return (
      <AuthShell
        title="Email Verified Successfully"
        subtitle={state.email}
        icon={<CheckCircle2 className="h-8 w-8 text-emerald-400" />}
      >
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Your email has been verified successfully. Please create your password to complete your
          ChessOx account setup.
        </p>
        <GoldButton
          className="mt-6 w-full justify-center"
          onClick={() => navigate({ to: "/create-password" })}
        >
          Continue
        </GoldButton>
      </AuthShell>
    );
  }

  if (state.kind === "failed" && state.reason === "already_verified") {
    return (
      <AuthShell
        title="Already verified"
        subtitle="This link has been used"
        icon={<CheckCircle2 className="h-8 w-8 text-emerald-400" />}
      >
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          This email address has already been verified. If you finished setting your password you
          can sign in now — otherwise request a fresh link to pick up where you left off.
        </p>
        <Link to="/auth" className="mt-6 block">
          <GoldButton className="w-full justify-center">Go to sign in</GoldButton>
        </Link>

        <div className="mt-5 border-t border-white/10 pt-5">
          <p className="mb-2 text-center text-xs text-muted-foreground">
            Never set a password? Send yourself a new link.
          </p>
          <input
            type="email"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleResend()}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-lg border border-gold/20 bg-white/[0.03] px-3 py-2.5 text-sm outline-none transition-colors focus:border-gold/60"
          />
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={resendBusy}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-gold/25 px-3 py-2 text-xs text-gold transition-colors hover:bg-gold/10 disabled:opacity-50"
          >
            {resendBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Resend verification email
          </button>
          {resendNote && (
            <p role="status" className="mt-2 text-center text-xs text-muted-foreground">
              {resendNote}
            </p>
          )}
        </div>
      </AuthShell>
    );
  }

  const heading =
    state.kind === "error"
      ? "Something went wrong"
      : state.reason === "expired"
        ? "This link has expired"
        : "This link isn't valid";

  const explanation =
    state.kind === "error"
      ? state.message
      : state.reason === "expired"
        ? "Verification links are valid for 24 hours. Request a new one below and we'll send a fresh link."
        : "This link may already have been used, or a newer one was sent. Request a new link below.";

  return (
    <AuthShell
      title={heading}
      subtitle="Let's get you a new link"
      icon={<MailWarning className="h-8 w-8 text-amber-400" />}
    >
      <p className="text-center text-sm text-muted-foreground">{explanation}</p>

      <div className="mt-6 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Your email address</span>
          <input
            type="email"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleResend()}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-lg border border-gold/20 bg-white/[0.03] px-3 py-2.5 text-sm outline-none transition-colors focus:border-gold/60"
          />
        </label>

        <GoldButton
          className="w-full justify-center"
          onClick={() => void handleResend()}
          disabled={resendBusy}
        >
          {resendBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Resend verification email
        </GoldButton>

        {resendNote && (
          <p role="status" className="text-center text-xs text-muted-foreground">
            {resendNote}
          </p>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link to="/auth" className="text-gold hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
