// =====================================================================
// PUBLIC ORIGIN FOR LINKS IN EMAILS (server only)
// ---------------------------------------------------------------------
// Every emailed link (registration verification, password recovery) has
// to be absolute, so it needs to know the site's public origin. There
// used to be one copy of this per flow; a link pointing at localhost in
// production is exactly the class of bug that a second copy causes, so
// there is now one definition.
//
// Precedence is deliberate: explicit configuration wins, and the
// request's own origin is only a fallback so preview deployments produce
// working links without extra config.
// =====================================================================
import { getRequest } from "@tanstack/react-start/server";

/** Last-resort default — used only when there is no config and no request. */
const FALLBACK_ORIGIN = "https://www.chessox.com";

export function siteOrigin(): string {
  const configured =
    process.env.PUBLIC_SITE_URL || process.env.SITE_URL || process.env.VITE_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  try {
    const req = getRequest();
    const origin = req?.headers?.get("origin");
    if (origin) return origin.replace(/\/+$/, "");
    const host = req?.headers?.get("host");
    if (host) {
      const proto = req?.headers?.get("x-forwarded-proto") ?? "https";
      return `${proto}://${host}`;
    }
  } catch {
    /* not in a request context */
  }
  return FALLBACK_ORIGIN;
}
