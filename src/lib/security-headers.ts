// Security headers applied to every server response. Kept in one place so the
// policy is auditable and consistent. Framing/CSP restrictions are only enforced
// in production so they don't interfere with the Lovable/dev preview iframe.

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy tuned for this stack:
//   - Supabase REST + Realtime (https/wss to *.supabase.co)
//   - Google Fonts (styles from googleapis, fonts from gstatic)
//   - Inline styles (Tailwind) and the framework's hydration script
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function applySecurityHeaders(response: Response): Response {
  const h = response.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-XSS-Protection", "0"); // modern browsers rely on CSP; legacy filter off
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");

  if (isProd) {
    h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    h.set("X-Frame-Options", "DENY");
    h.set("Content-Security-Policy", CSP);
  }
  return response;
}
