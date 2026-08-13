// =====================================================================
// PASSWORD RECOVERY — EMAIL OTP (server functions)
// ---------------------------------------------------------------------
//   requestPasswordResetOtp   email          -> 6-digit code, emailed
//   verifyPasswordResetOtp    email + code   -> single-use reset grant
//   resetPasswordWithAuth     grant + pw     -> password written, sessions cut
//
// Supabase Auth is NOT asked to send anything. Its recovery mailer has
// never been configured on this project, and every other ChessOx email
// already goes out through email.server.ts — this flow uses the same
// sender. Supabase remains the owner of the password hash itself: the new
// password is written through the Auth admin API and nowhere else.
//
// Nothing here is a clickable link. The code is typed back into the site,
// so no secret ever travels in a URL, browser history, a Referer header
// or a proxy log.
//
// Security model
//  • The code is 6 digits from crypto.randomInt (rejection-sampled, so
//    every code is equally likely) and only its HMAC-SHA256 digest is
//    stored. A bare hash of a 6-digit number is trivially reversed from a
//    database leak; the server-side pepper is what makes the digest
//    useless on its own.
//  • The code is never logged, never returned, never put in a URL and
//    never written to client storage.
//  • One row per email, so issuing a code atomically invalidates the
//    previous one. Consumed / expired / attempt-exhausted rows are
//    rejected before the digest is compared.
//  • Digest comparison is constant-time.
//  • Registered, unregistered and Google addresses get identical public
//    responses, and every path is padded to the same floor so response
//    TIME cannot be used to enumerate accounts either.
//  • The resend cooldown lives in the database (server-authoritative,
//    survives restarts and multiple instances) and is recorded only after
//    a provider has accepted the message — a delivery failure leaves the
//    user free to retry immediately.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import crypto from "node:crypto";
import { z } from "zod";

import { emailSchema, passwordSchema } from "@/lib/auth/password";
import {
  afterFailedAttempt,
  classifyOtp,
  classifyResetAuth,
  cooldownLeftMs,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  RESET_AUTH_TTL_MS,
} from "@/lib/auth/otpPolicy";
import { classifyRecovery } from "@/lib/auth/recoveryPolicy";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

import {
  EmailDeliveryError,
  passwordResetGoogleEmail,
  passwordResetOtpEmail,
  sendMail,
} from "./email.server";
import { siteOrigin } from "./siteOrigin.server";

const RESEND_COOLDOWN_SECS = RESEND_COOLDOWN_MS / 1000;

/**
 * Every public path is padded out to this floor. Sending an email takes
 * hundreds of milliseconds and skipping it takes none, so without the pad
 * an attacker could tell a registered address from an unknown one purely
 * by how fast the endpoint answers.
 */
const MIN_RESPONSE_MS = 700;

// ── Result types (see the API contract in docs/AUTH.md) ──────────────

export type RequestOtpResult =
  | { ok: true; resendInSeconds: number }
  | { ok: false; reason: "cooldown"; resendInSeconds: number }
  | { ok: false; reason: "delivery_failed" };

export type VerifyOtpResult =
  | { ok: true; resetAuth: string; email: string }
  | { ok: false; reason: "invalid_otp"; attemptsLeft: number }
  | { ok: false; reason: "otp_expired" }
  | { ok: false; reason: "too_many_attempts" };

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; reason: "auth_invalid" }
  | { ok: false; reason: "auth_expired" }
  | { ok: false; reason: "weak_password"; message: string };

// ── Helpers ──────────────────────────────────────────────────────────

