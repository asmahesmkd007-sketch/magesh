import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Crown, Loader2, ChevronLeft, Mail, Lock, User, ShieldCheck, Check, X, Eye, EyeOff } from "lucide-react";
import { GoldButton } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { requestEmailOtp, verifyEmailOtpAndRegister } from "@/lib/api/auth-otp.functions";
import heroRegal from "@/assets/hero-regal.jpg";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/auth")({
  head: () =>
    noindexSeo(
      "Sign In or Create a Free Account — ChessOx",
      "Sign in to ChessOx or create a free account to play chess online, solve chess puzzles and join online chess tournaments.",
    ),
  component: AuthPage,
});

// Mirrors the server-side rules in auth-otp.functions.ts — kept as private,
// duplicated constants per this repo's convention (see reset-password.tsx)
// rather than a shared import, so each page's validation stays self-contained.
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const PASSWORD_REQUIREMENTS = [
  { key: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { key: "upper", label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower", label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { key: "number", label: "One number", test: (p: string) => /\d/.test(p) },
  {
    key: "special",
    label: "One special character",
    test: (p: string) => /[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?`~]/.test(p),
  },
] as const;
function passwordMeetsPolicy(pw: string): boolean {
  return PASSWORD_REQUIREMENTS.every((r) => r.test(pw));
}

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
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "That email already has an account. Try signing in instead.";
  }
  if (m.includes("invalid login credentials")) {
    return "Incorrect email or password. Please check and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Please verify your email before logging in.";
  }
  if (m.includes("password") && m.includes("6")) {
    return "Password must be at least 6 characters.";
  }
  return msg;
}

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

  // ---- Email OTP verification (signup only) --------------------------------
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const otpEmailRef = useRef<string | null>(null); // email the current OTP was actually sent to

  // Already authenticated — go straight to home.
  useEffect(() => {
    if (session) navigate({ to: "/home" });
  }, [session, navigate]);

  // Countdown ticker for the resend cooldown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  function resetOtpState() {
    setOtp("");
    setOtpSent(false);
    setVerifyNotice(null);
    setResendIn(0);
    otpEmailRef.current = null;
  }

  function switchMode(m: "signin" | "signup") {
    setMode(m);
    setError(null);
    resetOtpState();
  }

  // "Verify" beside the email field — sends the OTP. Also used as "Resend".
  async function handleVerifyClick() {
    setVerifyNotice(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setVerifyNotice({ type: "error", text: "Enter a valid email address first." });
      return;
    }
    if (!USERNAME_REGEX.test(cleanUsername)) {
      setVerifyNotice({
        type: "error",
        text: "Username must be 3-20 characters (letters, numbers, underscore only).",
      });
      return;
    }

    setVerifyBusy(true);
    try {
      const result = await requestEmailOtp({
        data: { email: cleanEmail, username: cleanUsername },
      });
      otpEmailRef.current = cleanEmail;
      setOtpSent(true);
      setOtp("");
      setResendIn(result.resendInSeconds);
      setVerifyNotice({ type: "success", text: `Verification code sent to ${cleanEmail}.` });
    } catch (e) {
      setVerifyNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Failed to send code.",
      });
    } finally {
      setVerifyBusy(false);
    }
  }

  function handleChangeEmail() {
    resetOtpState();
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
        if (!otpSent || otpEmailRef.current !== cleanEmail) {
          throw new Error("Please verify your email address first.");
        }
        if (!/^\d{6}$/.test(otp)) {
          throw new Error("Enter the 6-digit code sent to your email.");
        }
        if (!passwordMeetsPolicy(cleanPassword)) {
          throw new Error("Password does not meet the requirements below.");
        }

        await verifyEmailOtpAndRegister({
          data: { email: cleanEmail, username: cleanUsername, password: cleanPassword, otp },
        });

        // Account now exists (email already verified server-side) — sign in
        // to establish the client session, same as the signin branch below.
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });
        if (signInError) throw signInError;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });
        if (error) throw error;
      }
      router.invalidate();
      navigate({ to: "/home" });
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
      setError(friendlyAuthError(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-80px)] w-full bg-[#0f0505]">
      {/* Left Side - Visual Hero (Hidden on small screens) */}
      <div className="relative hidden w-1/2 overflow-hidden lg:block border-r border-gold/15">
        <img
          src={heroRegal}
          alt="Premium chess set on the ChessOx sign-in page"
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
        {/* Subtle background mandala for right side */}
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
                  disabled={otpSent}
                />

                {/* Email + Verify button */}
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.1em] text-foreground/60 font-medium ml-1 block">
                    Email
                  </label>
                  <div className="flex gap-2">
                    <div className="relative group flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-foreground/40 group-focus-within:text-gold transition-colors">
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        required
                        disabled={otpSent}
                        autoComplete="off"
                        className="w-full rounded-xl border border-gold/15 bg-black/40 py-3 pl-10 pr-4 text-sm text-ivory outline-none transition-all placeholder:text-foreground/30 focus:border-gold/40 focus:bg-black/60 focus:ring-1 focus:ring-gold/40 disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleVerifyClick}
                      disabled={verifyBusy || (otpSent && resendIn > 0)}
                      className="shrink-0 rounded-xl border border-gold/30 bg-gold/10 px-4 text-xs font-medium uppercase tracking-wide text-gold transition-all hover:bg-gold/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {verifyBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : otpSent ? (
                        resendIn > 0 ? (
                          `Resend (${resendIn}s)`
                        ) : (
                          "Resend"
                        )
                      ) : (
                        "Verify"
                      )}
                    </button>
                  </div>
                  {otpSent && (
                    <button
                      type="button"
                      onClick={handleChangeEmail}
                      className="text-[11px] text-gold/60 underline-offset-2 hover:text-gold hover:underline ml-1"
                    >
                      Change email
                    </button>
                  )}
                  {verifyNotice && (
                    <p
                      className={`text-xs ml-1 ${verifyNotice.type === "success" ? "text-emerald" : "text-destructive"}`}
                    >
                      {verifyNotice.text}
                    </p>
                  )}
                </div>

                {/* OTP field — appears once the code has been sent */}
                {otpSent && (
                  <Input
                    icon={<ShieldCheck className="h-4 w-4" />}
                    label="Verification Code"
                    type="text"
                    value={otp}
                    onChange={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    required
                  />
                )}
              </>
            ) : (
              <Input
                icon={<Mail className="h-4 w-4" />}
                label="Email Address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="your@email.com"
                required
              />
            )}
            <Input
              icon={<Lock className="h-4 w-4" />}
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
              minLength={8}
              autoComplete="new-password"
            />

            {mode === "signup" && password.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 -mt-1 ml-1">
                {PASSWORD_REQUIREMENTS.map((r) => {
                  const passing = r.test(password);
                  return (
                    <div
                      key={r.key}
                      className={`flex items-center gap-1.5 text-[11px] ${passing ? "text-emerald" : "text-foreground/40"}`}
                    >
                      {passing ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {r.label}
                    </div>
                  );
                })}
              </div>
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
              <GoldButton
                className="w-full h-11 text-[14px]"
                disabled={
                  busy ||
                  (mode === "signup" &&
                    (!otpSent || otp.length !== 6 || !passwordMeetsPolicy(password)))
                }
                type="submit"
              >
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
              to="/"
              className="text-gold/70 hover:text-gold transition-colors underline decoration-gold/30 underline-offset-2"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              to="/"
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
