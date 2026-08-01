// =====================================================================
// BEARER IDENTITY MIDDLEWARE (HTTP server functions)
// ---------------------------------------------------------------------
// `requireSupabaseAuth` (src/integrations/supabase/auth-middleware.ts) is
// the general-purpose gate: it builds a fresh user-scoped Supabase client
// per request and calls `auth.getUser(token)`, which is a network call to
// the Supabase Auth API. That is the right shape for a handler that then
// goes on to use the user-scoped client — but on the move path it means
// every request pays a full extra round-trip before the work even starts.
//
// The verification itself lives in verifyToken.server.ts, framework-free,
// so the Socket.IO handshake can share the exact same code and cache.
// This module is only the TanStack middleware wrapper around it.
// =====================================================================
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { resolveUserId } from "./verifyToken.server";

export { resolveUserId, __clearIdentityCache } from "./verifyToken.server";

function bearerToken(): string {
  const request = getRequest();
  if (!request?.headers) throw new Error("Unauthorized: No request headers available");
  const header = request.headers.get("authorization");
  if (!header) throw new Error("Unauthorized: No authorization header provided");
  if (!header.startsWith("Bearer "))
    throw new Error("Unauthorized: Only Bearer tokens are supported");
  const token = header.slice("Bearer ".length);
  if (!token) throw new Error("Unauthorized: No token provided");
  return token;
}

/**
 * Latency-sensitive sibling of `requireSupabaseAuth`. Provides `userId`
 * and the raw `token`; handlers that need a user-scoped Supabase client
 * should keep using `requireSupabaseAuth` instead.
 */
export const requireUserId = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const token = bearerToken();
  const userId = await resolveUserId(token);
  return next({ context: { userId, token } });
});
