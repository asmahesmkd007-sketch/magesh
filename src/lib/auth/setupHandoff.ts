// =====================================================================
// Password-setup handoff
// ---------------------------------------------------------------------
// Carries the short-lived setup grant from the verification page to the
// create-password page.
//
// It travels in sessionStorage rather than the URL on purpose: a token in
// a query string leaks into browser history, the Referer header of any
// outbound link, and most server access logs. sessionStorage is scoped to
// the tab and cleared when it closes.
//
// The grant is still validated (and consumed) server-side — losing this
// value is an inconvenience, never a security hole.
// =====================================================================

export const SETUP_TOKEN_KEY = "chessox-setup-grant";

export type SetupHandoff = {
  setupToken: string;
  email: string;
  username: string;
};

export function readSetupHandoff(): SetupHandoff | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SETUP_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SetupHandoff>;
    if (
      typeof parsed.setupToken !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.username !== "string"
    ) {
      return null;
    }
    return { setupToken: parsed.setupToken, email: parsed.email, username: parsed.username };
  } catch {
    return null;
  }
}

export function clearSetupHandoff(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SETUP_TOKEN_KEY);
  } catch {
    /* nothing to clean up */
  }
}
