// =====================================================================
// TRANSACTIONAL EMAIL (server only)
// ---------------------------------------------------------------------
// ONE provider: the Resend HTTP API, over HTTPS, via native fetch.
// Configured by RESEND_API_KEY + EMAIL_FROM. Email only — this project
// sends no SMS, WhatsApp, voice or phone codes of any kind.
//
// It previously tried Gmail SMTP, then EmailJS, then Resend, taking the
// first that answered. That chain is why signup codes silently went
// nowhere: each provider failed for its own reason, the failures were
// swallowed one after another, and outside production the last step
// RETURNED AS IF THE MAIL HAD BEEN SENT (printing the code to the server
// console instead). The UI, told the send had succeeded, moved the user
// to the "enter your code" screen for a code that never left.
//
// Resend over HTTPS is what survived, because on a managed host (Railway,
// Vercel, Render) there is no outbound SMTP port to be blocked, rate-
// limited or silently null-routed, and the API reports acceptance or
// rejection synchronously — so a normal return genuinely means a provider
// took the message. Gmail SMTP additionally capped at ~500/day and could
// only send from a @gmail.com address.
//
// There is deliberately NO fallback provider and NO dev-mode shortcut.
// If mail cannot be sent, this throws and the caller tells the user the
// truth. The OTP flows depend on that distinction: a delivery failure
// must not start a resend cooldown.
//
// NEVER import this from client code — it reads secrets from the
// environment. Server functions only. RESEND_API_KEY must never appear
// in a VITE_* variable, which would inline it into the browser bundle.
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

// ── Provider: Resend HTTP API ────────────────────────────────────────

/** Domain only — the full recipient is never needed to debug delivery. */
function getRecipientDomain(email: string): string {
  const parts = email.split("@");
  return parts.length > 1 ? `@${parts[1]}` : "unknown";
}

/** The address inside `Name <addr@host>`, or the whole string if bare. */
function senderDomain(from: string): string {
  const match = /<([^>]+)>/.exec(from);
  const addr = (match ? match[1] : from).trim();
  return getRecipientDomain(addr).replace(/^@/, "").toLowerCase();
}

/**
 * Resend's shared sandbox domain. It authenticates fine, which is what
 * makes it so misleading: it accepts mail to the account owner and
 * rejects every other recipient with HTTP 403. A deploy left on this
 * address delivers to exactly one inbox.
 */
const SANDBOX_DOMAIN = "resend.dev";

/**
 * Consumer mailbox providers. You cannot verify one of these in Resend —
 * you do not control its DNS — so a `from` on any of them is guaranteed
 * to 403 at send time. Refusing it here turns a per-recipient runtime
 * failure into one unmissable configuration error.
 */
const CONSUMER_SENDER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

type MailConfig = { apiKey: string; from: string };

/**
 * Read and validate the mail configuration.
 *
 * Throws — loudly, with the exact remedy — rather than letting a request
 * discover the problem as a per-recipient 403 from Resend. There is no
 * fallback provider by design: a silent second attempt is what previously
 * let "sent" mean "not sent".
 */
function mailConfig(): MailConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new EmailDeliveryError(
      "Email is not configured: RESEND_API_KEY is not set. " +
        "Add it to the backend server environment (server-side only — never a VITE_* variable).",
    );
  }

  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw new EmailDeliveryError(
      "Email is not configured: EMAIL_FROM is not set. " +
        'Use EMAIL_FROM="ChessOx <noreply@your-verified-domain>".',
    );
  }

  const domain = senderDomain(from);

  if (domain === SANDBOX_DOMAIN) {
    throw new EmailDeliveryError(
      "Email is misconfigured: EMAIL_FROM uses Resend's sandbox sender " +
        "(onboarding@resend.dev), which only delivers to the Resend account owner. " +
        "Verify your domain at https://resend.com/domains and set " +
        'EMAIL_FROM="ChessOx <noreply@your-verified-domain>".',
    );
  }

  if (CONSUMER_SENDER_DOMAINS.has(domain)) {
    throw new EmailDeliveryError(
      `Email is misconfigured: EMAIL_FROM uses ${domain}, which cannot be verified in Resend ` +
        "because you do not control its DNS. Verify your own domain at " +
        'https://resend.com/domains and set EMAIL_FROM="ChessOx <noreply@your-verified-domain>".',
    );
  }

  return { apiKey, from };
}

/** Resend's error bodies are small and safe; cap them anyway. */
function safeErrorDetail(body: string, status: number): string {
  let reason = body;
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed?.message) reason = parsed.message;
  } catch {
    /* body wasn't JSON */
  }
  reason = (reason || `HTTP ${status}`).replace(/\s+/g, " ").trim();
  return reason.length > 300 ? `${reason.slice(0, 300)}…` : reason;
}

