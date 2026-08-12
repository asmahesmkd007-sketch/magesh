// =====================================================================
// PASSWORD RECOVERY — REQUEST A RESET LINK (server function)
// ---------------------------------------------------------------------
//   requestPasswordReset   email -> Supabase recovery token, emailed
//
// Why this exists rather than a bare client-side resetPasswordForEmail():
//
// `supabase.auth.resetPasswordForEmail()` asks GoTrue to both MINT the
// token and SEND the mail. Minting is what we want from Supabase; sending
// is not — this project has never had Supabase's mailer configured. Every
// other transactional email (registration verification, welcome) goes out
// through `email.server.ts`, and registration deliberately creates auth
// users with `email_confirm: true` so GoTrue never needs to send anything.
// Password recovery was the single flow still depending on Supabase's
// unconfigured built-in mailer, which is why its emails never arrived.
//
// So: Supabase Auth still owns the token (admin.generateLink mints the
// same cryptographically random, single-use, expiring recovery token that
// resetPasswordForEmail would have), and delivery goes through the
// provider chain that already works. No second auth system, no token of
// our own, nothing about recovery stored in our tables.
//
// Security model
//  • The response is IDENTICAL for registered, unregistered and Google
//    addresses, so this endpoint cannot be used to probe which emails
//    have accounts.
//  • The token is never logged. Only the recipient address is.
//  • Google-only accounts get an explanatory email instead of a reset
//    link — silently minting a password would fork one identity into two
//    ways to sign in. Only the inbox owner sees which was sent.
//  • Rate limited per IP and per email, plus a per-address cooldown that
//    is applied before any account lookup so it leaks nothing.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { emailSchema } from "@/lib/auth/password";
import { type AccountFacts, classifyRecovery } from "@/lib/auth/recoveryPolicy";
import { logger } from "@/lib/logger";
import { cooldownRemainingMs, markCooldown, rateLimit } from "@/lib/rate-limit";

import {
  EmailDeliveryError,
  passwordResetEmail,
  passwordResetGoogleEmail,
  sendMail,
} from "./email.server";
import { siteOrigin } from "./siteOrigin.server";

/** Matches the cooldown the form shows on its resend button. */
const RESEND_COOLDOWN_SECS = 60;

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

/**
 * What the app knows about an address, via the same `account_for_email`
 * helper the registration flow uses (SECTION 105.4). Falls back to the
 * admin user list if the RPC is missing from a lagging deployment.
 */
async function lookupAccount(
  admin: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  email: string,
): Promise<AccountFacts> {
  try {
    const { data, error } = await (
      admin as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("account_for_email", { p_email: email });
    if (!error && data && typeof data === "object") {
      const obj = data as {
        exists?: boolean;
        has_password?: boolean;
        identities?: string[] | null;
      };
      return {
        exists: !!obj.exists,
        hasPassword: !!obj.has_password,
        identities: obj.identities ?? [],
      };
    }
  } catch {
    /* fall through to the admin API */
  }

  try {
    const { data } = await admin.auth.admin.listUsers();
    const user = data?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!user) return { exists: false, hasPassword: false, identities: [] };
    return {
      exists: true,
      // The admin API doesn't expose encrypted_password. An 'email'
      // identity is the observable proxy for "has a password".
      hasPassword: !!user.identities?.some((i) => i.provider === "email"),
      identities: user.identities?.map((i) => i.provider) ?? [],
    };
  } catch (err) {
    logger.error("password reset account lookup failed", { email, error: err });
    return { exists: false, hasPassword: false, identities: [] };
  }
}

