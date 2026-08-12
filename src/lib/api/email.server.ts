// =====================================================================
// TRANSACTIONAL EMAIL (server only)
// ---------------------------------------------------------------------
// One place that knows how to put an email on the wire, and one place
// that knows what a ChessOx email looks like. Providers are tried in
// order of preference and the first configured one wins:
//
//   1. Gmail SMTP   (GMAIL_USER + GMAIL_APP_PASSWORD)
//   2. EmailJS      (EMAILJS_SERVICE_ID + TEMPLATE_ID + PUBLIC_KEY)
//   3. Resend       (RESEND_API_KEY)
//
// NEVER import this from client code — it reads secrets from the
// environment. Server functions only.
// =====================================================================
import { logger } from "@/lib/logger";

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback; generated from the HTML when omitted. */
  text?: string;
};

/** Thrown when every configured provider fails, or none is configured. */
export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Providers ────────────────────────────────────────────────────────

async function sendViaGmail(msg: MailMessage): Promise<boolean> {
  const user = process.env.GMAIL_USER || process.env.SMTP_USER || process.env.VITE_GMAIL_USER;
  const pass =
    process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || process.env.VITE_GMAIL_APP_PASSWORD;
  if (!user || !pass) return false;

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: pass.replace(/\s+/g, "") },
  });
  await transporter.sendMail({
    from: `ChessOx <${user}>`,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text ?? stripHtml(msg.html),
  });
  logger.info("email sent via Gmail SMTP", { to: msg.to, subject: msg.subject });
  return true;
}

async function sendViaEmailJs(msg: MailMessage): Promise<boolean> {
  const serviceId = process.env.EMAILJS_SERVICE_ID || process.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID || process.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY || process.env.VITE_EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY || process.env.VITE_EMAILJS_PRIVATE_KEY;
  if (!serviceId || !templateId || !publicKey) return false;

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey || undefined,
      template_params: {
        to_email: msg.to,
        email: msg.to,
        subject: msg.subject,
        message_html: msg.html,
        message: msg.text ?? stripHtml(msg.html),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new EmailDeliveryError(`EmailJS rejected the message: ${body || `HTTP ${res.status}`}`);
  }
  logger.info("email sent via EmailJS", { to: msg.to, subject: msg.subject });
  return true;
}

async function sendViaResend(msg: MailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.EMAIL_FROM || "ChessOx <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text ?? stripHtml(msg.html),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let reason = body;
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (parsed?.message) reason = parsed.message;
    } catch {
      /* body wasn't JSON */
    }
    throw new EmailDeliveryError(`Resend rejected the message: ${reason || `HTTP ${res.status}`}`);
  }
  logger.info("email sent via Resend", { to: msg.to, subject: msg.subject });
  return true;
}

/**
 * Send a transactional email. Throws EmailDeliveryError when nothing is
 * configured or every configured provider fails — callers surface that
 * as "we couldn't send the email, try resending".
 */
export async function sendMail(msg: MailMessage): Promise<void> {
  const providers: [string, (m: MailMessage) => Promise<boolean>][] = [
    ["gmail", sendViaGmail],
    ["emailjs", sendViaEmailJs],
    ["resend", sendViaResend],
  ];

  const failures: string[] = [];
  for (const [name, send] of providers) {
    try {
      if (await send(msg)) return;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error("email provider failed", { provider: name, to: msg.to, error: err });
      failures.push(`${name}: ${detail}`);
    }
  }

  if (failures.length > 0) {
    throw new EmailDeliveryError(`All email providers failed — ${failures.join("; ")}`);
  }
  throw new EmailDeliveryError(
    "Email service is not configured. Set GMAIL_USER + GMAIL_APP_PASSWORD, EMAILJS_*, or RESEND_API_KEY.",
  );
}

// ── Branding ─────────────────────────────────────────────────────────

const BRAND = {
  bg: "#0f0505",
  panel: "#170a08",
  gold: "#d4af37",
  ink: "#f5f0e6",
  muted: "rgba(245,240,230,0.65)",
  faint: "rgba(245,240,230,0.45)",
  border: "rgba(212,175,55,0.25)",
};

/** Escape user-controlled values before they go into email HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type LayoutOptions = {
  heading: string;
  /** Paragraphs of body copy (already escaped where needed). */
  body: string[];
  cta?: { label: string; url: string };
  /** Shown small under the button — usually the raw link. */
  footnote?: string[];
  /**
   * Grey print in the bottom bar. Defaults to the registration wording;
   * password recovery overrides it, because "the account stays inactive"
   * is untrue — and alarming — on a mail about an existing account.
   */
  footer?: string;
};

const DEFAULT_FOOTER =
  "You received this email because someone used this address on ChessOx. " +
  "If that wasn&rsquo;t you, no action is needed &mdash; the account stays inactive.";

/**
 * Table-based, inline-styled layout — the only thing that renders
 * reliably across Gmail, Outlook and Apple Mail. Max width 480px so it
 * reads well on a phone without zooming.
 */
