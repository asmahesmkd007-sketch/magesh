import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Crown,
  Loader2,
  ChevronLeft,
  Mail,
  Lock,
  User,
  MailCheck,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";
import { GoldButton } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { requestEmailVerificationOtp, resendVerification } from "@/lib/api/registration.functions";
import { writeSignupState } from "@/routes/verify-email-otp";
import { acquireSessionServerFn } from "@/lib/api/session.functions";
import { getDeviceId, getSessionId, resetSessionId } from "@/lib/auth/sessionLock";
import { USERNAME_REGEX } from "@/lib/auth/password";
import heroRegal from "@/assets/hero-regal.jpg";
import { noindexSeo } from "@/lib/seo";

type AuthSearch = {
  redirect?: string;
  mode?: "signin" | "signup";
};

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    mode: search.mode === "signup" ? "signup" : search.mode === "signin" ? "signin" : undefined,
  }),
  head: () =>
    noindexSeo(
      "Sign In or Create a Free Account — ChessOx",
      "Sign in to ChessOx or create a free account to play chess online, solve chess puzzles and join online chess tournaments.",
    ),
  component: AuthPage,
});

/**
 * Turns raw Supabase Auth errors into clear, action-oriented messages. Supabase
 * returns terse server strings (e.g. "email rate limit exceeded") that mean
 * nothing to a player — map the common ones to guidance they can act on.
 */
function friendlyAuthError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Authentication failed";
  const m = msg.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Too many attempts right now. Please wait a few minutes and try again — or use Continue with Google below.";
  }
  if (m.includes("invalid login credentials")) {
    return "Incorrect email or password. Please check and try again.";
  }
  if (m.includes("email not confirmed") || m.includes("email not verified")) {
    return "Please verify your email before signing in. Check your inbox for the verification link.";
  }
  return msg;
}

function getSafeTarget(target?: string): string {
  if (target && target.startsWith("/") && !target.startsWith("//")) {
    return target;
  }
  return "/home";
}

