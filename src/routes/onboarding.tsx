import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Crown, Globe, Loader2, MapPin, ShieldCheck, User } from "lucide-react";
import { Card, GoldButton } from "@/components/site/Primitives";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  generate11CharUsername,
  isValidUsernameFormat,
  passwordMeetsPolicy,
} from "@/lib/auth/password";
import { CreatePasswordSection } from "@/components/auth/CreatePasswordSection";
import { SearchableSelect, type SelectOption } from "@/components/ui/SearchableSelect";
import { COUNTRIES, countryByCode, countryFlag } from "@/data/countries";
import {
  hasSubdivisions,
  keepSubdivisionIfValid,
  subdivisionLabel,
  subdivisionsFor,
} from "@/data/subdivisions";
import { detectTimezone, resolveInitialCountry } from "@/lib/geo/detectCountry";
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

// Columns added by later migrations. A database that has not received
// them yet must still be able to finish onboarding, so a write that
// fails on one of these is retried without it (see saveProfile).
const OPTIONAL_PROFILE_COLUMNS = ["country_code", "city"] as const;

type LooseUpdate = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};

function errorText(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  const withMessage = error as { message?: string; details?: string };
  return `${withMessage.message ?? ""} ${withMessage.details ?? ""}`.trim() || String(error);
}

/**
 * Writes the profile, dropping any column the deployed schema does not
 * have yet and retrying. Onboarding is the one screen a player cannot
 * skip, so a pending migration must degrade it, never block it.
 */
async function saveProfile(userId: string, payload: Record<string, unknown>): Promise<void> {
  const db = supabase as unknown as LooseUpdate;
  const values = { ...payload };

  for (let attempt = 0; attempt <= OPTIONAL_PROFILE_COLUMNS.length; attempt++) {
    const { error } = await db.from("profiles").update(values).eq("id", userId);
    if (!error) return;

    const message = errorText(error);
    const missing = OPTIONAL_PROFILE_COLUMNS.find((c) => c in values && message.includes(c));
    if (!missing) throw error;

    logger.warn("profiles column missing, retrying without it", { column: missing });
    delete values[missing];
  }
}

/** Supabase Auth errors, phrased for someone finishing a signup form. */
function friendlyPasswordError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("different from the old password")) {
    return "This account already uses that password — you can sign in with Email + Password right away. Clear both password fields to finish without changing it.";
  }
  if (m.includes("session") || m.includes("jwt")) {
    return "Your sign-in session expired before the password could be saved. Please sign in again and retry.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts right now. Please wait a minute and try again.";
  }
  return `Your profile was saved, but the password could not be set: ${message}`;
}

