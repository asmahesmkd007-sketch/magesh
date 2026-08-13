import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldAlert } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordFields } from "@/components/auth/PasswordFields";
import { GoldButton } from "@/components/site/Primitives";
import { completeRegistration } from "@/lib/api/registration.functions";
import { passwordMeetsPolicy } from "@/lib/auth/password";
import { clearSetupHandoff, readSetupHandoff, type SetupHandoff } from "@/lib/auth/setupHandoff";
import { noindexSeo } from "@/lib/seo";

type CreatePasswordSearch = {
  setupToken?: string;
};

export const Route = createFileRoute("/create-password")({
  validateSearch: (search: Record<string, unknown>): CreatePasswordSearch => ({
    setupToken: typeof search.setupToken === "string" ? search.setupToken : undefined,
  }),
  head: () =>
    noindexSeo(
      "Create your password — ChessOx",
      "Set a password to finish activating your account.",
    ),
  component: CreatePasswordPage,
});

function CreatePasswordPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [handoff, setHandoff] = useState<SetupHandoff | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read setupToken from search params or sessionStorage
  useEffect(() => {
    if (search.setupToken) {
      setHandoff({
        setupToken: search.setupToken,
        email: "Your verified account",
        username: "Player",
      });
    } else {
      setHandoff(readSetupHandoff());
    }
  }, [search.setupToken]);

  async function handleSubmit() {
    if (!handoff || busy) return;
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
      const result = await completeRegistration({
        data: { setupToken: handoff.setupToken, password },
      });
      clearSetupHandoff();

      // Automatically sign in the user
      const { supabase } = await import("@/integrations/supabase/client");
      const { getDeviceId, resetSessionId } = await import("@/lib/auth/sessionLock");
      const { acquireSessionServerFn } = await import("@/lib/api/session.functions");

      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: result.email,
        password,
      });

      if (signInError || !authData.user) {
        throw new Error(
          signInError?.message ||
            "Account created, but automatic sign-in failed. Please try signing in.",
        );
      }

      const deviceId = getDeviceId();
      const sessionId = resetSessionId();
      await acquireSessionServerFn({
        data: {
          userId: authData.user.id,
          sessionId,
          deviceId,
        },
      });

      // Ensure session is set in client state
      await supabase.auth.getSession();

      navigate({ to: "/home" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your password.");
    } finally {
      setBusy(false);
    }
  }

  // ── Still reading sessionStorage ───────────────────────────────────
  if (handoff === undefined) {
    return (
      <AuthShell title="Create your password" step={[2, 3]}>
        <div className="grid place-items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      </AuthShell>
    );
  }

  // ── No valid grant in this tab ─────────────────────────────────────
  if (handoff === null) {
    return (
      <AuthShell
        title="Verification needed first"
        subtitle="We couldn't find an active setup session"
        icon={<ShieldAlert className="h-8 w-8 text-amber-400" />}
      >
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Please complete email OTP verification first to proceed with setting up your password.
        </p>
        <Link to="/auth" className="mt-6 block">
          <GoldButton className="w-full justify-center">Back to sign in</GoldButton>
        </Link>
      </AuthShell>
    );
  }

  // ── The form ───────────────────────────────────────────────────────
  const canSubmit =
    !busy && password.length > 0 && password === confirm && passwordMeetsPolicy(password);

  return (
    <AuthShell
      title="Create Your Password"
      subtitle={handoff.email}
      icon={<KeyRound className="h-7 w-7 text-gold" />}
      step={[2, 3]}
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
        {busy ? "Creating your account…" : "Create password"}
      </GoldButton>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
        This link is valid for 30 minutes. Your password is encrypted and never stored in plain
        text.
      </p>
    </AuthShell>
  );
}
