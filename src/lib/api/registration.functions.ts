// =====================================================================
// REGISTRATION — EMAIL VERIFICATION LINK FLOW (server functions)
// ---------------------------------------------------------------------
//   registerAccount        username + email  -> pending row + email
//   verifyEmailToken       link token        -> verified + setup grant
//   completeRegistration   setup grant + pw  -> real Supabase Auth user
//   resendVerification     email             -> fresh token, old killed
//
// Security model
//  • Tokens are 32 random bytes, base64url. Only their SHA-256 digest is
//    stored, so a database leak cannot be replayed as a verification.
//  • Comparison is by digest lookup, and the stored digest is cleared the
//    moment it is consumed — links are strictly single-use.
//  • The Supabase Auth user is created only at the final step, so an
//    abandoned signup never leaves a password-less account behind and
//    Supabase Auth stays the sole owner of password hashing.
//  • Rate limited per IP and per email; resend additionally has a
//    cooldown and a hard per-registration send cap.
//  • Resend never reveals whether an address is registered.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import crypto from "node:crypto";
import { z } from "zod";

import { emailSchema, passwordSchema, usernameSchema } from "@/lib/auth/password";
import { classifyVerification } from "@/lib/auth/tokenLifecycle";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

import { EmailDeliveryError, sendMail, verificationEmail, welcomeEmail } from "./email.server";
import { siteOrigin } from "./siteOrigin.server";

// ── Policy ───────────────────────────────────────────────────────────

/** Verification links live long enough to survive a slow inbox. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** The create-password grant is deliberately short. */
const SETUP_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_REGISTRATION = 5;

const tokenSchema = z.string().trim().min(20).max(200);

type PendingRow = {
  id: string;
  email: string;
  username: string;
  status: "pending_verification" | "email_verified" | "completed";
  email_verified: boolean;
  token_hash: string | null;
  token_expires_at: string | null;
  token_consumed_at: string | null;
  setup_token_hash: string | null;
  setup_expires_at: string | null;
  send_count: number;
  last_sent_at: string;
  created_at: string;
  verified_at: string | null;
};

// The generated Database types don't include pending_registrations (this
// repo's types.ts is known to drift from the live schema — see the note
// in schema.sql SECTION 78). Same loosely-typed escape hatch the rest of
// the service layer uses.
type LooseDb = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{ data: PendingRow | null; error: unknown }>;
      };
      ilike: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{ data: PendingRow | null; error: unknown }>;
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
    delete: () => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

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

/** 256 bits of entropy, URL-safe — safe to put in a link. */
function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Tokens are stored only as digests; the raw value lives in the email. */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function db(): Promise<{
  admin: typeof import("@/integrations/supabase/client.server").supabaseAdmin;
  loose: LooseDb;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { admin: supabaseAdmin, loose: supabaseAdmin as unknown as LooseDb };
}

/** Issue a fresh verification link and email it. Returns nothing useful. */
async function issueVerification(
  loose: LooseDb,
  row: { id: string; email: string; username: string; send_count: number },
): Promise<void> {
  const token = generateToken();
  const { error } = await loose
    .from("pending_registrations")
    .update({
      token_hash: hashToken(token),
      token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      // A fresh link is unconsumed, and supersedes any outstanding
      // setup grant from a previous one.
      token_consumed_at: null,
      setup_token_hash: null,
      setup_expires_at: null,
      send_count: row.send_count + 1,
      last_sent_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) {
    logger.error("failed to store verification token", { error, email: row.email });
    throw new Error("Something went wrong. Please try again.");
  }

  const verifyUrl = `${siteOrigin()}/verify-email/${token}`;
  const mail = verificationEmail({
    username: row.username,
    verifyUrl,
    ttlHours: TOKEN_TTL_MS / 3_600_000,
  });
  await sendMail({ to: row.email, subject: mail.subject, html: mail.html });
}

async function accountForEmailHelper(
  admin: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  loose: LooseDb,
  email: string,
): Promise<{ exists: boolean; provider: "email" | "google"; email_verified: boolean }> {
  // 1. Try account_for_email RPC
  try {
    const { data, error } = await loose.rpc("account_for_email", { p_email: email });
    if (!error && data && typeof data === "object") {
      const obj = data as { exists?: boolean; provider?: string; email_verified?: boolean };
      if (obj.exists) {
        return {
          exists: true,
          provider: obj.provider === "google" ? "google" : "email",
          email_verified: !!obj.email_verified,
        };
      }
      return { exists: false, provider: "email", email_verified: false };
    }
  } catch {
    /* fallback below */
  }

  // 2. Direct query fallback via admin.auth.admin.listUsers()
  try {
    const { data: usersData } = await admin.auth.admin.listUsers();
    const user = usersData?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) {
      const isGoogle =
        user.app_metadata?.provider === "google" ||
        user.identities?.some((i) => i.provider === "google");
      return {
        exists: true,
        provider: isGoogle ? "google" : "email",
        email_verified: !!user.email_confirmed_at,
      };
    }
  } catch (err) {
    logger.error("accountForEmailHelper fallback check failed", { error: err, email });
  }

  return { exists: false, provider: "email", email_verified: false };
}

