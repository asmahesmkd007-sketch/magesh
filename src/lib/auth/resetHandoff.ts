// =====================================================================
// Password-reset handoff
// ---------------------------------------------------------------------
// Carries two things between the three steps of the OTP reset flow:
//   /forgot-password  -> /verify-reset-otp    the address being reset
//   /verify-reset-otp -> /reset-password      the single-use reset grant
//
// Both travel in sessionStorage rather than the URL, for the same reason
// the registration setup grant does (see setupHandoff.ts): a value in a
// query string leaks into browser history, the Referer header of any
// outbound link, and most server access logs. sessionStorage is scoped to
// the tab and cleared when it closes — deliberately NOT localStorage,
// which would outlive the tab and sit on disk.
//
// The grant is validated and consumed server-side regardless, so losing
// this value is an inconvenience, never a security hole. The OTP itself
// is never stored here — or anywhere else on the client.
// =====================================================================

const EMAIL_KEY = "chessox-reset-email";
const AUTH_KEY = "chessox-reset-grant";

function read(key: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode / quota — the flow degrades to "start again" */
  }
}

function drop(key: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* nothing to clean up */
  }
}

// ── The address under reset (not secret, but not URL material either) ──

/**
 * The address, plus WHEN its code was sent. Both countdowns on the verify
 * page derive from that one number — the code expires `OTP_TTL_MS` after
 * it was sent and the resend unlocks `RESEND_COOLDOWN_MS` after it was
 * sent — so carrying the send time keeps them accurate across a refresh
 * and after a cooldown reply, instead of the page assuming "just now".
 */
export type ResetRequest = { email: string; sentAt: number };

export function writeResetRequest(req: ResetRequest): void {
  write(EMAIL_KEY, JSON.stringify(req));
}

export function readResetRequest(): ResetRequest | null {
  const raw = read(EMAIL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ResetRequest>;
    if (typeof parsed.email !== "string" || !parsed.email.includes("@")) return null;
    const sentAt = typeof parsed.sentAt === "number" ? parsed.sentAt : Date.now();
    return { email: parsed.email, sentAt };
  } catch {
    return null;
  }
}

// ── The post-OTP grant ────────────────────────────────────────────────

export type ResetGrant = { resetAuth: string; email: string };

export function writeResetGrant(grant: ResetGrant): void {
  write(AUTH_KEY, JSON.stringify(grant));
}

export function readResetGrant(): ResetGrant | null {
  const raw = read(AUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ResetGrant>;
    if (typeof parsed.resetAuth !== "string" || typeof parsed.email !== "string") return null;
    if (!parsed.resetAuth) return null;
    return { resetAuth: parsed.resetAuth, email: parsed.email };
  } catch {
    return null;
  }
}

export function clearResetGrant(): void {
  drop(AUTH_KEY);
}

/** Wipe every trace of the flow — on success, or when starting over. */
export function clearResetHandoff(): void {
  drop(AUTH_KEY);
  drop(EMAIL_KEY);
}