function getClientIp(): string {
  try {
    const req = getRequest();
    const fwd = req?.headers?.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    return req?.headers?.get("x-real-ip") ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Hold the response until `MIN_RESPONSE_MS` has passed since `startedAt`. */
async function pad<T>(startedAt: number, value: T): Promise<T> {
  const left = MIN_RESPONSE_MS - (Date.now() - startedAt);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  return value;
}

/**
 * A uniformly distributed 6-digit code. `crypto.randomInt` rejection-samples
 * internally, so unlike `randomBytes % 1_000_000` no value is more likely
 * than any other.
 */
function generateOtp(): string {
  return crypto
    .randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");
}

/**
 * The pepper. Without it the stored digest of a 6-digit code is reversible
 * by trying all million values against a leaked table.
 */
function otpPepper(): string {
  const secret = process.env.OTP_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      "Email OTP is not configured: set OTP_HASH_SECRET (or SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return secret;
}

function hashOtp(otp: string, email: string): string {
  // The address is bound into the digest, so a row's hash cannot be lifted
  // and replayed against a different address.
  return crypto.createHmac("sha256", otpPepper()).update(`${email}:${otp}`).digest("hex");
}

/** Constant-time digest comparison — never `===` on a secret. */
function digestsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function generateResetAuth(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashResetAuth(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

type OtpRowDb = {
  email: string;
  user_id: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  max_attempts: number;
  consumed_at: string | null;
  auth_hash: string | null;
  auth_expires_at: string | null;
  last_sent_at: string;
};

// The generated Database types don't include password_reset_otps (this
// repo's types.ts is known to drift from the live schema — see the note in
// schema.sql SECTION 78). Same escape hatch the rest of the service layer
// uses.
type LooseDb = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{ data: OtpRowDb | null; error: unknown }>;
      };
    };
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => Promise<{ error: unknown }>;
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
    delete: () => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

async function db(): Promise<{
  admin: typeof import("@/integrations/supabase/client.server").supabaseAdmin;
  loose: LooseDb;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { admin: supabaseAdmin, loose: supabaseAdmin as unknown as LooseDb };
}

/** Provider/password facts for an address, via the SECTION 105.4 helper. */
async function lookupAccount(
  loose: LooseDb,
  admin: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  email: string,
): Promise<{ exists: boolean; hasPassword: boolean; identities: string[]; userId: string | null }> {
  try {
    const { data, error } = await loose.rpc("account_for_email", { p_email: email });
    if (!error && data && typeof data === "object") {
      const obj = data as {
        exists?: boolean;
        user_id?: string;
        has_password?: boolean;
        identities?: string[] | null;
      };
      return {
        exists: !!obj.exists,
        hasPassword: !!obj.has_password,
        identities: obj.identities ?? [],
        userId: obj.user_id ?? null,
      };
    }
  } catch {
    /* fall through to the admin API */
  }

  try {
    const { data } = await admin.auth.admin.listUsers();
    const user = data?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!user) return { exists: false, hasPassword: false, identities: [], userId: null };
    return {
      exists: true,
      hasPassword: !!user.identities?.some((i) => i.provider === "email"),
      identities: user.identities?.map((i) => i.provider) ?? [],
      userId: user.id,
    };
  } catch (err) {
    logger.error("password reset account lookup failed", { email, error: err });
    return { exists: false, hasPassword: false, identities: [], userId: null };
  }
}

async function loadOtpRow(loose: LooseDb, email: string): Promise<OtpRowDb | null> {
  const { data } = await loose
    .from("password_reset_otps")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  return data ?? null;
}

// ── 1. Request a code ────────────────────────────────────────────────

export const requestPasswordResetOtp = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: emailSchema }))
  .handler(async ({ data }): Promise<RequestOtpResult> => {
    // emailSchema already trimmed and lower-cased it.
    const { email } = data;
    const ip = getClientIp();
    const startedAt = Date.now();

    // Authenticated Session Requirement:
    // Extract Authorization header or Supabase auth session token from incoming request
    const req = getRequest();
    const authHeader = req?.headers?.get("authorization") || req?.headers?.get("Authorization");
    const authCookie = req?.headers?.get("cookie");
    let authToken = "";

    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      authToken = authHeader.substring(7).trim();
    } else if (authCookie) {
      const match = authCookie.match(/sb-[a-z0-9]+-auth-token=([^;]+)/i);
      if (match) {
        try {
          const parsed = JSON.parse(decodeURIComponent(match[1]));
          if (Array.isArray(parsed) && parsed[0]) {
            authToken = parsed[0];
          } else if (parsed?.access_token) {
            authToken = parsed.access_token;
          }
        } catch {
          /* invalid cookie JSON format */
        }
      }
    }

    const { admin, loose } = await db();

    if (!authToken) {
      throw new Error("Please sign in first to reset your password.");
    }

    const { data: userData, error: userError } = await admin.auth.getUser(authToken);
    if (userError || !userData?.user) {
      throw new Error("Please sign in first to reset your password.");
    }

    const sessionEmail = (userData.user.email ?? "").trim().toLowerCase();
    if (sessionEmail !== email) {
      throw new Error("Please use the email address associated with your current account.");
    }

    // Identical for every address — see the security note above.
    const accepted = { ok: true, resendInSeconds: RESEND_COOLDOWN_SECS } as const;

    // Coarse abuse caps. Spent per attempt: capping hammering is exactly
    // what they are for, and a failing request is what hammering looks like.
    if (!rateLimit({ key: `pwotp-ip:${ip}`, limit: 15, windowMs: 60 * 60 * 1000 })) {
      throw new Error("Too many reset requests from this network. Please try again later.");
    }
    if (!rateLimit({ key: `pwotp-email:${email}`, limit: 5, windowMs: 60 * 60 * 1000 })) {
      throw new Error("Too many reset requests for this email. Please try again later.");
    }

    // Server-authoritative cooldown, read from the row's last_sent_at.
    // Checked before the account lookup so an unknown address is throttled
    // exactly like a registered one.
    const existing = await loadOtpRow(loose, email);
    const leftMs = cooldownLeftMs(existing?.last_sent_at, Date.now(), RESEND_COOLDOWN_MS);
    if (leftMs > 0) {
      return pad(startedAt, {
        ok: false as const,
        reason: "cooldown" as const,
        resendInSeconds: Math.ceil(leftMs / 1000),
      });
    }

    const acct = await lookupAccount(loose, admin, email);
    const outcome = classifyRecovery(acct);

    // No account: send nothing, say the same thing, take the same time.
    if (outcome === "silent" || !acct.userId) {
      logger.info("password reset OTP requested for unknown address", { ip });
      return pad(startedAt, accepted);
    }

    // A Google account has no password to reset. Minting one would fork a
    // single identity into two ways to sign in, which registerAccount
    // already treats as a conflict. Only the inbox owner sees which mail
    // arrived, so this reveals nothing publicly.
    if (outcome === "google_notice") {
      const mail = passwordResetGoogleEmail({ loginUrl: `${siteOrigin()}/auth` });
      try {
        await sendMail({ to: email, subject: mail.subject, html: mail.html });
      } catch (err) {
        logger.error("google-account reset notice delivery failed", { email, error: err });
        return pad(startedAt, { ok: false as const, reason: "delivery_failed" as const });
      }
      // Record the cooldown so this path is throttled like any other, but
      // store a row that is born spent: already expired and already
      // consumed, with no usable digest. classifyOtp refuses it outright,
      // so there is no code to guess and nothing to verify against.
      const nowIso = new Date().toISOString();
      const { error: markErr } = await loose.from("password_reset_otps").upsert(
        {
          email,
          user_id: acct.userId,
          otp_hash: "",
          expires_at: nowIso,
          attempts: 0,
          max_attempts: OTP_MAX_ATTEMPTS,
          consumed_at: nowIso,
          auth_hash: null,
          auth_expires_at: null,
          last_sent_at: nowIso,
          created_at: nowIso,
        },
        { onConflict: "email" },
      );
      if (markErr) {
        logger.warn("could not record cooldown for google-only account", { email, error: markErr });
      }
      logger.info("password reset: google-only account notified", { email, ip });
      return pad(startedAt, accepted);
    }

    const otp = generateOtp();
    const mail = passwordResetOtpEmail({ otp, ttlMinutes: OTP_TTL_MS / 60000 });

    // Deliberate ordering: SEND FIRST, PERSIST AFTER.
    //
    // Writing the row first would overwrite a code the user may still be
    // holding, and would start the cooldown, both on the strength of a
    // send that might fail. Sending first means a failure leaves the
    // previous state exactly as it was and the user can retry at once.
    try {
      await sendMail({ to: email, subject: mail.subject, html: mail.html });
    } catch (err) {
      // Never let the code reach a log, even on the failure path.
      logger.error("password reset OTP delivery failed", {
        email,
        error: err instanceof EmailDeliveryError ? err.message : String(err),
      });
      return pad(startedAt, { ok: false as const, reason: "delivery_failed" as const });
    }

    const now = Date.now();
    const { error: upsertErr } = await loose.from("password_reset_otps").upsert(
      {
        email,
        user_id: acct.userId,
        otp_hash: hashOtp(otp, email),
        expires_at: new Date(now + OTP_TTL_MS).toISOString(),
        attempts: 0,
        max_attempts: OTP_MAX_ATTEMPTS,
        // A fresh code supersedes everything the previous row carried.
        consumed_at: null,
        auth_hash: null,
        auth_expires_at: null,
        last_sent_at: new Date(now).toISOString(),
        created_at: new Date(now).toISOString(),
      },
      { onConflict: "email" },
    );
    if (upsertErr) {
      logger.error("failed to store password reset OTP", { email, error: upsertErr });
      return pad(startedAt, { ok: false as const, reason: "delivery_failed" as const });
    }

    logger.info("password reset OTP sent", { email, ip });
    return pad(startedAt, accepted);
  });