async function isUsernameTakenHelper(
  loose: LooseDb,
  username: string,
  exceptEmail?: string,
): Promise<boolean> {
  // 1. Try is_username_taken RPC
  try {
    const { data, error } = await loose.rpc("is_username_taken", {
      p_username: username,
      p_except_email: exceptEmail || null,
    });
    if (!error && typeof data === "boolean") {
      return data;
    }
  } catch {
    /* fallback below */
  }

  // 2. Fallback check profiles table
  try {
    const { data: profile } = await loose
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (profile) return true;

    // Check pending_registrations if table exists
    const { data: pending } = await loose
      .from("pending_registrations")
      .select("id, email")
      .ilike("username", username)
      .maybeSingle();

    if (pending) {
      if (exceptEmail && pending.email.toLowerCase() === exceptEmail.toLowerCase()) {
        return false;
      }
      return true;
    }
  } catch {
    /* table may not exist yet */
  }

  return false;
}

// ── 1. Register ──────────────────────────────────────────────────────

export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: emailSchema, username: usernameSchema }))
  .handler(async ({ data }): Promise<{ ok: true; email: string; resendInSeconds: number }> => {
    const { email, username } = data;
    const ip = getClientIp();

    if (!rateLimit({ key: `reg-ip:${ip}`, limit: 10, windowMs: 60 * 60 * 1000 })) {
      throw new Error("Too many sign-ups from this network. Please try again later.");
    }
    if (!rateLimit({ key: `reg-email:${email}`, limit: 5, windowMs: 60 * 60 * 1000 })) {
      throw new Error("Too many attempts for this email. Please try again later.");
    }

    const { admin, loose } = await db();

    // Enforce ONE EMAIL = ONE ACCOUNT rule
    const acct = await accountForEmailHelper(admin, loose, email);
    if (acct.exists) {
      if (acct.provider === "google") {
        throw new Error(
          "An account already exists with this Google account. Please sign in with Google.",
        );
      } else {
        throw new Error(
          "An account already exists with this email address. Please sign in using Email and Password.",
        );
      }
    }

    // Enforce Username Uniqueness
    const usernameTaken = await isUsernameTakenHelper(loose, username, email);
    if (usernameTaken) {
      throw new Error("That username is already taken. Please choose another.");
    }

    let existing: PendingRow | null = null;
    try {
      const { data: p } = await loose
        .from("pending_registrations")
        .select("*")
        .eq("email", email)
        .maybeSingle();
      existing = p;
    } catch {
      /* pending_registrations table check */
    }

    let row: { id: string; email: string; username: string; send_count: number };

    if (existing) {
      const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        throw new Error(`Please wait ${wait}s before requesting another email.`);
      }
      if (existing.send_count >= MAX_SENDS_PER_REGISTRATION) {
        throw new Error(
          "Too many verification emails have been sent to this address. Please contact support.",
        );
      }
      const { error } = await loose
        .from("pending_registrations")
        .update({
          username,
          status: "pending_verification",
          email_verified: false,
          verified_at: null,
        })
        .eq("id", existing.id);
      if (error) {
        logger.error("failed to reset pending registration", { error, email });
        throw new Error("Failed to store registration request. Please try again.");
      }
      row = { id: existing.id, email, username, send_count: existing.send_count };
    } else {
      const id = crypto.randomUUID();
      const { error } = await loose.from("pending_registrations").insert({
        id,
        email,
        username,
        status: "pending_verification",
        email_verified: false,
        send_count: 0,
        last_sent_at: new Date(0).toISOString(),
      });
      if (error) {
        logger.error("failed to create pending registration", { error, email });
        const errMsg = String((error as { message?: string })?.message || error);
        if (errMsg.includes("schema cache") || errMsg.includes("does not exist")) {
          throw new Error(
            "Database schema missing 'pending_registrations'. Please run the Supabase migration script in SQL Editor.",
          );
        }
        throw new Error("Failed to initialize registration record. Please try again.");
      }
      row = { id, email, username, send_count: 0 };
    }

    try {
      await issueVerification(loose, row);
    } catch (err) {
      if (err instanceof EmailDeliveryError) {
        logger.error("verification email delivery failed", { email, error: err });
        throw new Error(
          "We couldn't send the verification email. Please check your email address or try resending.",
        );
      }
      throw err;
    }

    logger.info("verification email sent", { email, ip });
    return { ok: true, email, resendInSeconds: RESEND_COOLDOWN_MS / 1000 };
  });

