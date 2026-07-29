// =====================================================================
// Verification token state machine
// ---------------------------------------------------------------------
// The decision "what does this verification link mean right now?" pulled
// out of the server handler so it can be unit-tested without a database.
// registration.functions.ts owns the I/O; this owns the rules.
//
// Order matters. A consumed link is reported as already-verified even if
// its window has since lapsed, because "you already did this" is more
// useful to the reader than "that expired".
// =====================================================================

export type PendingState = {
  /** Did a registration match the presented token digest? */
  found: boolean;
  status: "pending_verification" | "email_verified" | "completed";
  /** Set the first time the link was used; enforces single use. */
  tokenConsumedAt: string | null;
  tokenExpiresAt: string | null;
};

export type VerificationOutcome = "verify" | "invalid" | "expired" | "already_verified";

export function classifyVerification(
  state: PendingState,
  now: number = Date.now(),
): VerificationOutcome {
  if (!state.found) return "invalid";

  // Setup finished — nothing left for this link to do.
  if (state.status === "completed") return "already_verified";

  // Single use: one link issues exactly one setup grant.
  if (state.tokenConsumedAt) return "already_verified";

  if (!state.tokenExpiresAt || new Date(state.tokenExpiresAt).getTime() < now) return "expired";

  return "verify";
}
