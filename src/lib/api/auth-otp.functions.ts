import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import crypto from "node:crypto";
import { z } from "zod";

import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// =====================================================================
// EMAIL OTP REGISTRATION VERIFICATION
// ---------------------------------------------------------------------
// The Supabase Auth user is NOT created until the OTP is confirmed here.
// requestEmailOtp only writes to public.email_otp_verifications (a
// service-role-only table — see migration 20260722000001); the account
// itself is created by verifyEmailOtpAndRegister via the Auth admin API
// with email_confirm: true, so no separate Supabase confirmation email
// is ever sent — this OTP *is* the confirmation.
// =====================================================================

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores");
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/[a-z]/, "Password needs a lowercase letter")
  .regex(/\d/, "Password needs a number")
  .regex(/[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?`~]/, "Password needs a special character");
const otpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

type OtpRow = {
  email: string;
  username: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  max_attempts: number;
  last_sent_at: string;
  created_at: string;
};

// email_otp_verifications isn't in the generated Database types (types.ts
// targets a schema that has drifted from wherever this feature's migration
// — supabase/migrations/20260722000001 — actually gets applied). Same
// loosely-typed escape hatch settings.tsx already uses for its own RPCs.
type LooseDb = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        col: string,
        val: string,
      ) => { maybeSingle: () => Promise<{ data: OtpRow | null; error: unknown }> };
      ilike: (
        col: string,
        val: string,
      ) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }> };
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

/** HMAC-SHA256 keyed hash — OTPs are never stored in plaintext. */
function hashOtp(otp: string, email: string): string {
  const secret = process.env.OTP_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Server misconfiguration: OTP hashing secret not set");
  return crypto.createHmac("sha256", secret).update(`${email}:${otp}`).digest("hex");
}

function otpMatches(submitted: string, email: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(submitted, email), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Cryptographically secure, uniform 6-digit code (leading zeros preserved). */
function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "ChessOx <onboarding@resend.dev>";

  if (!apiKey) {
    // Never report success without a real provider confirming delivery —
    // logging-and-pretending-it-sent was indistinguishable from a real send
    // in the UI, so no real email ever reached an inbox. Fail loudly instead.
    logger.error("RESEND_API_KEY not configured — cannot send verification email", { email });
    throw new Error(
      "Email service is not configured (RESEND_API_KEY is missing). No email was sent — contact support or set RESEND_API_KEY in .env.",
    );
  }

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f0505;color:#f5f0e6;border-radius:12px;border:1px solid rgba(212,175,55,0.25)">
      <h1 style="font-size:20px;letter-spacing:0.05em;color:#d4af37;margin:0 0 24px">ChessOx</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px">Your verification code is:</p>
      <p style="font-size:36px;font-weight:700;letter-spacing:0.15em;color:#d4af37;margin:8px 0 24px">${otp}</p>
      <p style="font-size:13px;line-height:1.6;color:rgba(245,240,230,0.7);margin:0 0 16px">This code is valid for 10 minutes.</p>
      <p style="font-size:13px;line-height:1.6;color:rgba(245,240,230,0.5);margin:0">If you did not request this account, you can safely ignore this email.</p>
    </div>
  `.trim();

  logger.info("Sending verification email via Resend", { to: email, from });

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: "Verify Your Email Address",
        html,
      }),
    });
  } catch (networkError) {
    logger.error("Resend request failed (network error)", { to: email, error: networkError });
    throw new Error("Failed to send verification email (network error). Please try again.");
  }

  const body = await res.text().catch(() => "");
  if (!res.ok) {
    logger.error("Resend rejected the verification email", { to: email, status: res.status, body });
    // Surface Resend's own reason (e.g. unverified domain, invalid recipient
    // for a sandbox sender) instead of a generic message, per delivery spec.
    let reason = body;
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (parsed?.message) reason = parsed.message;
    } catch {
      // body wasn't JSON — use it as-is
    }
    throw new Error(`Failed to send verification email: ${reason || `HTTP ${res.status}`}`);
  }

  logger.info("Resend accepted the verification email", { to: email, status: res.status, body });
}