/**
 * Send a transactional email through the Resend HTTP API.
 *
 * Resolves ONLY when Resend has accepted the message (2xx). Callers may
 * read a normal return as "a provider took this" and nothing weaker —
 * the OTP flows rely on that to decide whether to start a resend
 * cooldown. Every other outcome throws EmailDeliveryError.
 *
 * Never logged: the API key, the Authorization header, the message body
 * (it carries one-time codes), or the full recipient address.
 */
export async function sendMail(msg: MailMessage): Promise<void> {
  const { apiKey, from } = mailConfig();
  const recipientDomain = getRecipientDomain(msg.to);

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
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text ?? stripHtml(msg.html),
      }),
    });
  } catch (err) {
    // DNS failure, TLS failure, egress blocked — never reached Resend.
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("email delivery failed: could not reach provider", {
      email_provider: "resend",
      recipientDomain,
      errorMsg: detail,
    });
    throw new EmailDeliveryError(`Could not reach Resend: ${detail}`);
  }

  if (!res.ok) {
    const detail = safeErrorDetail(await res.text().catch(() => ""), res.status);
    logger.error("email delivery rejected by provider", {
      email_provider: "resend",
      status: res.status,
      recipientDomain,
      senderAddress: from,
      errorMsg: detail,
    });
    throw new EmailDeliveryError(`Resend rejected the message (HTTP ${res.status}): ${detail}`);
  }

  logger.info("email delivery succeeded", {
    email_provider: "resend",
    status: res.status,
    recipientDomain,
    senderAddress: from,
  });
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
  // A body entry that is already block-level (the OTP panel, say) is
  // emitted as-is: wrapping a <table> in a <p> is invalid HTML, and Outlook
  // in particular renders the result with stray gaps.
  const isBlock = (s: string) => /^\s*<(table|div|ul|ol|h[1-6]|blockquote|p)\b/i.test(s);
  const paragraphs = body
    .map((p) =>
      isBlock(p)
        ? p
        : `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${BRAND.ink}">${p}</p>`,
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

/** The registration email OTP verification template. */
export function verificationOtpEmail(opts: { otp: string; ttlMinutes: number }) {
  const code = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;width:100%">
      <tr><td align="center" style="padding:18px 12px;background:rgba(212,175,55,0.08);border:1px solid ${BRAND.border};border-radius:10px">
        <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;line-height:1.1;font-weight:700;letter-spacing:0.34em;color:${BRAND.gold};text-indent:0.34em">${escapeHtml(opts.otp)}</div>
      </td></tr>
    </table>`;

  return {
    subject: "Verify your ChessOx account",
    html: renderEmail({
      heading: "Email Verification",
      body: [
        "Welcome to ChessOx.",
        "Your email verification code is:",
        code,
        `This code expires in ${opts.ttlMinutes} minutes.`,
        "If you did not create this account, you can safely ignore this email.",
        "<b>Do not share this code with anyone.</b>",
      ],
    }),
  };
}

const RESET_FOOTER =
  "You received this email because a password reset was requested for your ChessOx account. " +
  "If that wasn&rsquo;t you, ignore this email &mdash; your password has not changed.";

/**
 * The password recovery email: a 6-digit code, and deliberately NO link.
 *
 * A code the reader types back into the site cannot be clicked by a mail
 * scanner, forwarded into someone else's browser, or opened in a webview
 * that has none of the session the flow needs. It also means nothing
 * sensitive travels in a URL, so the code cannot leak through browser
 * history, a Referer header or a proxy log.
 */
export function passwordResetOtpEmail(opts: { otp: string; ttlMinutes: number }) {
  // Rendered wide and spaced so it reads as one unit and survives Gmail's
  // habit of linkifying long digit runs.
  const code = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;width:100%">
      <tr><td align="center" style="padding:18px 12px;background:rgba(212,175,55,0.08);border:1px solid ${BRAND.border};border-radius:10px">
        <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;line-height:1.1;font-weight:700;letter-spacing:0.34em;color:${BRAND.gold};text-indent:0.34em">${escapeHtml(opts.otp)}</div>
      </td></tr>
    </table>`;

  return {
    subject: "ChessOx Password Reset OTP",
    html: renderEmail({
      heading: "Your password reset code",
      body: [
        "Your ChessOx password reset code is:",
        code,
        `This code expires in ${opts.ttlMinutes} minutes.`,
        "<b>Never share this code with anyone.</b> ChessOx staff will never ask you for it.",
      ],
      footnote: [
        "If you didn&rsquo;t request a password reset, ignore this email — your password has not changed.",
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
