import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crown, Globe, KeyRound, Loader2, MapPin, User } from "lucide-react";
import { Card, GoldButton } from "@/components/site/Primitives";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  generate11CharUsername,
  isValidUsernameFormat,
  passwordMeetsPolicy,
} from "@/lib/auth/password";
import { PasswordFields } from "@/components/auth/PasswordFields";
import { logger } from "@/lib/logger";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/onboarding")({
  head: () =>
    noindexSeo(
      "Complete Your Profile — ChessOx",
      "Set up your ChessOx account profile and username.",
    ),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile(user?.id);
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [country, setCountry] = useState("India");
  const [stateName, setStateName] = useState("");
  const [city, setCity] = useState("");
  const [timezone, setTimezone] = useState("");
  const [language, setLanguage] = useState("English");

  // Optional password setup
  const [wantPassword, setWantPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/auth" });
      return;
    }

    // Auto-detect timezone
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setTimezone(tz);
    } catch {
      setTimezone("Asia/Kolkata");
    }

    if (profile) {
      if (profile.full_name && !fullName) setFullName(profile.full_name);
      if (profile.country && !country) setCountry(profile.country);
      if (profile.state && !stateName) setStateName(profile.state);

      if (!username) {
        if (
          profile.username &&
          profile.username.length === 11 &&
          isValidUsernameFormat(profile.username)
        ) {
          setUsername(profile.username);
        } else {
          setUsername(generate11CharUsername(profile.full_name || user?.email?.split("@")[0]));
        }
      }
    } else if (user && !username) {
      const seed = user.user_metadata?.full_name || user.email?.split("@")[0] || "player";
      setUsername(generate11CharUsername(seed));
    }
  }, [user, profile, authLoading, navigate]);

  function handleRegenerateUsername() {
    const seed = fullName || user?.email?.split("@")[0] || "player";
    setUsername(generate11CharUsername(seed));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!user) return;
    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!username || username.length !== 11 || !isValidUsernameFormat(username)) {
      setError(
        "Username must be exactly 11 characters (8 letters, '_' or '.', 2 numbers - e.g. chessfox_42).",
      );
      return;
    }
    if (!country.trim()) {
      setError("Please enter your country.");
      return;
    }

    if (wantPassword) {
      if (!password || !confirmPassword) {
        setError("Please enter both password fields.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (!passwordMeetsPolicy(password)) {
        setError("Please choose a password meeting all requirements below.");
        return;
      }
    }

    setBusy(true);

    try {
      // 1. Check username uniqueness
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", user.id)
        .maybeSingle();

      if (existingProfile) {
        throw new Error(
          "This username is already taken. Please click regenerate or pick another 11-char username.",
        );
      }

      // 2. Update profile
      const looseDb = supabase as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<{ error: unknown }>;
          };
        };
      };

      const { error: profErr } = await looseDb
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          username: username.trim(),
          country: country.trim(),
          state: stateName.trim(),
          district: city.trim(),
        })
        .eq("id", user.id);

      if (profErr) throw profErr;

      // 3. Update optional password for Google accounts if requested
      let passwordCreated = false;
      if (wantPassword && password) {
        const { error: passErr } = await supabase.auth.updateUser({ password });
        if (passErr) {
          logger.warn("Password creation warning", { error: passErr.message });
        } else {
          passwordCreated = true;
        }
      }

      // 4. Mark profile completed in user_accounts table (or metadata)
      try {
        const loose = supabase as unknown as {
          from: (t: string) => {
            upsert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
          };
        };
        await loose.from("user_accounts").upsert({
          id: user.id,
          email: user.email,
          profile_completed: true,
          password_created: passwordCreated,
          timezone: timezone || "Asia/Kolkata",
          preferred_language: language || "English",
          updated_at: new Date().toISOString(),
        });
      } catch {
        /* user_accounts table fallback */
      }

      // Update user metadata as backup flag
      await supabase.auth.updateUser({
        data: { profile_completed: true, username: username.trim() },
      });

      navigate({ to: "/home" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || profileLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0505] px-4 py-12 flex items-center justify-center">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <span className="inline-grid h-12 w-12 place-items-center rounded-2xl gradient-gold text-background mb-3">
            <Crown className="h-6 w-6" />
          </span>
          <h1 className="font-display text-3xl text-ivory">Complete Your Profile</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Set up your regal persona to begin playing on ChessOx.
          </p>
        </div>

        <Card className="p-8 backdrop-blur-md bg-black/50 border-gold/20">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-foreground/70 block">
                Full Name <span className="text-gold">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 h-4 w-4 text-foreground/40" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Viswanathan Anand"
                  required
                  className="w-full rounded-xl border border-gold/15 bg-black/40 py-3 pl-10 pr-4 text-sm text-ivory outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/40"
                />
              </div>
            </div>

            {/* Username Selection */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-foreground/70 block">
                  Username (Exactly 11 Characters) <span className="text-gold">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleRegenerateUsername}
                  className="text-xs text-gold/80 hover:text-gold underline"
                >
                  Auto Generate
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-3.5 text-xs text-gold/60 font-mono">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={11}
                  placeholder="chessfox_42"
                  required
                  className="w-full rounded-xl border border-gold/15 bg-black/40 py-3 pl-8 pr-4 text-sm font-mono text-gold outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/40"
                />
              </div>
              <p className="text-[11px] text-foreground/50">
                Format: 8 letters + '_' or '.' + 2 numbers (e.g.,{" "}
                <code className="text-gold">chessfox_42</code>)
              </p>
            </div>

            {/* Location Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-foreground/70 block">
                  Country
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-3 h-4 w-4 text-foreground/40" />
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="India"
                    required
                    className="w-full rounded-xl border border-gold/15 bg-black/40 py-2.5 pl-9 pr-3 text-xs text-ivory outline-none focus:border-gold/40"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-foreground/70 block">
                  State / Province
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-foreground/40" />
                  <input
                    type="text"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    placeholder="Tamil Nadu"
                    required
                    className="w-full rounded-xl border border-gold/15 bg-black/40 py-2.5 pl-9 pr-3 text-xs text-ivory outline-none focus:border-gold/40"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-foreground/70 block">
                  City <span className="text-foreground/40">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Chennai"
                  className="w-full rounded-xl border border-gold/15 bg-black/40 py-2.5 px-3 text-xs text-ivory outline-none focus:border-gold/40"
                />
              </div>
            </div>

            {/* Timezone & Language */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-foreground/70 block">
                  Timezone
                </label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Asia/Kolkata"
                  className="w-full rounded-xl border border-gold/15 bg-black/40 py-2.5 px-3 text-xs text-ivory outline-none focus:border-gold/40"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-foreground/70 block">
                  Preferred Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-xl border border-gold/15 bg-black/40 py-2.5 px-3 text-xs text-ivory outline-none focus:border-gold/40"
                >
                  <option value="English">English</option>
                  <option value="Tamil">Tamil</option>
                  <option value="Hindi">Hindi</option>
                </select>
              </div>
            </div>

            {/* Optional Password for Google / Passwordless Accounts */}
            <div className="pt-3 border-t border-gold/15">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wantPassword}
                  onChange={(e) => setWantPassword(e.target.checked)}
                  className="rounded border-gold/30 bg-black/40 text-gold focus:ring-gold"
                />
                <span className="text-xs font-medium text-gold/90 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> Create a Password for ChessOX (Optional)
                </span>
              </label>
              <p className="mt-1 text-[11px] text-foreground/50 ml-6">
                Setting a password allows logging in with both Google and Email + Password.
              </p>

              {wantPassword && (
                <div className="mt-4 p-4 rounded-xl border border-gold/15 bg-black/30">
                  <PasswordFields
                    password={password}
                    onPasswordChange={setPassword}
                    confirm={confirmPassword}
                    onConfirmChange={setConfirmPassword}
                    disabled={busy}
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                <div>•</div>
                <div>{error}</div>
              </div>
            )}

            <GoldButton
              className="w-full h-11 text-sm justify-center"
              disabled={busy}
              type="submit"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Complete Profile & Start Playing"
              )}
            </GoldButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
