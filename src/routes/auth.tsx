import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — ChessOx" }] }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { session } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();

  // Already authenticated — go straight to home.
  useEffect(() => {
    if (session) navigate({ to: "/home" });
  }, [session, navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/home",
            data: { username, display_name: username },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.invalidate();
      navigate({ to: "/home" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    setBusy(true);
    try {
      // Use Supabase OAuth directly — the callback goes through Supabase's
      // registered redirect URI and the session is restored by onAuthStateChange.
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin + "/home",
        },
      });
      if (error) throw error;
      // Browser navigates away for the OAuth flow — no further action here.
    } catch (e) {
      setError(e instanceof Error ? e.message : "OAuth failed");
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-[80vh] place-items-center px-4">
      <div className="pointer-events-none absolute inset-0 gradient-royal opacity-80" />
      <div className="pointer-events-none absolute inset-0 mandala-bg opacity-40" />
      <Card className="relative w-full max-w-md p-8">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl gradient-gold text-background">
            <Crown className="h-5 w-5" />
          </span>
          <div>
            <div className="font-display text-xs uppercase tracking-[0.3em] text-gold">
              {mode === "signin" ? "Welcome back" : "Begin your reign"}
            </div>
            <h1 className="font-display text-2xl">{mode === "signin" ? "Enter the Palace" : "Join the Court"}</h1>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-lg border border-white/10 p-1 text-sm">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-2 transition-colors ${
                mode === m ? "gradient-gold text-background font-medium" : "text-muted-foreground"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form className="space-y-4" onSubmit={handleEmail}>
          {mode === "signup" && (
            <Input label="Username" value={username} onChange={setUsername} placeholder="grandroyal" required />
          )}
          <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@chessox.com" required />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
            minLength={8}
          />
          {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          <GoldButton className="w-full" disabled={busy} type="submit">
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign In" : "Create Account"}
          </GoldButton>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-white/10" />or<div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="space-y-2">
          <GhostButton className="w-full" disabled={busy} onClick={() => handleOAuth("google")}>
            Continue with Google
          </GhostButton>
          <GhostButton className="w-full" disabled={busy} onClick={() => handleOAuth("apple")}>
            Continue with Apple
          </GhostButton>
        </div>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to ChessOx's Terms. <Link to="/" className="text-gold">Back home</Link>
        </div>
      </Card>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs text-muted-foreground">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm outline-none focus:border-gold/40"
      />
    </label>
  );
}
