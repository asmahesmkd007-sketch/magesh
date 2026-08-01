// =====================================================================
// BEARER IDENTITY — transport-agnostic token verification
// ---------------------------------------------------------------------
// The verification itself, with no framework coupling: an HTTP server
// function reaches it through `requireUserId` (which adds the TanStack
// middleware wrapper), and the Socket.IO handshake calls `resolveUserId`
// directly. Same tokens, same cache, same rules — authentication did not
// change when the transport did.
//
// Split out of requireUser.server.ts because that module imports
// `@tanstack/react-start`, which drags the entire Start server core into
// anything that touches it — including the standalone realtime bundle,
// where it cannot resolve.
//
//   * verification is unchanged — a cache miss asks the Supabase Auth
//     API, and an invalid token is rejected there;
//   * an entry never outlives the token's own `exp`, and never lives
//     longer than IDENTITY_TTL_MS regardless;
//   * the `exp` claim is read *only* to shorten a TTL. It is never used
//     to authorize anything, so parsing it without verifying the
//     signature cannot grant access.
//
// Authorization is not cached — only identity. Ban/suspension checks
// still read the database per action.
// =====================================================================
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

const IDENTITY_TTL_MS = 30_000;
/** Bounded so a token-rotating client can't grow this without limit. */
const IDENTITY_CACHE_MAX = 5_000;

type CachedIdentity = { userId: string; expiresAt: number };
const identityCache = new Map<string, CachedIdentity>();

let authClient: SupabaseClient<Database> | undefined;

function getAuthClient(): SupabaseClient<Database> {
  if (authClient) return authClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const missing = [
      ...(!url ? ["SUPABASE_URL"] : []),
      ...(!key ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(
      `Missing Supabase environment variable(s): ${missing.join(", ")}. Set these in your environment configuration.`,
    );
  }
  // One client for the whole process. The token is passed to getUser()
  // explicitly, so nothing here is per-user.
  authClient = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  return authClient;
}

/** The `exp` claim in ms, or null. Used only to shorten a cache TTL. */
function tokenExpiryMs(token: string): number | null {
  const segment = token.split(".")[1];
  if (!segment) return null;
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the caller's id from their bearer token, reusing a recent
 * verification of the same token when there is one.
 */
export async function resolveUserId(token: string, now: number = Date.now()): Promise<string> {
  const cached = identityCache.get(token);
  if (cached && cached.expiresAt > now) return cached.userId;

  const {
    data: { user },
    error,
  } = await getAuthClient().auth.getUser(token);
  if (error || !user) {
    identityCache.delete(token);
    throw new Error("Unauthorized: Invalid token");
  }

  const exp = tokenExpiryMs(token);
  const expiresAt = Math.min(now + IDENTITY_TTL_MS, exp ?? Number.POSITIVE_INFINITY);
  if (expiresAt > now) {
    if (identityCache.size >= IDENTITY_CACHE_MAX) identityCache.clear();
    identityCache.set(token, { userId: user.id, expiresAt });
  }
  return user.id;
}

/** Drop expired entries so the map tracks live sessions, not history. */
function sweep() {
  const now = Date.now();
  for (const [token, entry] of identityCache)
    if (now >= entry.expiresAt) identityCache.delete(token);
}
setInterval(sweep, 60_000).unref?.();

/** Test seam — the cache is process-global and otherwise unreachable. */
export function __clearIdentityCache() {
  identityCache.clear();
}
