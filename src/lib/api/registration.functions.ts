// =====================================================================
// REGISTRATION — EMAIL VERIFICATION OTP FLOW (server functions)
// ---------------------------------------------------------------------
//   requestEmailVerificationOtp   email + username  -> 6-digit code, emailed
//   verifyEmailVerificationOtp    email + code      -> setup grant
//   completeRegistration          setup grant + pw  -> real Supabase Auth user
//
// Security model
//  • Codes are 6 uniform digits from crypto.randomInt. Only their
//    HMAC-SHA256 digest is stored with OTP_HASH_SECRET pepper.
//  • Re-requesting or resending invalidates old OTPs instantly.
//  • OTP expires after 5 minutes and is single-use. Max 5 attempts.
//  • Cooldown starts ONLY after successful email delivery.
//  • Supabase Auth user created only on final password submission.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import crypto from "node:crypto";
import { z } from "zod";

import { emailSchema, passwordSchema, usernameSchema } from "@/lib/auth/password";
import {
  afterFailedAttempt,
  classifyOtp,
  cooldownLeftMs,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  RESET_AUTH_TTL_MS,
} from "@/lib/auth/otpPolicy";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

import { EmailDeliveryError, sendMail, verificationOtpEmail, welcomeEmail } from "./email.server";
import { siteOrigin } from "./siteOrigin.server";

const RESEND_COOLDOWN_SECS = RESEND_COOLDOWN_MS / 1000;
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
  attempts: number;
  max_attempts: number;
  created_at: string;
  verified_at: string | null;
};

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

function generateOtp(): string {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

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
  return crypto.createHmac("sha256", otpPepper()).update(`signup:${email}:${otp}`).digest("hex");
}

function digestsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

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

async function accountForEmailHelper(
  admin: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  loose: LooseDb,
  email: string,
): Promise<{ exists: boolean; provider: "email" | "google"; email_verified: boolean }> {
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

  try {
    const { data: profile } = await loose
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (profile) return true;

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

// ── Result Types ──────────────────────────────────────────────────────

export type RequestEmailOtpResult =
  | { ok: true; resendInSeconds: number; email: string }
  | { ok: false; reason: "cooldown"; resendInSeconds: number }
  | { ok: false; reason: "delivery_failed" };

export type VerifyEmailOtpResult =
  | { ok: true; setupToken: string; email: string; username: string }
  | { ok: false; reason: "invalid_otp"; attemptsLeft: number }
  | { ok: false; reason: "otp_expired" }
  | { ok: false; reason: "too_many_attempts" }
  | { ok: false; reason: "already_verified" };

// ── 1. Request Signup Verification OTP ───────────────────────────────

export const requestEmailVerificationOtp = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: emailSchema, username: usernameSchema }))
  .handler(async ({ data }): Promise<RequestEmailOtpResult> => {
    const { email, username } = data;
    const ip = getClientIp();

    if (!rateLimit({ key: `reg-ip:${ip}`, limit: 10, windowMs: 60 * 60 * 1000 })) {
      throw new Error("Too many sign-ups from this network. Please try again later.");
    }
    if (!rateLimit({ key: `reg-email:${email}`, limit: 5, windowMs: 60 * 60 * 1000 })) {
      throw new Error("Too many attempts for this email. Please try again later.");
    }

    const { admin, loose } = await db();

    // Enforce ONE EMAIL = ONE ACCOUNT
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

    // Check cooldown
    const leftMs = cooldownLeftMs(existing?.last_sent_at, Date.now(), RESEND_COOLDOWN_MS);
    if (leftMs > 0) {
      return {
        ok: false,
        reason: "cooldown",
        resendInSeconds: Math.ceil(leftMs / 1000),
      };
    }

    if (existing && existing.send_count >= MAX_SENDS_PER_REGISTRATION) {
      throw new Error(
        "Too many verification emails have been sent to this address. Please contact support.",
      );
    }

    const otp = generateOtp();
    const mail = verificationOtpEmail({ otp, ttlMinutes: OTP_TTL_MS / 60000 });

    // DELIBERATE ORDERING: SEND FIRST, PERSIST AFTER
    try {
      await sendMail({ to: email, subject: mail.subject, html: mail.html });
    } catch (err) {
      logger.error("signup OTP delivery failed", {
        email,
        error: err instanceof EmailDeliveryError ? err.message : String(err),
      });
      return { ok: false, reason: "delivery_failed" };
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const expiresIso = new Date(now + OTP_TTL_MS).toISOString();
    const otpHash = hashOtp(otp, email);
    const sendCount = (existing?.send_count ?? 0) + 1;

    if (existing) {
      const { error: updateErr } = await loose
        .from("pending_registrations")
        .update({
          username,
          status: "pending_verification",
          email_verified: false,
          verified_at: null,
          token_hash: otpHash,
          token_expires_at: expiresIso,
          token_consumed_at: null,
          setup_token_hash: null,
          setup_expires_at: null,
          send_count: sendCount,
          last_sent_at: nowIso,
        })
        .eq("id", existing.id);
      if (updateErr) {
        logger.error("failed to update signup OTP record", { error: updateErr, email });
        throw new Error("Failed to store verification record. Please try again.");
      }
    } else {
      const id = crypto.randomUUID();
      const { error: insertErr } = await loose.from("pending_registrations").insert({
        id,
        email,
        username,
        status: "pending_verification",
        email_verified: false,
        token_hash: otpHash,
        token_expires_at: expiresIso,
        send_count: 1,
        last_sent_at: nowIso,
        created_at: nowIso,
      });
      if (insertErr) {
        logger.error("failed to create signup OTP record", { error: insertErr, email });
        throw new Error("Failed to initialize registration record. Please try again.");
      }
    }

    logger.info("signup verification OTP delivered and persisted", { email, ip });
    return { ok: true, email, resendInSeconds: RESEND_COOLDOWN_SECS };
  });

// Backward compatibility alias for existing callers
export const registerAccount = requestEmailVerificationOtp;

// ── 2. Verify Signup OTP ─────────────────────────────────────────────

export const verifyEmailVerificationOtp = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: emailSchema, otp: z.string().trim() }))
  .handler(async ({ data }): Promise<VerifyEmailOtpResult> => {
    const { email, otp } = data;
    const ip = getClientIp();

    if (!rateLimit({ key: `verify-ip:${ip}`, limit: 30, windowMs: 10 * 60 * 1000 })) {
      throw new Error("Too many attempts. Please try again in a few minutes.");
    }

    const { loose } = await db();
    const { data: row } = await loose
      .from("pending_registrations")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (!row) return { ok: false, reason: "invalid_otp", attemptsLeft: 0 };
    if (row.status === "completed" || row.email_verified) {
      return { ok: false, reason: "already_verified" };
    }

    const outcome = classifyOtp({
      expiresAt: row.token_expires_at ?? 0,
      attempts: (row as { attempts?: number }).attempts ?? 0,
      maxAttempts: (row as { max_attempts?: number }).max_attempts ?? OTP_MAX_ATTEMPTS,
      consumedAt: row.token_consumed_at ?? null,
    });

    if (outcome !== "check") {
      if (outcome === "otp_expired") return { ok: false, reason: "otp_expired" };
      if (outcome === "too_many_attempts") return { ok: false, reason: "too_many_attempts" };
      return { ok: false, reason: "invalid_otp", attemptsLeft: 0 };
    }

    const candidateHash = hashOtp(otp, email);
    if (!row.token_hash || !digestsMatch(row.token_hash, candidateHash)) {
      const currentAttempts = ((row as { attempts?: number }).attempts ?? 0) + 1;
      const next = afterFailedAttempt({
        attempts: (row as { attempts?: number }).attempts ?? 0,
        maxAttempts: (row as { max_attempts?: number }).max_attempts ?? OTP_MAX_ATTEMPTS,
      });

      if (next.exhausted) {
        logger.warn("signup OTP attempts exhausted", { email, ip });
        return { ok: false, reason: "too_many_attempts" };
      }

      const attemptsLeft = OTP_MAX_ATTEMPTS - currentAttempts;
      return { ok: false, reason: "invalid_otp", attemptsLeft: Math.max(0, attemptsLeft) };
    }

    // SUCCESS: Issue short-lived setup token
    const setupToken = generateToken();
    const nowIso = new Date().toISOString();
    const setupExpiresIso = new Date(Date.now() + RESET_AUTH_TTL_MS).toISOString();

    const { error: updateErr } = await loose
      .from("pending_registrations")
      .update({
        status: "email_verified",
        email_verified: true,
        verified_at: nowIso,
        token_consumed_at: nowIso,
        token_expires_at: null,
        setup_token_hash: hashToken(setupToken),
        setup_expires_at: setupExpiresIso,
      })
      .eq("id", row.id);

    if (updateErr) {
      logger.error("failed to mark signup OTP verified", { error: updateErr, email });
      throw new Error("Verification failed. Please try again.");
    }

    logger.info("signup email OTP verified successfully", { email, ip });
    return { ok: true, email, username: row.username, setupToken };
  });