export type PasswordResetRequestResult =
  /** Request accepted. Identical for sent, not-sent and Google addresses. */
  | { ok: true; resendInSeconds: number }
  /**
   * Still inside the cooldown from a previous *successful* request. Returned
   * rather than thrown: it is a normal, expected answer with a precise number
   * attached, and the form needs to show the countdown without claiming an
   * email was sent.
   */
  | { ok: false; reason: "cooldown"; resendInSeconds: number };

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: emailSchema }))
  .handler(async ({ data }): Promise<PasswordResetRequestResult> => {
    const { email } = data;
    const ip = getClientIp();

    // `email` is already trimmed and lower-cased by emailSchema, so the
    // cooldown key is per-address and normalised — "A@X.com " and "a@x.com"
    // are one address here, and two different addresses never share a key.
    const cooldownKey = `pwreset-cooldown:${email}`;

    // Uniform reply for every address — see the security note above.
    const uniform = { ok: true, resendInSeconds: RESEND_COOLDOWN_SECS } as const;

    // Read-only check. The window is *recorded* at the end, only on a path
    // that actually completed, so a failed attempt never burns it.
    const remainingMs = cooldownRemainingMs(cooldownKey, RESEND_COOLDOWN_SECS * 1000);
    if (remainingMs > 0) {
      return {
        ok: false,
        reason: "cooldown",
        resendInSeconds: Math.ceil(remainingMs / 1000),
      };
    }

    // Coarse abuse controls. These *are* spent per attempt — unlike the
    // cooldown they exist to cap hammering, not to space out emails, and a
    // failing request is exactly what someone hammering would produce.
    if (!rateLimit({ key: `pwreset-ip:${ip}`, limit: 10, windowMs: 60 * 60 * 1000 })) {
      throw new Error("Too many reset requests from this network. Please try again later.");
    }
    if (!rateLimit({ key: `pwreset-email:${email}`, limit: 5, windowMs: 60 * 60 * 1000 })) {
      throw new Error("Too many reset requests for this email. Please try again later.");
    }

    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const outcome = classifyRecovery(await lookupAccount(admin, email));

    // No account: send nothing, say the same thing. Not an error — an
    // attacker must not be able to tell this apart from a real send, which
    // is also why this path starts the cooldown: if only real addresses
    // were throttled, submitting twice would reveal which is which.
    if (outcome === "silent") {
      logger.info("password reset requested for unknown address", { ip });
      markCooldown(cooldownKey);
      return uniform;
    }

    if (outcome === "google_notice") {
      const mail = passwordResetGoogleEmail({ loginUrl: `${siteOrigin()}/auth` });
      try {
        await sendMail({ to: email, subject: mail.subject, html: mail.html });
      } catch (err) {
        logger.error("google-account reset notice delivery failed", { email, error: err });
        throw new Error("We couldn't send the email right now. Please try again in a moment.");
      }
      logger.info("password reset: google-only account notified", { email, ip });
      markCooldown(cooldownKey);
      return uniform;
    }

    // Supabase Auth mints the recovery token. `hashed_token` is the value
    // its own email templates expose as {{ .TokenHash }} and is redeemed
    // with supabase.auth.verifyOtp({ type: 'recovery', token_hash }).
    //
    // We deliberately use that rather than `properties.action_link`:
    // action_link bounces through GoTrue's /verify endpoint and is only
    // honoured if its redirect target sits in the dashboard's Redirect
    // URLs allow-list, and it hands back an implicit-flow hash. Redeeming
    // the token hash directly needs no allow-list entry and works when
    // the link is opened in a different browser from the one that asked
    // for it — the normal case on a phone, where mail apps open links in
    // their own webview. (A PKCE `code` link cannot work there at all:
    // its verifier lives in the requesting browser's storage.)
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${siteOrigin()}/reset-password` },
    });

    if (linkErr || !link?.properties?.hashed_token) {
      // Never log the token; the message is safe to record.
      logger.error("failed to mint recovery link", { email, error: linkErr?.message });
      throw new Error("We couldn't start the password reset. Please try again in a moment.");
    }

    const resetUrl =
      `${siteOrigin()}/reset-password` +
      `?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery`;

    const mail = passwordResetEmail({ resetUrl });
    try {
      await sendMail({ to: email, subject: mail.subject, html: mail.html });
    } catch (err) {
      // A delivery failure is reported, not swallowed: telling someone
      // "check your inbox" when the provider rejected the message is the
      // worst possible outcome. (This is the one case where a broken
      // mailer is distinguishable from an unknown address — an acceptable
      // trade when the whole flow is down anyway.)
      if (err instanceof EmailDeliveryError) {
        logger.error("password reset email delivery failed", { email, error: err.message });
        throw new Error("We couldn't send the email right now. Please try again in a moment.");
      }
      throw err;
    }

    // Only now, with the message accepted by a provider, is the window
    // recorded — this is the send the cooldown exists to space out.
    logger.info("password reset email sent", { email, ip });
    markCooldown(cooldownKey);
    return uniform;
  });
