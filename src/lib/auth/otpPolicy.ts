// =====================================================================
// Password-reset OTP state machine
// ---------------------------------------------------------------------
// "What does this code mean right now?" pulled out of the server handler
// so it can be unit-tested without a database, a clock or a mailer.
// passwordReset.functions.ts owns the I/O; this owns the rules.
//
// Order matters, and it is the security-conservative order: a row that is
// consumed, expired or out of attempts is rejected BEFORE the digest is
// compared, so a spent code can never be revived by guessing it right.
// =====================================================================

/** 6 digits, 5 minutes, 5 wrong guesses. */
export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
/** Resend spacing. Recorded only after an email is actually accepted. */
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** The post-verification authorisation is deliberately much shorter-lived. */
export const RESET_AUTH_TTL_MS = 10 * 60 * 1000;

export type OtpRow = {
  expiresAt: string | number | Date;
  attempts: number;
  maxAttempts: number;
  consumedAt: string | number | Date | null;
};

export type OtpOutcome =
  /** Row is live — the caller may now compare digests. */
  | "check"
  /** No row at all: nothing was ever requested for this address. */
  | "no_otp"
  | "otp_expired"
  | "otp_consumed"
  | "too_many_attempts";

const ms = (v: string | number | Date): number =>
  v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime();

/**
 * Whether the stored code is still eligible to be compared. Returning
 * "check" is NOT "the code is right" — it only means the row has not been
 * disqualified on lifecycle grounds.
 */
export function classifyOtp(row: OtpRow | null, now: number = Date.now()): OtpOutcome {
  if (!row) return "no_otp";

  // Single use. Checked first so a consumed code reads as consumed even
  // once its window has also lapsed — and can never be verified twice.
  if (row.consumedAt) return "otp_consumed";

  // Brute-force cap. Also checked before expiry: a row that burnt its
  // attempts is dead on those grounds regardless of the clock.
  if (row.attempts >= row.maxAttempts) return "too_many_attempts";

  if (!row.expiresAt || ms(row.expiresAt) <= now) return "otp_expired";

  return "check";
}

/**
 * What a wrong guess leaves behind. Exhausting the last attempt kills the
 * row outright rather than leaving it guessable one more time.
 */
export function afterFailedAttempt(row: Pick<OtpRow, "attempts" | "maxAttempts">): {
  attempts: number;
  exhausted: boolean;
} {
  const attempts = row.attempts + 1;
  return { attempts, exhausted: attempts >= row.maxAttempts };
}

export type ResetAuthRow = {
  authExpiresAt: string | number | Date | null;
  consumedAt: string | number | Date | null;
};

export type ResetAuthOutcome = "valid" | "auth_invalid" | "auth_expired";

/**
 * Whether a post-OTP reset authorisation may still be spent.
 *
 * `consumedAt` is set when the OTP is verified, so — unlike the OTP rules
 * above — a consumed row is exactly what this expects to see. What makes
 * the authorisation single-use is `authExpiresAt`/`auth_hash` being
 * cleared as the password is written, which turns a replay into a lookup
 * miss (`auth_invalid`) rather than a second successful reset.
 */
export function classifyResetAuth(
  row: ResetAuthRow | null,
  now: number = Date.now(),
): ResetAuthOutcome {
  if (!row || !row.authExpiresAt) return "auth_invalid";
  if (ms(row.authExpiresAt) <= now) return "auth_expired";
  return "valid";
}

/** Milliseconds left on the resend cooldown; 0 when a resend is allowed. */
export function cooldownLeftMs(
  lastSentAt: string | number | Date | null | undefined,
  now: number = Date.now(),
  windowMs: number = RESEND_COOLDOWN_MS,
): number {
  if (!lastSentAt) return 0;
  const left = ms(lastSentAt) + windowMs - now;
  return left > 0 ? left : 0;
}

/** Whether a string is exactly the OTP shape: 6 ASCII digits, nothing else. */
export function isWellFormedOtp(value: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(value);
}

/**
 * When a code was sent, worked backwards from the cooldown the server says
 * is left on it.
 *
 * The cooldown and the code's own lifetime both start at the same instant,
 * so this one number positions BOTH countdowns on the verify page. Without
 * it a client that arrives on a cooldown reply — or simply reloads — would
 * restart the clock and promise time the code does not have.
 */
export function sentAtFromCooldown(
  resendInSeconds: number,
  now: number = Date.now(),
  windowMs: number = RESEND_COOLDOWN_MS,
): number {
  const elapsed = windowMs - resendInSeconds * 1000;
  // A nonsensical value from the wire must never place the send in the
  // future (which would inflate the expiry) or absurdly far in the past.
  return now - Math.min(Math.max(elapsed, 0), windowMs);
}