function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile(user?.id);
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [countryDetected, setCountryDetected] = useState(false);
  const [stateName, setStateName] = useState("");
  const [city, setCity] = useState("");
  const [timezone, setTimezone] = useState("");
  const [language, setLanguage] = useState("English");

  // Optional password setup (Google accounts and anyone without one).
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // null while unknown — the section renders until we learn otherwise.
  const [alreadyHasPassword, setAlreadyHasPassword] = useState<boolean | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill must run once, when the profile first resolves. Re-running it
  // would overwrite what the player has since typed.
  const hydrated = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    setTimezone(detectTimezone() || "Asia/Kolkata");
  }, []);

  useEffect(() => {
    if (hydrated.current) return;
    if (authLoading || profileLoading || !user) return;
    hydrated.current = true;

    const meta = user.user_metadata ?? {};
    setFullName(profile?.full_name || (meta.full_name as string) || (meta.name as string) || "");

    const existing = profile?.username;
    if (existing && existing.length === 11 && isValidUsernameFormat(existing)) {
      setUsername(existing);
    } else {
      const seed =
        profile?.full_name || (meta.full_name as string) || user.email?.split("@")[0] || "player";
      setUsername(generate11CharUsername(seed));
    }

    setCity(profile?.city ?? profile?.district ?? "");

    const initial = resolveInitialCountry({
      savedCode: profile?.country_code,
      savedName: profile?.country,
    });
    if (initial) {
      setCountryCode(initial.country.code);
      setCountryDetected(initial.detected);
      // Drop a saved state that does not belong to the country we opened
      // on — otherwise the dropdown shows blank while the form still
      // holds the old value.
      setStateName(keepSubdivisionIfValid(initial.country.code, profile?.state));
    }
  }, [authLoading, profileLoading, user, profile]);

  // Someone who signed up with email already has a password; offering to
  // "create" one again would only produce a confusing Auth error.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const db = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            col: string,
            val: string,
          ) => { maybeSingle: () => Promise<{ data: { password_created?: boolean } | null }> };
        };
      };
    };
    db.from("user_accounts")
      .select("password_created")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setAlreadyHasPassword(data?.password_created === true);
      })
      .catch(() => {
        // Table missing or unreadable — show the section, the Auth call
        // is the real authority either way.
        if (alive) setAlreadyHasPassword(false);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  const countryOptions = useMemo<SelectOption[]>(
    () =>
      COUNTRIES.map((c) => ({
        value: c.code,
        label: c.name,
        prefix: countryFlag(c.code),
        keywords: c.code,
      })),
    [],
  );

  const country = countryByCode(countryCode);
  const states = subdivisionsFor(countryCode);
  const stateIsList = hasSubdivisions(countryCode);
  const stateLabel = subdivisionLabel(countryCode);

  const stateOptions = useMemo<SelectOption[]>(
    () => states.map((s) => ({ value: s, label: s })),
    [states],
  );

  function handleCountryChange(option: SelectOption | null) {
    setCountryCode(option?.value ?? null);
    setCountryDetected(false);
    // Changing country invalidates the state: Tamil Nadu is not a
    // province of Canada.
    setStateName("");
  }

  function handleRegenerateUsername() {
    const seed = fullName || user?.email?.split("@")[0] || "player";
    setUsername(generate11CharUsername(seed));
  }

  const wantsPassword = password.length > 0 || confirmPassword.length > 0;

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
    if (!country) {
      setError("Please select your country.");
      return;
    }
    if (!stateName || !states.includes(stateName)) {
      setError(`Please select a valid ${stateLabel.toLowerCase()} from the dropdown list.`);
      return;
    }

    if (wantsPassword) {
      if (!password || !confirmPassword) {
        setError("Please fill in both password fields, or clear them both to skip this step.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (!passwordMeetsPolicy(password)) {
        setError("Please choose a password meeting all the requirements shown below.");
        return;
      }
    }

    setBusy(true);

    try {
      // 1. Username uniqueness
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", user.id)
        .maybeSingle();

      if (existingProfile) {
        throw new Error(
          "This username is already taken. Please click Auto Generate or pick another 11-char username.",
        );
      }

      // 2. Profile. `district` is written alongside `city` because the
      //    leaderboard and friend filters still read district.
      await saveProfile(user.id, {
        full_name: fullName.trim(),
        username: username.trim(),
        country: country.name,
        country_code: country.code,
        state: stateName.trim(),
        city: city.trim(),
        district: city.trim(),
      });

      // 3. Mark onboarding done in database RPC.
      try {
        const rpc = supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
        };
        const { error: rpcErr } = await rpc.rpc("complete_onboarding", {
          p_timezone: timezone || null,
          p_language: language || null,
        });
        if (rpcErr)
          logger.warn("complete_onboarding rpc unavailable", { error: errorText(rpcErr) });
      } catch (err) {
        logger.warn("complete_onboarding rpc threw", { error: errorText(err) });
      }

      // 4. Update user metadata and optional password.
      // Refresh session first if missing or stale to prevent "JWT/session expired" error.
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        sessionData = refreshData;
      }

      const updatePayload: { password?: string; data: Record<string, unknown> } = {
        data: { profile_completed: true, username: username.trim() },
      };
      if (wantsPassword) {
        updatePayload.password = password;
      }

      let { error: authErr } = await supabase.auth.updateUser(updatePayload);

      // Retry once after session refresh if a session error occurred
      if (
        authErr &&
        (authErr.message.toLowerCase().includes("session") ||
          authErr.message.toLowerCase().includes("jwt"))
      ) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) {
          const retry = await supabase.auth.updateUser(updatePayload);
          authErr = retry.error;
        }
      }

      if (authErr && wantsPassword) {
        logger.warn("password creation failed during onboarding", { error: authErr.message });
        setError(friendlyPasswordError(authErr.message));
        setBusy(false);
        return;
      }

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
    <div className="flex min-h-screen items-center justify-center bg-[#0f0505] px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <span className="mb-3 inline-grid h-12 w-12 place-items-center rounded-2xl gradient-gold text-background">
            <Crown className="h-6 w-6" />
          </span>
          <h1 className="font-display text-3xl text-ivory">Complete Your Profile</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Set up your regal persona to begin playing on ChessOx.
          </p>
        </div>

        <Card className="border-gold/20 bg-black/50 p-6 backdrop-blur-md sm:p-8">
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
            noValidate
            autoComplete="off"
            data-lpignore="true"
          >
            {/* Full Name */}
            <div className="space-y-1.5">
              <label
                htmlFor="onboarding-full-name"
                className="block text-xs font-medium uppercase tracking-wider text-foreground/70"
              >
                Full Name <span className="text-gold">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 h-4 w-4 text-foreground/40" />
                <input
                  id="onboarding-full-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Viswanathan Anand"
                  className="w-full rounded-xl border border-gold/15 bg-black/40 py-3 pl-10 pr-4 text-sm text-ivory outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/40"
                />
              </div>
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="onboarding-username"
                  className="block text-xs font-medium uppercase tracking-wider text-foreground/70"
                >
                  Username (Exactly 11 Characters) <span className="text-gold">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleRegenerateUsername}
                  className="text-xs text-gold/80 underline hover:text-gold"
                >
                  Auto Generate
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-3.5 font-mono text-xs text-gold/60">@</span>
                <input
                  id="onboarding-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={11}
                  placeholder="chessfox_42"
                  className="w-full rounded-xl border border-gold/15 bg-black/40 py-3 pl-8 pr-4 font-mono text-sm text-gold outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/40"
                />
              </div>
              <p className="text-[11px] text-foreground/50">
                Format: 8 letters + '_' or '.' + 2 numbers (e.g.,{" "}
                <code className="text-gold">chessfox_42</code>)
              </p>
            </div>

            {/* Location */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  id="onboarding-country-label"
                  htmlFor="onboarding-country"
                  className="block text-xs font-medium uppercase tracking-wider text-foreground/70"
                >
                  Country <span className="text-gold">*</span>
                </label>
                <SearchableSelect
                  id="onboarding-country"
                  labelledBy="onboarding-country-label"
                  options={countryOptions}
                  value={countryCode}
                  onChange={handleCountryChange}
                  placeholder="Search country…"
                  emptyMessage="No country matches that search"
                  required
                  disabled={busy}
                  adornment={!country ? <Globe className="h-4 w-4" /> : undefined}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  id="onboarding-state-label"
                  htmlFor="onboarding-state"
                  className="block text-xs font-medium uppercase tracking-wider text-foreground/70"
                >
                  {stateLabel} <span className="text-gold">*</span>
                </label>
                <SearchableSelect
                  id="onboarding-state"
                  labelledBy="onboarding-state-label"
                  options={stateOptions}
                  value={stateName || null}
                  onChange={(option) => setStateName(option?.value ?? "")}
                  placeholder={
                    country ? `Search ${stateLabel.toLowerCase()}…` : "Select a country first"
                  }
                  emptyMessage="No match in this country"
                  required
                  disabled={busy || !country}
                  adornment={!stateName ? <MapPin className="h-4 w-4" /> : undefined}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="onboarding-city"
                  className="block text-xs font-medium uppercase tracking-wider text-foreground/70"
                >
                  City <span className="text-foreground/40">(Optional)</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                  <input
                    id="onboarding-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Chennai"
                    disabled={busy}
                    className="w-full rounded-xl border border-gold/15 bg-black/40 py-2.5 pl-9 pr-3 text-xs text-ivory outline-none placeholder:text-foreground/30 focus:border-gold/40"
                  />
                </div>
              </div>
            </div>

            {countryDetected && country && (
              <p className="-mt-2 text-[11px] text-foreground/50">
                Detected <span className="text-gold/80">{country.name}</span> from your device
                settings — change it above if that isn&rsquo;t right.
              </p>
            )}

            {/* Timezone & Language */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="onboarding-timezone"
                  className="block text-xs font-medium uppercase tracking-wider text-foreground/70"
                >
                  Timezone
                </label>
                <input
                  id="onboarding-timezone"
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Asia/Kolkata"
                  className="w-full rounded-xl border border-gold/15 bg-black/40 px-3 py-2.5 text-xs text-ivory outline-none focus:border-gold/40"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="onboarding-language"
                  className="block text-xs font-medium uppercase tracking-wider text-foreground/70"
                >
                  Preferred Language
                </label>
                <select
                  id="onboarding-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-xl border border-gold/15 bg-black/40 px-3 py-2.5 text-xs text-ivory outline-none focus:border-gold/40"
                >
                  <option value="English">English</option>
                  <option value="Tamil">Tamil</option>
                  <option value="Hindi">Hindi</option>
                </select>
              </div>
            </div>

            {/* Optional password */}
            {alreadyHasPassword ? (
              <div className="flex gap-2.5 rounded-xl border border-gold/15 bg-black/30 p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-[11px] leading-relaxed text-foreground/60">
                  This account already has a ChessOX password, so you can sign in with Email +
                  Password. You can change it any time from Settings → Security.
                </p>
              </div>
            ) : (
              <CreatePasswordSection
                password={password}
                onPasswordChange={setPassword}
                confirm={confirmPassword}
                onConfirmChange={setConfirmPassword}
                disabled={busy}
              />
            )}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                <div className="mt-0.5">•</div>
                <div>{error}</div>
              </div>
            )}

            <GoldButton
              className="h-11 w-full justify-center text-sm"
              disabled={busy}
              type="submit"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Complete Profile & Start Playing"
              )}
            </GoldButton>

            <p className="text-center text-[11px] text-foreground/40">
              Leave the password fields empty to finish with Google Sign-In only.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
