// =====================================================================
// Password recovery decision rules
// ---------------------------------------------------------------------
// The decision "what should a reset request for this address actually
// do?" pulled out of the server handler so it can be unit-tested without
// a database or a mail provider. passwordReset.functions.ts owns the I/O;
// this owns the rules.
//
// All three outcomes look identical to the caller — the HTTP response is
// uniform either way — so this classification only ever decides which
// email (if any) the inbox owner receives.
// =====================================================================

export type AccountFacts = {
  /** Does an auth user hold this address? */
  exists: boolean;
  /** Is there a password to replace (auth.users.encrypted_password set)? */
  hasPassword: boolean;
  /** Linked auth providers, e.g. ["google"] or ["email", "google"]. */
  identities: string[];
};

export type RecoveryOutcome =
  /** Mint a Supabase recovery token and email the reset link. */
  | "send_link"
  /** Tell the owner their account signs in with Google instead. */
  | "google_notice"
  /** No account here: send nothing, and say nothing different. */
  | "silent";

export function classifyRecovery(facts: AccountFacts): RecoveryOutcome {
  if (!facts.exists) return "silent";

  // A Google account with no password has nothing to reset. Minting one
  // would fork a single identity into two ways to sign in, which the rest
  // of the app (SECTION 105.4, registerAccount's provider check) treats as
  // a conflict rather than a feature.
  //
  // Note the order: an account with BOTH a Google identity and a password
  // gets the link, because the password it has is real and resettable.
  if (!facts.hasPassword && facts.identities.includes("google")) return "google_notice";

  // Anything else — a normal email account, or an edge case with neither a
  // password nor a recognised federated identity — gets the reset link.
  // Supabase Auth is the authority on whether the token it mints is
  // redeemable, so a wrong guess here fails closed at redemption rather
  // than handing anyone access.
  return "send_link";
}
