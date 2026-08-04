// =====================================================================
// CreatePasswordSection — the optional password block on onboarding
// ---------------------------------------------------------------------
// Replaces the old "tick this box to reveal a password form" flow. The
// fields are always visible and always optional: leaving both empty is
// a valid way to finish onboarding, and the section says so rather than
// making the player guess.
//
// The policy itself is NOT duplicated here — every rule, and the
// Weak / Medium / Strong meter, comes from lib/auth/password so this
// screen, /create-password and Settings → Security can never drift.
// =====================================================================
import { useId, useState } from "react";
import { Check, Eye, EyeOff, Info, KeyRound, Lock, X } from "lucide-react";

import { PASSWORD_RULES, passwordTier } from "@/lib/auth/password";
import { cn } from "@/lib/utils";

type Props = {
  password: string;
  onPasswordChange: (value: string) => void;
  confirm: string;
  onConfirmChange: (value: string) => void;
  disabled?: boolean;
  /** Product name shown in the heading. */
  brand?: string;
};

export function CreatePasswordSection({
  password,
  onPasswordChange,
  confirm,
  onConfirmChange,
  disabled,
  brand = "ChessOX",
}: Props) {
  const pwId = useId();
  const confirmId = useId();
  const rulesId = `${pwId}-rules`;

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const tier = passwordTier(password);
  const touched = password.length > 0;
  const mismatch = confirm.length > 0 && password !== confirm;
  const matches = confirm.length > 0 && password === confirm;

  return (
    <section className="rounded-xl border border-gold/15 bg-black/30 p-4 sm:p-5">
      <header className="mb-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-gold">
          <KeyRound className="h-4 w-4" />
          Create {brand} Password <span className="text-foreground/50">(Optional)</span>
        </h2>
        <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/60">
          This password allows you to log in using Email + Password in addition to Google Sign-In.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PasswordInput
          id={pwId}
          label="Password"
          value={password}
          onChange={onPasswordChange}
          reveal={showPassword}
          onToggleReveal={() => setShowPassword((v) => !v)}
          disabled={disabled}
          describedBy={rulesId}
          autoComplete="new-password"
        />
        <PasswordInput
          id={confirmId}
          label="Confirm Password"
          value={confirm}
          onChange={onConfirmChange}
          reveal={showConfirm}
          onToggleReveal={() => setShowConfirm((v) => !v)}
          disabled={disabled}
          invalid={mismatch}
          autoComplete="new-password"
        />
      </div>

      {/* Strength meter — three tiers, matching the checklist below. */}
      {touched && (
        <div className="mt-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-300",
                  i <= tier.level ? tier.barClass : "bg-white/10",
                )}
              />
            ))}
          </div>
          <p className={cn("mt-1.5 text-[11px] font-medium", tier.textClass)} aria-live="polite">
            Password strength: {tier.label}
          </p>
        </div>
      )}

      {/* Live validation — every rule, updating as they type. */}
      {touched && (
        <ul id={rulesId} className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(password);
            return (
              <li
                key={rule.key}
                className={cn(
                  "flex items-center gap-1.5 text-[11px]",
                  met ? "text-emerald-400" : "text-foreground/50",
                )}
              >
                {met ? (
                  <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                ) : (
                  <X className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
                )}
                {rule.label}
              </li>
            );
          })}
        </ul>
      )}

      {mismatch && (
        <p role="alert" className="mt-2.5 flex items-center gap-1.5 text-[11px] text-red-400">
          <X className="h-3 w-3 shrink-0" aria-hidden="true" />
          Passwords do not match.
        </p>
      )}
      {matches && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-emerald-400">
          <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
          Passwords match.
        </p>
      )}

      {/* Friendly, non-alarming reminder. */}
      <div className="mt-4 flex gap-2.5 rounded-lg border border-gold/20 bg-gold/[0.06] p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold/80" aria-hidden="true" />
        <p className="text-[11px] leading-relaxed text-foreground/70">
          Remember this password carefully. You will need this password whenever you sign in using
          Email &amp; Password or when changing your password in the future.
        </p>
      </div>
    </section>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  reveal,
  onToggleReveal,
  disabled,
  invalid,
  describedBy,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  reveal: boolean;
  onToggleReveal: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-medium uppercase tracking-wider text-foreground/70"
      >
        {label}
      </label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40"
          aria-hidden="true"
        />
        <input
          id={id}
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          placeholder="••••••••"
          className={cn(
            "w-full rounded-xl border bg-black/40 py-2.5 pl-9 pr-10 text-sm text-ivory outline-none transition-colors placeholder:text-foreground/30 focus:ring-1 focus:ring-gold/40 disabled:opacity-50",
            invalid
              ? "border-red-500/60 focus:border-red-500/60"
              : "border-gold/15 focus:border-gold/40",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggleReveal}
          aria-label={reveal ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-foreground/40 transition-colors hover:text-gold"
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