function AuthPage() {
  const search = Route.useSearch();
  const targetPath = getSafeTarget(search.redirect);

  const mode = search.mode ?? "signin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { session } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();

  // ---- Registration: email verification link (signup only) -----------------
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);

  // Already authenticated — verify session lock before redirecting
  useEffect(() => {
    if (!session?.user) return;
    let alive = true;
    const deviceId = getDeviceId();
    const sessionId = getSessionId();

    acquireSessionServerFn({
      data: { userId: session.user.id, sessionId, deviceId },
    })
      .then((res) => {
        if (!alive) return;
        if (!res.ok) {
          void supabase.auth.signOut();
          setError(
            res.message ||
              "This user is already logged in on another device. Please log out from the other device or wait until that session expires.",
          );
        } else {
          navigate({ to: targetPath });
        }
      })
      .catch(() => {
        if (alive) navigate({ to: targetPath });
      });

    return () => {
      alive = false;
    };
  }, [session, navigate, targetPath]);

  // Countdown ticker for the resend cooldown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  function switchMode(m: "signin" | "signup") {
    setError(null);
    setSentTo(null);
    setResendNote(null);
    setResendIn(0);
    navigate({
      to: "/auth",
      search: {
        redirect: search.redirect,
        mode: m,
      },
      replace: true,
    });
  }

  async function handleResend() {
    if (!sentTo || resendIn > 0) return;
    setResendBusy(true);
    setResendNote(null);
    try {
      const result = await resendVerification({ data: { email: sentTo } });
      setResendIn(result.resendInSeconds);
      setResendNote("A new verification link is on its way.");
    } catch (e) {
      setResendNote(e instanceof Error ? e.message : "Could not resend the email.");
    } finally {
      setResendBusy(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    const cleanUsername = username.trim();
    try {
      if (mode === "signup") {
        if (!cleanUsername || cleanUsername.length !== 11) {
          throw new Error("Username must be exactly 11 characters (e.g. chessfox_42).");
        }
        const result = await requestEmailVerificationOtp({
          data: { email: cleanEmail, username: cleanUsername },
        });

        if (!result.ok) {
          if (result.reason === "cooldown") {
            throw new Error(`Please wait ${result.resendInSeconds} seconds before requesting another code.`);
          }
          throw new Error("We couldn't send the verification code right now. Please try again later.");
        }

        writeSignupState({
          email: result.email,
          username: cleanUsername,
          sentAt: Date.now(),
        });
        navigate({ to: "/verify-email-otp" });
        return;
      }

      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (error) throw error;
      if (!authData.user) throw new Error("Authentication failed");

      const deviceId = getDeviceId();
      const sessionId = resetSessionId();
      const lockRes = await acquireSessionServerFn({
        data: {
          userId: authData.user.id,
          sessionId,
          deviceId,
        },
      });

      if (!lockRes.ok) {
        await supabase.auth.signOut();
        setError(
          lockRes.message ||
            "This user is already logged in on another device. Please log out from the other device or wait until that session expires.",
        );
        return;
      }

      router.invalidate();
      navigate({ to: targetPath });
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth(provider: "google") {
    setError(null);
    setBusy(true);
    try {
      const redirectUrl =
        window.location.origin +
        "/auth" +
        (search.redirect ? `?redirect=${encodeURIComponent(search.redirect)}` : "");
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (error) throw error;
    } catch (e) {
      setError(friendlyAuthError(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-80px)] w-full bg-[#0f0505]">
      {/* Left Side - Visual Hero (Hidden on small screens) */}
      <div className="relative hidden w-1/2 overflow-hidden lg:block border-r border-gold/15">
        {/* Decorative panel, and its container is `hidden lg:block` — but an
            <img> in the DOM is still fetched when an ancestor is display:none,
            so every mobile sign-in was paying 188 KB for artwork it never
            shows. `lazy` skips it while off-screen and still loads it
            immediately on desktop, where it is in the initial viewport. The
            sign-in form is the LCP here, not this image. */}
        <img
          src={heroRegal}
          alt="Premium chess set on the ChessOx sign-in page"
          width={1920}
          height={1080}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-right"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,5,5,0.1)_0%,rgba(15,5,5,0.95)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,5,5,0.2)_0%,rgba(15,5,5,0.8)_100%)]" />

        <div className="absolute bottom-20 left-16 max-w-lg">
          <div className="flex items-center gap-4 mb-8">
            <span className="grid h-14 w-14 place-items-center rounded-2xl gradient-gold text-background shadow-[0_0_30px_rgba(212,175,55,0.3)]">
              <Crown className="h-7 w-7" />
            </span>
            <div className="font-display text-5xl tracking-widest text-gradient-gold">CHESS OX</div>
          </div>
          <h2 className="font-display text-[3.5rem] uppercase leading-[1.1] text-ivory mb-6 tracking-wide">
            The Regal Game: <br />
            <span className="text-gold/80">Chess of India</span>
          </h2>
          <p className="text-lg text-ivory/60 max-w-md font-light leading-relaxed">
            Experience the ultimate premium chess journey. Master your strategies in an environment
            inspired by the birthplace of the game.
          </p>
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="flex w-full flex-col items-center justify-center lg:w-1/2 p-6 sm:p-12 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 mandala-bg opacity-[0.03]" />

        <div className="w-full max-w-[420px] relative z-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[10px] text-gold/50 hover:text-gold mb-6 transition-colors uppercase tracking-[0.2em] font-display"
          >
            <ChevronLeft className="h-3 w-3" /> Back to Palace
          </Link>

          <div className="mb-6">
            <h1 className="font-display text-4xl text-ivory mb-3">
              {mode === "signin" ? "Welcome Back" : "Join the Court"}
            </h1>
            <p className="text-sm text-foreground/60">
              {mode === "signin"
                ? "Enter your credentials to access your premium account."
                : "Create an account to begin your regal chess journey."}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl border border-gold/20 bg-black/40 p-1.5 text-sm backdrop-blur-md">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`rounded-lg px-3 py-2.5 transition-all duration-300 font-medium ${
                  mode === m
                    ? "bg-gold/15 text-gold shadow-sm"
                    : "text-foreground/50 hover:text-foreground/80 hover:bg-white/5"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {mode === "signup" && sentTo ? (
            <div className="rounded-xl border border-gold/20 bg-black/40 p-6 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full border border-emerald/30 bg-emerald/10">
                <MailCheck className="h-7 w-7 text-emerald" />
              </div>
              <h2 className="font-display text-xl text-ivory">Verification Email Sent</h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground/60">
                Verification email sent successfully. Please check your inbox at{" "}
                <span className="text-gold">{sentTo}</span> and verify your email before signing in.
              </p>
              <p className="mt-3 text-[11px] text-foreground/40">
                The link is valid for 24 hours. Can&rsquo;t find it? Check your spam folder.
              </p>

              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={resendBusy || resendIn > 0}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-gold transition-all hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend email"}
              </button>

              {resendNote && (
                <p role="status" className="mt-3 text-xs text-foreground/60">
                  {resendNote}
                </p>
              )}

              <button
                type="button"
                onClick={() => {
                  setSentTo(null);
                  setResendNote(null);
                  setResendIn(0);
                }}
                className="mt-4 block w-full text-[11px] text-gold/60 underline-offset-2 hover:text-gold hover:underline"
              >
                Use a different email address
              </button>
            </div>
          ) : (
            <form className="space-y-3.5" onSubmit={handleEmail}>
              {mode === "signup" ? (
                <>
                  <Input
                    icon={<User className="h-4 w-4" />}
                    label="Username"
                    value={username}
                    onChange={setUsername}
                    placeholder="grandmaster"
                    required
                  />
                  <Input
                    icon={<Mail className="h-4 w-4" />}
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="your@email.com"
                    required
                    autoComplete="email"
                  />
                  <p className="ml-1 text-[11px] leading-relaxed text-foreground/40">
                    We&rsquo;ll email you a verification link. You&rsquo;ll set your password once
                    your address is confirmed.
                  </p>
                </>
              ) : (
                <>
                  <Input
                    icon={<Mail className="h-4 w-4" />}
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="your@email.com"
                    required
                    autoComplete="email"
                  />
                  <Input
                    icon={<Lock className="h-4 w-4" />}
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </>
              )}

              {mode === "signin" && (
                <div className="-mt-1 flex justify-end">
                  <Link
                    to="/forgot-password"
                    className="text-xs text-gold/70 underline-offset-2 transition-colors hover:text-gold hover:underline"
                  >
                    Forgot Password?
                  </Link>
                </div>
              )}

              {error && (
                <div
                  className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${
                    error.startsWith("Account created")
                      ? "border-emerald/30 bg-emerald/10 text-emerald"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  <div className="mt-0.5">•</div>
                  <div>{error}</div>
                </div>
              )}

              <div className="pt-1">
                <GoldButton className="w-full h-11 text-[14px]" disabled={busy} type="submit">
                  {busy ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : mode === "signin" ? (
                    "Sign In"
                  ) : (
                    "Create Account"
                  )}
                </GoldButton>
              </div>
            </form>
          )}

          <div className="my-6 flex items-center gap-4 text-xs font-medium text-foreground/40 uppercase tracking-widest">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/20" />
            or
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/20" />
          </div>

          <div className="space-y-3">
            <button
              disabled={busy}
              onClick={() => handleOAuth("google")}
              className="group relative flex w-full h-12 items-center justify-center gap-3 rounded-xl border border-gold/20 bg-[#0f0505] transition-all hover:border-gold/40 hover:bg-[#160707] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-gold/0 via-gold/5 to-gold/0" />
              <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span className="text-sm font-medium text-ivory/90 relative z-10">
                Continue with Google
              </span>
            </button>
          </div>

          <div className="mt-6 text-center text-[10px] text-foreground/40 leading-relaxed">
            By continuing, you agree to ChessOx's <br />
            <Link
              to="/terms-and-conditions"
              target="_blank"
              className="text-gold/70 hover:text-gold transition-colors underline decoration-gold/30 underline-offset-2"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              to="/privacy-policy"
              target="_blank"
              className="text-gold/70 hover:text-gold transition-colors underline decoration-gold/30 underline-offset-2"
            >
              Privacy Policy
            </Link>
            .
          </div>
        </div>
      </div>
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
  icon,
  disabled,
  autoComplete = "off",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
  autoComplete?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const actualType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-[0.1em] text-foreground/60 font-medium ml-1 block">
        {label}
      </label>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-foreground/40 group-focus-within:text-gold transition-colors">
          {icon}
        </div>
        <input
          type={actualType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          disabled={disabled}
          autoComplete={autoComplete}
          className={`w-full rounded-xl border border-gold/15 bg-black/40 py-3 pl-10 ${
            isPassword ? "pr-10" : "pr-4"
          } text-sm text-ivory outline-none transition-all placeholder:text-foreground/30 focus:border-gold/40 focus:bg-black/60 focus:ring-1 focus:ring-gold/40 disabled:opacity-60 disabled:cursor-not-allowed`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-foreground/40 hover:text-gold transition-colors focus:outline-none"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