// ── 2. Verify the code ───────────────────────────────────────────────

export const verifyPasswordResetOtp = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: emailSchema,
      // Shape-validated here so malformed input never reaches the digest
      // comparison; it still counts as an attempt below.
      otp: z
        .string()
        .trim()
        .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), "Enter the 6-digit code from your email."),
    }),
  )
  .handler(async ({ data }): Promise<VerifyOtpResult> => {
    const { email, otp } = data;
    const ip = getClientIp();
    const startedAt = Date.now();

    // Guessing is capped per IP as well as per row, so an attacker cannot
    // spread guesses across many addresses to stay under the row cap.
    if (!rateLimit({ key: `pwotp-verify-ip:${ip}`, limit: 30, windowMs: 10 * 60 * 1000 })) {
      throw new Error("Too many attempts. Please try again in a few minutes.");
    }

    const { loose } = await db();
    const row = await loadOtpRow(loose, email);

    const state = classifyOtp(
      row && {
        expiresAt: row.expires_at,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        consumedAt: row.consumed_at,
      },
    );

    // "no account / no code requested" and "wrong code" are answered the
    // same way, so this endpoint cannot confirm an address either.
    if (state === "no_otp") {
      return pad(startedAt, {
        ok: false as const,
        reason: "invalid_otp" as const,
        attemptsLeft: OTP_MAX_ATTEMPTS,
      });
    }
    if (state === "otp_expired") {
      return pad(startedAt, { ok: false as const, reason: "otp_expired" as const });
    }
    if (state === "too_many_attempts") {
      return pad(startedAt, { ok: false as const, reason: "too_many_attempts" as const });
    }
    if (state === "otp_consumed") {
      // A code that already produced a grant must never verify again.
      return pad(startedAt, {
        ok: false as const,
        reason: "invalid_otp" as const,
        attemptsLeft: 0,
      });
    }

    const current = row as OtpRowDb;

    if (!digestsMatch(current.otp_hash, hashOtp(otp, email))) {
      const { attempts, exhausted } = afterFailedAttempt({
        attempts: current.attempts,
        maxAttempts: current.max_attempts,
      });
      await loose.from("password_reset_otps").update({ attempts }).eq("email", email);
      logger.warn("password reset OTP mismatch", { email, ip, attempts, exhausted });
      return pad(
        startedAt,
        exhausted
          ? { ok: false as const, reason: "too_many_attempts" as const }
          : {
              ok: false as const,
              reason: "invalid_otp" as const,
              attemptsLeft: Math.max(0, current.max_attempts - attempts),
            },
      );
    }

    // Correct. Consume the code and issue the short-lived grant in ONE
    // conditional write: `.eq("consumed_at", null)` is not expressible
    // through this client, so the guard is that consumed rows were already
    // rejected above and the update stamps consumed_at unconditionally —
    // a racing second request re-reads a consumed row and is refused.
    const resetAuth = generateResetAuth();
    const nowIso = new Date().toISOString();
    const { error: consumeErr } = await loose
      .from("password_reset_otps")
      .update({
        consumed_at: nowIso,
        auth_hash: hashResetAuth(resetAuth),
        auth_expires_at: new Date(Date.now() + RESET_AUTH_TTL_MS).toISOString(),
        // The code itself is dead the instant it is accepted.
        otp_hash: "",
      })
      .eq("email", email);
    if (consumeErr) {
      logger.error("failed to consume password reset OTP", { email, error: consumeErr });
      throw new Error("Something went wrong. Please try again.");
    }

    logger.info("password reset OTP verified", { email, ip });
    return pad(startedAt, { ok: true as const, resetAuth, email });
  });