// ── 2. Verify the link ───────────────────────────────────────────────

export type VerifyResult =
  | { ok: true; email: string; username: string; setupToken: string }
  | { ok: false; reason: "invalid" | "expired" | "already_verified" };

export const verifyEmailToken = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: tokenSchema }))
  .handler(async ({ data }): Promise<VerifyResult> => {
    const ip = getClientIp();
    if (!rateLimit({ key: `verify-ip:${ip}`, limit: 30, windowMs: 10 * 60 * 1000 })) {
      throw new Error("Too many attempts. Please try again in a few minutes.");
    }

    const { loose } = await db();
    const tokenHash = hashToken(data.token);

    const { data: row } = await loose
      .from("pending_registrations")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    // Rules live in lib/auth/tokenLifecycle (unit-tested there); this
    // handler only performs the I/O they imply.
    const outcome = classifyVerification({
      found: Boolean(row),
      status: row?.status ?? "pending_verification",
      tokenConsumedAt: row?.token_consumed_at ?? null,
      tokenExpiresAt: row?.token_expires_at ?? null,
    });

    if (outcome !== "verify" || !row) {
      if (outcome === "invalid") logger.warn("verification token not found", { ip });
      return { ok: false, reason: outcome === "verify" ? "invalid" : outcome };
    }

    // Consume the link and issue the short-lived create-password grant.
    // token_hash is deliberately RETAINED so repeat clicks resolve; it is
    // the consumed-at stamp above that enforces single use.
    const setupToken = generateToken();
    const { error } = await loose
      .from("pending_registrations")
      .update({
        status: "email_verified",
        email_verified: true,
        verified_at: row.verified_at ?? new Date().toISOString(),
        token_consumed_at: new Date().toISOString(),
        token_expires_at: null,
        setup_token_hash: hashToken(setupToken),
        setup_expires_at: new Date(Date.now() + SETUP_TTL_MS).toISOString(),
      })
      .eq("id", row.id);
    if (error) {
      logger.error("failed to mark registration verified", { error, email: row.email });
      throw new Error("Something went wrong. Please try again.");
    }

    logger.info("email verified", { email: row.email, ip });
    return { ok: true, email: row.email, username: row.username, setupToken };
  });

// ── 3. Create the password (completes the account) ───────────────────

