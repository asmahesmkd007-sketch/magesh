// =====================================================================
// SINGLE-DEVICE SESSION LOCKING UTILITIES & CONFIGURATION
// ---------------------------------------------------------------------
// Enforces single active session/device per user account.
// Heartbeat interval: 25 seconds
// Session timeout: 90 seconds
// =====================================================================

export const SESSION_TIMEOUT_SECONDS = 90;
export const HEARTBEAT_INTERVAL_MS = 25_000;

const DEVICE_ID_KEY = "chess_device_id";
const SESSION_ID_KEY = "chess_session_id";

/**
 * Returns a stable random device identifier per browser/client instance.
 * Stored in localStorage so it persists across tab closes on the same device.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return "srv_device_id";
  }
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev_${Math.random().toString(36).substring(2)}${Date.now()}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Returns the active session identifier.
 * Stored in sessionStorage so a fresh session identity is minted per login/browser instance.
 */
export function getSessionId(): string {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return "srv_session_id";
  }
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `sess_${Math.random().toString(36).substring(2)}${Date.now()}`;
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Generates and saves a new session identifier (e.g. on fresh login).
 */
export function resetSessionId(): string {
  const newSessionId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `sess_${Math.random().toString(36).substring(2)}${Date.now()}`;
  if (typeof window !== "undefined" && window.sessionStorage) {
    sessionStorage.setItem(SESSION_ID_KEY, newSessionId);
  }
  return newSessionId;
}

/**
 * Clears the active session identifier (on logout).
 */
export function clearSessionId(): void {
  if (typeof window !== "undefined" && window.sessionStorage) {
    sessionStorage.removeItem(SESSION_ID_KEY);
  }
}

// ── Recovery exemption ───────────────────────────────────────────────
// A password-recovery session is not a login: it is established by
// opening an emailed link, so it never goes through acquire_user_session
// and holds no claim on `user_sessions`.
//
// Left to itself the heartbeat treats that as a stolen session. Anyone
// with a lingering active row — which is everyone who has ever signed in
// and closed the browser without signing out, since the row is only
// deactivated on an explicit sign-out — gets `SESSION_INVALIDATED` on the
// first pulse, and the reset page force-signs-them-out and redirects to
// /auth within one heartbeat interval. The recovery link is single-use and
// already consumed by then, so the reset becomes unfinishable.
//
// The reset page therefore suppresses the lock for as long as it is open.
// Suppression is scoped to that page and to this tab: it exempts the
// recovery session from single-device enforcement without weakening it for
// real logins, which still acquire and heartbeat exactly as before.

let sessionLockSuppressed = false;

/** Called by /reset-password while a recovery session is in play. */
export function suppressSessionLock(): void {
  sessionLockSuppressed = true;
}

/** Called when leaving /reset-password, restoring normal enforcement. */
export function releaseSessionLockSuppression(): void {
  sessionLockSuppressed = false;
}

export function isSessionLockSuppressed(): boolean {
  return sessionLockSuppressed;
}