// ── 3. Create Password (Completes Account) ───────────────────────────

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
        "This password setup link has expired. Please request a new verification code.",
      );
    }

    // Consume grant before creation
    const { error: consumeError } = await loose
      .from("pending_registrations")
      .update({ setup_token_hash: null, setup_expires_at: null })
      .eq("id", row.id);
    if (consumeError) {
      logger.error("failed to consume setup token", { error: consumeError, email: row.email });
      throw new Error("Something went wrong. Please try again.");
    }

    const registeredAcct = await accountForEmailHelper(admin, loose, row.email);
    if (registeredAcct.exists) {
      await loose.from("pending_registrations").delete().eq("id", row.id);
      throw new Error("An account with this email already exists. Try signing in instead.");
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: row.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { username: row.username, full_name: row.username, profile_completed: true },
    });

    if (createError || !created?.user) {
      logger.error("account creation failed after OTP verification", {
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

    await loose
      .from("pending_registrations")
      .update({
        status: "completed",
        token_expires_at: null,
        setup_token_hash: null,
        setup_expires_at: null,
      })
      .eq("id", row.id);
    logger.info("registration completed with OTP flow", { email: row.email, userId });

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

// ── 4. Resend Signup OTP ─────────────────────────────────────────────

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

    if (!row || row.status === "completed") {
      return { ok: true, resendInSeconds: RESEND_COOLDOWN_SECS };
    }

    const res = await requestEmailVerificationOtp({
      data: { email: row.email, username: row.username },
    });

    if (!res.ok) {
      if (res.reason === "cooldown") {
        return { ok: true, resendInSeconds: res.resendInSeconds };
      }
      throw new Error("We couldn't send the verification email right now. Please try again.");
    }

    return { ok: true, resendInSeconds: RESEND_COOLDOWN_SECS };
  });
