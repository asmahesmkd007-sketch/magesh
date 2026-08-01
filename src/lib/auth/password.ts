// =====================================================================
// Password policy — one definition, used everywhere
// ---------------------------------------------------------------------
// The same rules apply at registration (create password), at reset, and
// on the server. Before this module each of those places carried its own
// copy of the regexes; they are now imported from here so a policy change
// cannot land in one screen and miss another.
//
// The server re-validates with `passwordSchema` on every write — client
// checks are for feedback only and are never trusted.
// =====================================================================
import { z } from "zod";

/** Longest password bcrypt (used by Supabase Auth) actually hashes. */
export const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_MIN_LENGTH = 8;

const SPECIAL_CHARS = /[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?`~]/;

export type PasswordRule = {
  key: string;
  label: string;
  test: (password: string) => boolean;
};

/** Checklist shown live under the password field. */
export const PASSWORD_RULES: PasswordRule[] = [
  {
    key: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  { key: "upper", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "number", label: "One number", test: (p) => /\d/.test(p) },
  { key: "special", label: "One special character", test: (p) => SPECIAL_CHARS.test(p) },
];

export function passwordMeetsPolicy(password: string): boolean {
  return (
    password.length <= PASSWORD_MAX_LENGTH && PASSWORD_RULES.every((rule) => rule.test(password))
  );
}

/** Which rules a password currently fails (for inline feedback). */
export function failedPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password));
}

/** Server-side schema. Message order matches the checklist above. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/[a-z]/, "Password needs a lowercase letter")
  .regex(/\d/, "Password needs a number")
  .regex(SPECIAL_CHARS, "Password needs a special character");

// ── Shared account field schemas ─────────────────────────────────────

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/**
 * Username Policy:
 * Exactly 11 characters: 8 letters + 1 special char (_ or .) + 2 digits
 * Example: chessfox_42, royalking.18, knightop_91
 */
export const USERNAME_11_REGEX = /^[a-zA-Z]{8}[_.][0-9]{2}$/;
export const USERNAME_EDITABLE_REGEX = /^[a-zA-Z0-9_.]{11}$/;

export function generate11CharUsername(seedName?: string): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let base = (seedName || "").toLowerCase().replace(/[^a-z]/g, "");
  base = base.slice(0, 8);
  while (base.length < 8) {
    base += letters[Math.floor(Math.random() * 26)];
  }
  const separator = Math.random() < 0.5 ? "_" : ".";
  const num = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");
  return `${base}${separator}${num}`;
}

export function isValidUsernameFormat(username: string): boolean {
  if (username.length !== 11) return false;
  if (!USERNAME_EDITABLE_REGEX.test(username)) return false;
  // Must contain at least one '_' or '.'
  return username.includes("_") || username.includes(".");
}

export const usernameSchema = z
  .string()
  .trim()
  .length(11, "Username must be exactly 11 characters")
  .refine(
    (val) => isValidUsernameFormat(val),
    "Username must be 11 characters with letters, digits and '_' or '.' (e.g. chessfox_42)",
  );

export const USERNAME_REGEX = /^[a-zA-Z0-9_.]{11}$/;

// ── Strength meter ───────────────────────────────────────────────────

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string; className: string };

/**
 * Coarse strength indicator. Deliberately simple and honest: it scores
 * the policy rules met plus a length bonus, so it can never tell a user
 * a policy-failing password is "strong".
 */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "", className: "bg-white/10" };

  const met = PASSWORD_RULES.filter((r) => r.test(password)).length;
  let score = Math.max(0, met - 1); // 5 rules → 0..4
  if (password.length >= 16 && met === PASSWORD_RULES.length) score = 4;
  else if (score === 4 && password.length < 12) score = 3;

  const table: PasswordStrength[] = [
    { score: 0, label: "Very weak", className: "bg-red-500" },
    { score: 1, label: "Weak", className: "bg-orange-500" },
    { score: 2, label: "Fair", className: "bg-yellow-500" },
    { score: 3, label: "Strong", className: "bg-emerald-500" },
    { score: 4, label: "Very strong", className: "bg-emerald-400" },
  ];
  return table[score as 0 | 1 | 2 | 3 | 4];
}