export function renderEmail({ heading, body, cta, footnote, footer }: LayoutOptions): string {
  const paragraphs = body
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${BRAND.ink}">${p}</p>`,
    )
    .join("");

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0">
         <tr><td align="center" bgcolor="${BRAND.gold}" style="border-radius:8px">
           <a href="${cta.url}"
              style="display:inline-block;padding:14px 32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:0.06em;color:#1a0d0a;text-decoration:none;border-radius:8px">
             ${escapeHtml(cta.label)}
           </a>
         </td></tr>
       </table>`
    : "";

  const notes = (footnote ?? [])
    .map(
      (n) =>
        `<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${BRAND.faint};word-break:break-all">${n}</p>`,
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0"
             style="max-width:480px;width:100%;background:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:14px">
        <tr><td style="padding:32px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
          <div style="font-size:13px;letter-spacing:0.28em;text-transform:uppercase;color:${BRAND.gold};margin:0 0 6px">ChessOx</div>
          <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:${BRAND.ink};font-weight:600">${escapeHtml(heading)}</h1>
          ${paragraphs}
          ${button}
          ${notes}
        </td></tr>
        <tr><td style="padding:0 28px 26px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
          <div style="border-top:1px solid rgba(245,240,230,0.08);padding-top:16px;font-size:11px;line-height:1.6;color:${BRAND.faint}">
            ${footer ?? DEFAULT_FOOTER}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** The registration verification email (subject fixed by the spec). */
export function verificationEmail(opts: { username: string; verifyUrl: string; ttlHours: number }) {
  const name = escapeHtml(opts.username);
  return {
    subject: "Verify Your Chessox Account",
    html: renderEmail({
      heading: `Welcome to ChessOx, ${name}`,
      body: [
        "Your account has been created and is waiting on one last step.",
        "Verify this email address to activate your ChessOx account. You&rsquo;ll choose your password straight afterwards.",
      ],
      cta: { label: "VERIFY EMAIL", url: opts.verifyUrl },
      footnote: [
        `This link expires in ${opts.ttlHours} hours and can only be used once.`,
        `If the button doesn&rsquo;t work, paste this into your browser:<br><a href="${opts.verifyUrl}" style="color:${BRAND.gold}">${escapeHtml(opts.verifyUrl)}</a>`,
      ],
    }),
  };
}

const RESET_FOOTER =
  "You received this email because a password reset was requested for your ChessOx account. " +
  "If that wasn&rsquo;t you, ignore this email &mdash; your password has not changed.";

/**
 * The password recovery email. The link carries a Supabase Auth recovery
 * token (minted by GoTrue, single-use, expiring) — this template only
 * carries it, it never generates or stores one.
 */
export function passwordResetEmail(opts: { resetUrl: string }) {
  return {
    subject: "Reset your Chessox password",
    html: renderEmail({
      heading: "Reset your password",
      body: [
        "We received a request to reset the password for your ChessOx account.",
        "Choose a new password using the button below. If you didn&rsquo;t request this, you can safely ignore this email.",
      ],
      cta: { label: "RESET PASSWORD", url: opts.resetUrl },
      footnote: [
        "This link can only be used once and expires a short time after it was sent.",
        `If the button doesn&rsquo;t work, paste this into your browser:<br><a href="${opts.resetUrl}" style="color:${BRAND.gold}">${escapeHtml(opts.resetUrl)}</a>`,
      ],
      footer: RESET_FOOTER,
    }),
  };
}

/**
 * Sent instead of a reset link when the address belongs to a Google
 * account. Such accounts have no password to reset, and silently creating
 * one would fork a single identity into two ways to sign in. Only the
 * inbox owner sees this, so naming the provider reveals nothing publicly.
 */
export function passwordResetGoogleEmail(opts: { loginUrl: string }) {
  return {
    subject: "Reset your Chessox password",
    html: renderEmail({
      heading: "Your account uses Google Sign-In",
      body: [
        "We received a request to reset the password for your ChessOx account.",
        "This account signs in with Google, so it doesn&rsquo;t have a ChessOx password to reset. Use the <b>Continue with Google</b> button on the sign-in page instead.",
        "If you&rsquo;ve lost access to that Google account, recover it through Google &mdash; we can&rsquo;t reset a Google password for you.",
      ],
      cta: { label: "GO TO SIGN IN", url: opts.loginUrl },
      footer: RESET_FOOTER,
    }),
  };
}

/** Confirmation sent once the account is fully active. */
export function welcomeEmail(opts: { username: string; loginUrl: string }) {
  const name = escapeHtml(opts.username);
  return {
    subject: "Your Chessox account is ready",
    html: renderEmail({
      heading: "Account setup complete",
      body: [
        `Welcome aboard, ${name}. Your email is verified and your password is set.`,
        "You can now sign in and start playing.",
      ],
      cta: { label: "LOGIN NOW", url: opts.loginUrl },
      footnote: ["If you did not set this password, reset it immediately from the sign-in page."],
    }),
  };
}
