import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { useEffect, useRef, useState } from "react";
import { useAuth, useProfile, type Profile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  FileText,
  Key,
  Loader2,
  Lock,
  Shield,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — ChessOx" }] }),
  component: Settings,
});

const TABS = ["Profile", "Security", "Notifications", "Privacy", "Appearance"] as const;

function Settings() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Profile");
  const { user, loading } = useAuth();
  const { profile, loading: pLoading, setProfile } = useProfile(user?.id);
  const [form, setForm] = useState({ display_name: "", username: "", country: "India", bio: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile)
      setForm({
        display_name: profile.display_name,
        username: profile.username,
        country: profile.country ?? "India",
        bio: profile.bio ?? "",
      });
  }, [profile]);

  if (loading || pLoading) {
    return (
      <PageShell>
        <div className="grid place-items-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </PageShell>
    );
  }
  if (!user || !profile) {
    return (
      <PageShell eyebrow="Configure" title="Sign in to access settings">
        <Link to="/auth">
          <GoldButton>Sign in</GoldButton>
        </Link>
      </PageShell>
    );
  }

  async function saveProfile() {
    setSaving(true);
    const { error, data } = await supabase
      .from("profiles")
      .update({
        display_name: form.display_name,
        username: form.username,
        country: form.country,
        bio: form.bio,
      })
      .eq("id", user!.id)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setProfile(data as Profile | null);
    toast.success("Profile saved");
  }

  return (
    <PageShell eyebrow="Configure" title="Settings">
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <Card className="p-3">
          <ul className="space-y-1">
            {TABS.map((t) => (
              <li key={t}>
                <button
                  onClick={() => setTab(t)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${tab === t ? "bg-gold/10 text-gold" : "text-muted-foreground hover:bg-white/5"}`}
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          {tab === "Profile" && (
            <div className="space-y-5">
              <Field
                label="Display Name"
                value={form.display_name}
                onChange={(v) => setForm({ ...form, display_name: v })}
              />
              <Field
                label="Username"
                value={form.username}
                onChange={(v) => setForm({ ...form, username: v })}
              />
              <Field
                label="Country"
                value={form.country}
                onChange={(v) => setForm({ ...form, country: v })}
              />
              <Field
                label="Bio"
                value={form.bio}
                onChange={(v) => setForm({ ...form, bio: v })}
                textarea
              />
              <GoldButton onClick={saveProfile} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </GoldButton>
            </div>
          )}
          {tab === "Security" && <SecurityTab email={user.email ?? ""} />}
          {tab === "Notifications" && (
            <div className="space-y-3">
              {[
                "Tournament reminders",
                "Friend requests",
                "Club announcements",
                "Puzzle streak alerts",
                "Newsletter",
              ].map((n) => (
                <div
                  key={n}
                  className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm"
                >
                  <span>{n}</span>
                  <Toggle defaultOn={n !== "Newsletter"} />
                </div>
              ))}
            </div>
          )}
          {tab === "Privacy" && (
            <div className="space-y-3">
              {[
                "Show profile to public",
                "Show rating history",
                "Allow direct challenges",
                "Show online status",
              ].map((n) => (
                <div
                  key={n}
                  className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm"
                >
                  <span>{n}</span>
                  <Toggle defaultOn />
                </div>
              ))}
            </div>
          )}
          {tab === "Appearance" && (
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-sm">Board Theme</div>
                <div className="grid grid-cols-4 gap-3">
                  {["Rosewood", "Marble", "Brass", "Emerald"].map((b, i) => (
                    <button
                      key={b}
                      className={`rounded-lg border p-3 text-xs ${i === 0 ? "border-gold ring-2 ring-gold/30" : "border-white/10"}`}
                    >
                      <div className="aspect-square overflow-hidden rounded-md">
                        <div className="grid h-full grid-cols-4 grid-rows-4">
                          {Array.from({ length: 16 }).map((_, k) => (
                            <div
                              key={k}
                              className={
                                (k + Math.floor(k / 4)) % 2 === 0 ? "bg-[#E8D5B0]" : "bg-[#8B5A2B]"
                              }
                            />
                          ))}
                        </div>
                      </div>
                      <div className="mt-2">{b}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm">
                <span>Royal sound effects</span>
                <Toggle defaultOn />
              </div>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

// ─── Password helpers ────────────────────────────────────────────────────────

const PASSWORD_REQUIREMENTS = [
  { key: "length",  label: "Minimum 8 characters",          test: (p: string) => p.length >= 8 },
  { key: "upper",   label: "At least one uppercase letter",  test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower",   label: "At least one lowercase letter",  test: (p: string) => /[a-z]/.test(p) },
  { key: "number",  label: "At least one number",            test: (p: string) => /\d/.test(p) },
  { key: "special", label: "At least one special character", test: (p: string) => /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/.test(p) },
] as const;

function checkPassword(pw: string) {
  return PASSWORD_REQUIREMENTS.map((r) => ({ ...r, passing: r.test(pw) }));
}

function isStrongPassword(pw: string) {
  return PASSWORD_REQUIREMENTS.every((r) => r.test(pw));
}

const MAX_ATTEMPTS   = 5;
const LOCKOUT_SECS   = 60;

// ─── PasswordField ───────────────────────────────────────────────────────────

function PasswordField({
  label,
  value,
  onChange,
  placeholder = "••••••••",
  error,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`w-full rounded-lg border bg-white/[0.02] px-3 py-2 pr-10 text-sm outline-none transition-colors focus:border-gold/40 ${
            error ? "border-destructive/50 focus:border-destructive/60" : "border-white/10"
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─── SecurityTab ─────────────────────────────────────────────────────────────

function SecurityTab({ email }: { email: string }) {
  const navigate = useNavigate();

  const [current, setCurrent]   = useState("");
  const [next, setNext]         = useState("");
  const [confirm, setConfirm]   = useState("");
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [busy, setBusy]         = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft]   = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lockout countdown ticker
  useEffect(() => {
    if (!lockoutUntil) return;
    timerRef.current = setInterval(() => {
      const rem = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (rem <= 0) {
        setLockoutUntil(null);
        setAttempts(0);
        setSecondsLeft(0);
        setErrors((e) => ({ ...e, current: "" }));
      } else {
        setSecondsLeft(rem);
      }
    }, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lockoutUntil]);

  const lockedOut = lockoutUntil !== null && Date.now() < lockoutUntil;
  const checks    = checkPassword(next);

  function clearField(field: keyof typeof errors) {
    setErrors((e) => ({ ...e, [field]: "" }));
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!current)               e.current = "Current password is required.";
    if (!next)                  e.next    = "New password is required.";
    else if (!isStrongPassword(next)) e.next = "Password does not meet the requirements below.";
    if (!confirm)               e.confirm = "Please confirm your new password.";
    else if (next !== confirm)  e.confirm = "Passwords do not match.";
    if (current && next && current === next)
      e.next = "New password must differ from your current password.";
    return e;
  }

  async function handleSubmit() {
    if (lockedOut || busy) return;

    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setBusy(true);
    try {
      // Step 1: verify current password by re-authenticating
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });

      if (signInErr) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (newAttempts >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_SECS * 1000;
          setLockoutUntil(until);
          setSecondsLeft(LOCKOUT_SECS);
          setErrors({ current: `Too many failed attempts. Try again in ${LOCKOUT_SECS}s.` });
        } else {
          const remaining = MAX_ATTEMPTS - newAttempts;
          setErrors({
            current: `Incorrect password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
          });
        }
        setBusy(false);
        return;
      }

      // Step 2: update password (Supabase hashes server-side; we never touch the hash)
      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) {
        setErrors({ general: updateErr.message });
        setBusy(false);
        return;
      }

      // Success: clear fields, reset counters
      setCurrent("");
      setNext("");
      setConfirm("");
      setErrors({});
      setAttempts(0);

      toast.success("Password changed. Please sign in again.");

      // Sign out all sessions and redirect to auth after brief delay so toast is visible
      setTimeout(async () => {
        await supabase.auth.signOut({ scope: "global" });
        navigate({ to: "/auth" });
      }, 2000);
    } catch {
      setErrors({ general: "Network error. Please try again." });
      setBusy(false);
    }
  }

  function handleCancel() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setErrors({});
  }

  const isDirty = current !== "" || next !== "" || confirm !== "";

  return (
    <div className="space-y-8">

      {/* ── Password Section ───────────────────────────────────────────── */}
      <div>
        {/* Section header */}
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/10">
            <Lock className="h-4 w-4 text-gold" />
          </span>
          <div>
            <div className="font-display text-lg leading-tight">Password</div>
            <div className="text-xs text-muted-foreground">
              Keep your account secure with a strong, unique password
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Email (read-only) */}
          <div>
            <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              Email
            </div>
            <div className="w-full rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2 text-sm text-muted-foreground">
              {email}
            </div>
          </div>

          {/* Current Password */}
          <PasswordField
            label="Current Password"
            value={current}
            onChange={(v) => { setCurrent(v); clearField("current"); }}
            error={errors.current}
            autoComplete="current-password"
          />

          {/* New Password + live requirements */}
          <div>
            <PasswordField
              label="New Password"
              value={next}
              onChange={(v) => { setNext(v); clearField("next"); }}
              error={errors.next}
              autoComplete="new-password"
            />

            {/* Requirements checklist — shown while the user is typing */}
            {next.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-3 sm:grid-cols-2">
                {checks.map(({ key, label, passing }) => (
                  <div
                    key={key}
                    className={`flex items-center gap-2 text-xs transition-colors ${
                      passing ? "text-emerald" : "text-muted-foreground"
                    }`}
                  >
                    {passing ? (
                      <Check className="h-3 w-3 shrink-0" />
                    ) : (
                      <X className="h-3 w-3 shrink-0" />
                    )}
                    {label}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <PasswordField
            label="Confirm New Password"
            value={confirm}
            onChange={(v) => { setConfirm(v); clearField("confirm"); }}
            error={errors.confirm}
            autoComplete="new-password"
          />

          {/* General error banner */}
          {errors.general && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errors.general}
            </div>
          )}

          {/* Lockout warning */}
          {lockedOut && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Account temporarily locked. Try again in{" "}
              <span className="font-mono font-semibold">{secondsLeft}s</span>.
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <GoldButton onClick={handleSubmit} disabled={busy || lockedOut}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : (
                "Change Password"
              )}
            </GoldButton>

            {isDirty && !busy && (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="royal-divider" />

      {/* ── Future Security Features (architecture-ready placeholders) ── */}
      <div>
        <div className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">
          Advanced Security
        </div>
        <div className="space-y-2.5">
          {[
            {
              icon: Shield,
              title: "Two-Factor Authentication",
              desc: "Require a code from your authenticator app at every sign-in.",
            },
            {
              icon: Smartphone,
              title: "Active Sessions",
              desc: "View and revoke access from other devices and browsers.",
            },
            {
              icon: Key,
              title: "Passkeys",
              desc: "Sign in without a password using biometrics or a security key.",
            },
            {
              icon: FileText,
              title: "Security Activity Log",
              desc: "Review recent sign-ins, password changes, and security events.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3.5"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-sm">{title}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-gold/20 bg-gold/5 px-3 py-0.5 text-xs text-gold/60">
                Coming Soon
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shared helpers (Profile tab & other tabs) ───────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-24 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
        />
      )}
    </label>
  );
}

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      onClick={() => setOn(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? "gradient-gold" : "bg-white/10"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}