// ── 3. Write the new password ────────────────────────────────────────

export const resetPasswordWithAuth = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      resetAuth: z.string().trim().min(20).max(200),
      // Re-validated server-side; the client checklist is feedback only.
      password: passwordSchema,
    }),
  )
  .handler(async ({ data }): Promise<ResetPasswordResult> => {
    const ip = getClientIp();
    if (!rateLimit({ key: `pwotp-reset-ip:${ip}`, limit: 20, windowMs: 10 * 60 * 1000 })) {
      throw new Error("Too many attempts. Please try again in a few minutes.");
    }

    const { admin, loose } = await db();
    const authHash = hashResetAuth(data.resetAuth);

    const { data: row } = await loose
      .from("password_reset_otps")
      .select("*")
      .eq("auth_hash", authHash)
      .maybeSingle();

    const state = classifyResetAuth(
      row && { authExpiresAt: row.auth_expires_at, consumedAt: row.consumed_at },
    );
    if (state === "auth_invalid") return { ok: false, reason: "auth_invalid" };
    if (state === "auth_expired") return { ok: false, reason: "auth_expired" };

    const current = row as OtpRowDb;

    // Spend the grant BEFORE writing the password, so two concurrent
    // submits cannot both reach updateUserById. The second finds no row
    // matching the digest and is refused as auth_invalid.
    const { error: spendErr } = await loose
      .from("password_reset_otps")
      .update({ auth_hash: null, auth_expires_at: null })
      .eq("auth_hash", authHash);
    if (spendErr) {
      logger.error("failed to consume reset authorisation", { error: spendErr });
      throw new Error("Something went wrong. Please try again.");
    }

    // Supabase Auth owns password hashing; the plaintext is never stored
    // or logged anywhere in this flow.
    const { error: updateErr } = await admin.auth.admin.updateUserById(current.user_id, {
      password: data.password,
    });
    if (updateErr) {
      const m = (updateErr.message ?? "").toLowerCase();
      logger.error("password update failed", { userId: current.user_id, error: updateErr.message });
      if (m.includes("weak") || m.includes("password")) {
        return {
          ok: false,
          reason: "weak_password",
          message: "That password was rejected. Please choose a stronger one.",
        };
      }
      throw new Error("Could not reset your password. Please try again.");
    }

    // Cut every existing session: old logins on other devices, and the
    // single-device lock they hold (which would otherwise refuse the next
    // sign-in as ALREADY_LOGGED_IN). Best-effort — the password is already
    // changed and must not be rolled back over this.
    try {
      await loose.rpc("revoke_user_sessions", { p_user_id: current.user_id });
    } catch (err) {
      logger.warn("session revoke after password reset failed", {
        userId: current.user_id,
        error: err,
      });
    }

    // The row has nothing left to authorise.
    await loose.from("password_reset_otps").delete().eq("email", current.email);

    logger.info("password reset completed", { userId: current.user_id, ip });
    return { ok: true };
  });