export const requestEmailOtp = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: emailSchema, username: usernameSchema }))
  .handler(
    async ({ data }): Promise<{ ok: true; expiresInSeconds: number; resendInSeconds: number }> => {
      const { email, username } = data;
      const ip = getClientIp();

      if (!rateLimit({ key: `otp-req-ip:${ip}`, limit: 10, windowMs: 60 * 60 * 1000 })) {
        throw new Error("Too many requests from this network. Please try again later.");
      }
      if (!rateLimit({ key: `otp-req-email:${email}`, limit: 5, windowMs: 60 * 60 * 1000 })) {
        throw new Error("Too many verification requests for this email. Please try again later.");
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as unknown as LooseDb;

      const { data: isRegistered, error: registeredCheckError } = await db.rpc(
        "is_email_registered",
        {
          p_email: email,
        },
      );
      if (registeredCheckError) {
        // Fail closed on our own errors reaching the DB (e.g. migration not
        // applied yet) rather than silently treating an unknown state as
        // "not registered" — createUser() is a second, authoritative check
        // later, but there's no reason to send an OTP email if we can't even
        // run this lookup.
        logger.error("is_email_registered lookup failed", { error: registeredCheckError, email });
        throw new Error("Something went wrong. Please try again.");
      }
      if (isRegistered) {
        throw new Error("An account with this email already exists. Try signing in instead.");
      }

      const { data: existingUsername, error: usernameCheckError } = await db
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .maybeSingle();
      if (usernameCheckError) {
        logger.error("Username availability lookup failed", {
          error: usernameCheckError,
          username,
        });
        throw new Error("Something went wrong. Please try again.");
      }
      if (existingUsername) {
        throw new Error("That username is already taken. Please choose another.");
      }

      const { data: existing } = await db
        .from("email_otp_verifications")
        .select("*")
        .eq("email", email)
        .maybeSingle();
      if (existing) {
        const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
        if (elapsed < RESEND_COOLDOWN_MS) {
          const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
          throw new Error(`Please wait ${wait}s before requesting another code.`);
        }
      }

      const otp = generateOtp();
      const otpHash = hashOtp(otp, email);
      const nowIso = new Date().toISOString();
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

      // Upserting on the email PK naturally invalidates any previous OTP for
      // this email (fresh hash, reset attempts) — only one live code per email.
      const { error: upsertError } = await db.from("email_otp_verifications").upsert(
        {
          email,
          username,
          otp_hash: otpHash,
          expires_at: expiresAt,
          attempts: 0,
          max_attempts: MAX_ATTEMPTS,
          last_sent_at: nowIso,
        },
        { onConflict: "email" },
      );
      if (upsertError) {
        logger.error("Failed to store OTP", { error: upsertError });
        throw new Error("Something went wrong. Please try again.");
      }

      await sendOtpEmail(email, otp);
      logger.info("Verification email sent", { email, ip });

      return {
        ok: true,
        expiresInSeconds: OTP_TTL_MS / 1000,
        resendInSeconds: RESEND_COOLDOWN_MS / 1000,
      };
    },
  );

export const verifyEmailOtpAndRegister = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: emailSchema,
      username: usernameSchema,
      password: passwordSchema,
      otp: otpSchema,
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true; username: string }> => {
    const { email, username, password, otp } = data;
    const ip = getClientIp();

    if (!rateLimit({ key: `otp-verify-ip:${ip}`, limit: 20, windowMs: 10 * 60 * 1000 })) {
      throw new Error("Too many attempts. Please try again later.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as LooseDb;

    const { data: record } = await db
      .from("email_otp_verifications")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    if (!record) {
      throw new Error("No verification in progress for this email. Please request a new code.");
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      await db.from("email_otp_verifications").delete().eq("email", email);
      throw new Error("This code has expired. Please request a new one.");
    }

    if (record.attempts >= record.max_attempts) {
      await db.from("email_otp_verifications").delete().eq("email", email);
      throw new Error("Too many incorrect attempts. Please request a new code.");
    }

    if (!otpMatches(otp, email, record.otp_hash)) {
      const attempts = record.attempts + 1;
      const remaining = record.max_attempts - attempts;
      logger.warn("OTP verification failed", { email, ip, attemptsRemaining: remaining });

      if (remaining <= 0) {
        await db.from("email_otp_verifications").delete().eq("email", email);
        throw new Error("Too many incorrect attempts. Please request a new code.");
      }
      await db.from("email_otp_verifications").update({ attempts }).eq("email", email);
      throw new Error(
        `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      );
    }

    // Re-check right before account creation — the earlier checks in
    // requestEmailOtp only guarded against the state at request time.
    const { data: isRegistered } = await db.rpc("is_email_registered", { p_email: email });
    if (isRegistered) {
      await db.from("email_otp_verifications").delete().eq("email", email);
      throw new Error("An account with this email already exists. Try signing in instead.");
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, full_name: username },
    });

    if (createError || !created?.user) {
      logger.error("Account creation failed after OTP verification", { error: createError, email });
      const msg = createError?.message ?? "";
      throw new Error(
        msg.toLowerCase().includes("already")
          ? "An account with this email already exists. Try signing in instead."
          : "Failed to create account. Please try again.",
      );
    }

    const userId = created.user.id;

    // The on_auth_user_created trigger just assigned profiles.username a
    // random placeholder — overwrite it with the one the user actually
    // chose. If a race let someone else take it since the pre-check above,
    // fall back to a suffixed variant rather than failing account creation
    // outright (the email is already verified at this point).
    let finalUsername = username;
    const { error: usernameError } = await db
      .from("profiles")
      .update({ username, full_name: username })
      .eq("id", userId);
    if (usernameError) {
      finalUsername = `${username}_${userId.slice(0, 4)}`;
      await db.from("profiles").update({ username: finalUsername }).eq("id", userId);
    }

    await db.from("email_otp_verifications").delete().eq("email", email);
    logger.info("Account created via email OTP verification", { email, userId });

    return { ok: true, username: finalUsername };
  });
