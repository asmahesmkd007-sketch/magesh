// =====================================================================
// PasswordFields — password + confirm, with live policy feedback
// ---------------------------------------------------------------------
// Shared by the create-password (registration) and reset-password
// (forgot) flows so both enforce and *display* exactly the same policy.
// All rules come from lib/auth/password.ts.
// =====================================================================
import { useId, useState } from "react";
import { Check, Eye, EyeOff, Lock, X } from "lucide-react";

import { PASSWORD_RULES, passwordStrength } from "@/lib/auth/password";

type Props = {
  password: string;
  onPasswordChange: (value: string) => void;
  confirm: string;
  onConfirmChange: (value: string) => void;
  disabled?: boolean;
  /** Submit on Enter from either field. */
  onSubmit?: () => void;
  autoFocus?: boolean;
};

export function PasswordFields({
  password,
  onPasswordChange,
  confirm,
  onConfirmChange,
  disabled,
  onSubmit,
  autoFocus,
}: Props) {
  const [reveal, setReveal] = useState(false);
  const pwId = useId();
  const confirmId = useId();

  const strength = passwordStrength(password);
  const mismatch = confirm.length > 0 && password !== confirm;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && onSubmit) onSubmit();
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={pwId} className="mb-1 block text-xs text-muted-foreground">
          New password
        </label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={pwId}
            type={reveal ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onKeyDown={onKey}
            disabled={disabled}
            autoFocus={autoFocus}
            autoComplete="new-password"
            aria-describedby={`${pwId}-rules`}
            className="w-full rounded-lg border border-gold/20 bg-white/[0.03] py-2.5 pl-9 pr-10 text-sm outline-none transition-colors focus:border-gold/60 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground transition-colors hover:text-gold"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Strength meter */}
        {password.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-300 ${strength.className}`}
                style={{ width: `${((strength.score + 1) / 5) * 100}%` }}
              />
            </div>
            <span className="w-20 text-right text-[10px] text-muted-foreground">
              {strength.label}
            </span>
          </div>
        )}
      </div>

      {/* Live policy checklist */}
      {password.length > 0 && (
        <ul id={`${pwId}-rules`} className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(password);
            return (
              <li
                key={rule.key}
                className={`flex items-center gap-1.5 text-[11px] ${
                  met ? "text-emerald-400" : "text-muted-foreground"
                }`}
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

      <div>
        <label htmlFor={confirmId} className="mb-1 block text-xs text-muted-foreground">
          Confirm password
        </label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={confirmId}
            type={reveal ? "text" : "password"}
            value={confirm}
            onChange={(e) => onConfirmChange(e.target.value)}
            onKeyDown={onKey}
            disabled={disabled}
            autoComplete="new-password"
            aria-invalid={mismatch}
            className={`w-full rounded-lg border bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm outline-none transition-colors disabled:opacity-50 ${
              mismatch ? "border-red-500/60" : "border-gold/20 focus:border-gold/60"
            }`}
          />
        </div>
        {mismatch && (
          <p role="alert" className="mt-1 text-[11px] text-red-400">
            Passwords do not match.
          </p>
        )}
      </div>
    </div>
  );
}