export const completeRegistration = createServerFn({ method: "POST" })
  .inputValidator(z.object({ setupToken: tokenSchema, password: passwordSchema }))
  .handler(async ({ data }): Promise<{ ok: true; email: string; username: string }> => {
    const ip = getClientIp();
    if (!rateLimit({ key: `complete-ip:${ip}`, limit: 20, windowMs: 10 * 60 * 1000 })) {
      throw new Error("Too many attempts. Please try again in a few minutes.");
    }

    const { admin, loose } = await db();
    const setupHash = hashToken(data.setupToken);

    const { data: row } = await loose
      .from("pending_registrations")
      .select("*")
      .eq("setup_token_hash", setupHash)
      .maybeSingle();

    if (!row) {
      throw new Error(
        "This password setup link is no longer valid. Please verify your email again.",
      );
    }
    if (!row.email_verified) {
      throw new Error("Please verify your email address first.");
    }
    if (!row.setup_expires_at || new Date(row.setup_expires_at).getTime() < Date.now()) {
      throw new Error(
        "This password setup link has expired. Please request a new verification email.",
      );
    }

    // Consume the grant BEFORE creating the account so a double submit
    // cannot race two createUser calls through.
    const { error: consumeError } = await loose
      .from("pending_registrations")
      .update({ setup_token_hash: null, setup_expires_at: null })
      .eq("id", row.id);
    if (consumeError) {
      logger.error("failed to consume setup token", { error: consumeError, email: row.email });
      throw new Error("Something went wrong. Please try again.");
    }

    // Last authoritative check — someone may have registered this
    // address through another path since verification.
    const registeredAcct = await accountForEmailHelper(admin, loose, row.email);
    if (registeredAcct.exists) {
      await loose.from("pending_registrations").delete().eq("id", row.id);
      throw new Error("An account with this email already exists. Try signing in instead.");
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: row.email,
      password: data.password,
      email_confirm: true, // this flow IS the confirmation
      user_metadata: { username: row.username, full_name: row.username },
    });

    if (createError || !created?.user) {
      logger.error("account creation failed after verification", {
        error: createError,
        email: row.email,
      });
      const msg = (createError?.message ?? "").toLowerCase();
      throw new Error(
        msg.includes("already")
          ? "An account with this email already exists. Try signing in instead."
          : "Failed to create your account. Please try again.",
      );
    }

    const userId = created.user.id;

    // The on_auth_user_created trigger assigned a placeholder username —
    // replace it with the chosen one. If it was taken in the meantime,
    // suffix rather than fail: the account itself is already created.
    let finalUsername = row.username;
    const { error: usernameError } = await loose
      .from("profiles")
      .update({ username: row.username, full_name: row.username })
      .eq("id", userId);
    if (usernameError) {
      finalUsername = `${row.username}_${userId.slice(0, 4)}`;
      await loose.from("profiles").update({ username: finalUsername }).eq("id", userId);
      logger.warn("username collision at completion, suffixed", {
        wanted: row.username,
        used: finalUsername,
      });
    }

    // Mark completed rather than delete: a link opened after setup
    // finishes then resolves to "already verified" instead of the
    // misleading "invalid". purge_expired_registrations clears it later.
    // Every token is blanked, so nothing here remains usable.
    await loose
      .from("pending_registrations")
      .update({
        status: "completed",
        token_expires_at: null,
        setup_token_hash: null,
        setup_expires_at: null,
      })
      .eq("id", row.id);
    logger.info("registration completed", { email: row.email, userId });

    // Best-effort courtesy email — never fail the signup over it.
    try {
      const mail = welcomeEmail({
        username: finalUsername,
        loginUrl: `${siteOrigin()}/auth`,
      });
      await sendMail({ to: row.email, subject: mail.subject, html: mail.html });
    } catch (err) {
      logger.warn("welcome email failed (account is active)", { email: row.email, error: err });
    }

    return { ok: true, email: row.email, username: finalUsername };
  });

// ── 4. Resend ────────────────────────────────────────────────────────

export const resendVerification = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: emailSchema }))
  .handler(async ({ data }): Promise<{ ok: true; resendInSeconds: number }> => {
    const { email } = data;
    const ip = getClientIp();

    if (!rateLimit({ key: `resend-ip:${ip}`, limit: 10, windowMs: 60 * 60 * 1000 })) {
      throw new Error("Too many requests from this network. Please try again later.");
    }
    if (!rateLimit({ key: `resend-email:${email}`, limit: 5, windowMs: 60 * 60 * 1000 })) {
      throw new Error("Too many verification emails requested. Please try again later.");
    }

    const { loose } = await db();
    const { data: row } = await loose
      .from("pending_registrations")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    // Deliberately uniform response whether or not a registration
    // exists — this endpoint must not confirm which addresses are in use.
    const uniform = { ok: true, resendInSeconds: RESEND_COOLDOWN_MS / 1000 } as const;
    if (!row || row.status === "completed") {
      logger.info("resend requested for unknown or completed registration", { ip });
      return uniform;
    }

    const elapsed = Date.now() - new Date(row.last_sent_at).getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw new Error(`Please wait ${wait}s before requesting another email.`);
    }
    if (row.send_count >= MAX_SENDS_PER_REGISTRATION) {
      throw new Error(
        "Too many verification emails have been sent to this address. Please contact support.",
      );
    }

    try {
      await issueVerification(loose, {
        id: row.id,
        email: row.email,
        username: row.username,
        send_count: row.send_count,
      });
    } catch (err) {
      if (err instanceof EmailDeliveryError) {
        logger.error("resend delivery failed", { email, error: err });
        throw new Error("We couldn't send the email right now. Please try again shortly.");
      }
      throw err;
    }

    logger.info("verification email resent", { email, ip });
    return uniform;
  });
