# Authentication — registration, verification & passwords

ChessOx has **two separate credential flows** that never share a token,
a table, or a code path:

| Flow                | Entry              | Token source                    | Ends at        |
| ------------------- | ------------------ | ------------------------------- | -------------- |
| **Registration**    | `/auth` (signup)   | `pending_registrations` (ours)  | Account active |
| **Forgot password** | `/forgot-password` | Supabase Auth recovery (theirs) | Password reset |

Keeping them apart is deliberate: a registration link can never reset an
existing account's password, and a recovery link can never create one.

Backend: `supabase/schema.sql` **SECTION 103**.
Server functions: `src/lib/api/registration.functions.ts`.

---

## Registration flow

```
/auth (signup)          username + email          no password collected
   │                    registerAccount()
   ▼
pending_registrations   status: pending_verification
   │                    email: "Verify Your Chessox Account"
   ▼
/verify-email/{token}   verifyEmailToken()
   │                    status: email_verified, verified_at set
   │                    link consumed, 30-min setup grant issued
   ▼
/create-password        completeRegistration()
   │                    Supabase Auth user created (email_confirm: true)
   │                    pending row deleted
   ▼
/auth (signin)          email + password
```

### Why the auth user is created last

Creating it at registration would leave a **password-less account holding
the email address** plus a throwaway password in `auth.users` for every
abandoned signup. Staging in `pending_registrations` instead means an
abandoned attempt expires to nothing and the address stays free, and
`auth.users` only ever contains complete, verified accounts.

### Why there is no `password_hash` column

The spec's data model lists one on the user table. Supabase Auth already
owns password hashing (bcrypt) in `auth.users.encrypted_password`.
Storing a second hash would mean two sources of truth for a credential
and hand-rolling password storage — a security regression, not a feature.
Passwords are therefore sent straight to the Auth admin API at the final
step and never touch `pending_registrations`.

---

## Tokens

Two distinct tokens, both 32 random bytes (`crypto.randomBytes`)
base64url-encoded, and **stored only as SHA-256 digests**:

| Token        | TTL    | Purpose                             | Consumed by            |
| ------------ | ------ | ----------------------------------- | ---------------------- |
| Verification | 24 h   | Proves control of the inbox         | `verifyEmailToken`     |
| Setup grant  | 30 min | Authorises the create-password step | `completeRegistration` |

Properties, all enforced server-side:

- **Unique** — 256 bits of entropy per token.
- **Single-use** — a verification link issues exactly one setup grant;
  `token_consumed_at` is stamped on first use and every later attempt is
  refused. The setup grant's digest is `NULL`ed the moment it is
  consumed, before any account is created, so a double submit cannot race
  two `createUser` calls through.
- **Expiring** — checked against `token_expires_at` / `setup_expires_at`.
- **Unreadable at rest** — only digests are stored, so a database leak
  cannot be replayed as a verification.
- **Superseded on resend** — issuing a new link overwrites the old digest
  and clears any outstanding setup grant.

### Repeat clicks are answered honestly

The verification digest is **retained** after use rather than deleted, so
a second request carrying the same link still resolves to its
registration and can be told "already verified" instead of the
misleading "this link isn't valid". Completed registrations are likewise
kept (with every token blanked) until the purge job removes them.

This matters most for the commonest repeat of all — a user refreshing the
verification page. When that happens and the tab still holds the grant,
the page simply resumes at the success step rather than sending someone
to a sign-in they cannot use, because they have not chosen a password
yet. Single use is unaffected: no second grant is ever issued.

### The setup grant travels in sessionStorage, not the URL

After verification the grant is handed to `/create-password` through
`sessionStorage` (`src/lib/auth/setupHandoff.ts`). A token in a query
string leaks into browser history, the `Referer` header of any outbound
link, and most server access logs. sessionStorage is tab-scoped and
cleared on close.

Losing it is only an inconvenience — the page explains how to re-open the
link — because the grant is validated and consumed server-side regardless.

---

## Abuse controls

| Control                   | Limit                               |
| ------------------------- | ----------------------------------- |
| Register per IP           | 10 / hour                           |
| Register per email        | 5 / hour                            |
| Resend per IP / per email | 10 / hour, 5 / hour                 |
| Resend cooldown           | 60 s between emails                 |
| Hard cap per registration | 5 verification emails, then support |
| Verify attempts per IP    | 30 / 10 min                         |
| Complete attempts per IP  | 20 / 10 min                         |

`resendVerification` returns an **identical response** whether or not the
address has a pending registration, so it cannot be used to discover
which addresses are in use. (Registration itself does report "email
already exists" — that is a deliberate UX trade-off carried over from the
previous flow, since a signup form that silently fails is worse.)

Abandoned rows are removed by `purge_expired_registrations(grace_hours)`
— schedule it daily.

---

## Error handling

Every case in the spec maps to a specific screen or message:

| Case                   | Where                  | Behaviour                                 |
| ---------------------- | ---------------------- | ----------------------------------------- |
| Invalid link           | `/verify-email/$token` | "This link isn't valid" + resend form     |
| Expired link           | same                   | "This link has expired" + resend form     |
| Already verified       | same                   | "Already verified" + sign-in button       |
| Email delivery failure | `/auth`, resend        | Explicit failure, safe to retry           |
| Password mismatch      | `/create-password`     | Inline under the confirm field            |
| Weak password          | `/create-password`     | Live checklist + blocked submit           |
| Setup grant expired    | `/create-password`     | Asks for a fresh verification email       |
| No grant in this tab   | `/create-password`     | Explains to open the link in this browser |
| Server error           | all                    | Message surfaced, never a blank screen    |

---

## Email delivery

`src/lib/api/email.server.ts` is the single sender. Providers are tried in
order and the first **configured** one wins:

1. **Gmail SMTP** — `GMAIL_USER` + `GMAIL_APP_PASSWORD`
2. **EmailJS** — `EMAILJS_SERVICE_ID` + `EMAILJS_TEMPLATE_ID` + `EMAILJS_PUBLIC_KEY`
3. **Resend** — `RESEND_API_KEY` (+ optional `EMAIL_FROM`)

If a configured provider throws, the next is tried; if all fail (or none
is configured) an `EmailDeliveryError` is raised and the caller reports a
retryable failure. Templates are table-based with inline styles — the only
thing that renders reliably in Gmail, Outlook and Apple Mail.

Set **`PUBLIC_SITE_URL`** in production so verification links point at the
right origin. Without it the server falls back to the request's own
`Origin`/`Host`, which works for previews but is not something to rely on
behind a proxy.

---

## Password policy

One definition in `src/lib/auth/password.ts`, used by registration,
password reset **and** the settings Security tab — previously each screen
carried its own copy and could drift.

- 8–72 characters (72 is bcrypt's real limit)
- one uppercase, one lowercase, one number, one special character

`passwordSchema` re-validates server-side on every write; the client
checklist is feedback only and is never trusted.

---

## Database

`public.pending_registrations` — RLS enabled with **zero policies**, so
anon and authenticated are denied outright. Only the service-role server
(which bypasses RLS) touches it; it is never queried from the browser.

| Column                                 | Purpose                                                |
| -------------------------------------- | ------------------------------------------------------ |
| `id`, `email`, `username`              | Identity of the in-flight registration                 |
| `status`                               | pending_verification / email_verified / completed      |
| `email_verified`, `verified_at`        | Verification state and date                            |
| `token_hash`, `token_expires_at`       | Verification link                                      |
| `token_consumed_at`                    | Enforces single use; retained so repeat clicks resolve |
| `setup_token_hash`, `setup_expires_at` | Create-password grant                                  |
| `send_count`, `last_sent_at`           | Resend cap and cooldown                                |
| `created_at`                           | Registration date                                      |

Helper RPCs (service-role only): `is_email_registered`,
`is_username_taken` (checks profiles **and** in-flight registrations),
`purge_expired_registrations`.

---

## Migrating from the OTP flow

SECTION 78's `email_otp_verifications` is no longer read or written.
It is **deliberately left in place** rather than dropped so that deploying
SECTION 103 cannot destroy an in-flight OTP or require a coordinated
rollout. Drop it manually once no old build is serving traffic:

```sql
DROP TABLE IF EXISTS public.email_otp_verifications;
```

`is_email_registered()` is still used by the new flow and stays.

---

## Testing

`src/lib/auth/password.test.ts` (13) and `setupHandoff.test.ts` (5) cover
the pure logic: every policy rule in isolation, schema/helper agreement,
strength never over-reporting a failing password, username and email
normalisation, and handoff parsing that returns `null` rather than
throwing on malformed storage.

The server functions are **not** unit-tested — they need a live Supabase
project and an email provider. Verify manually against staging:

1. Sign up → a `pending_registrations` row appears, email arrives.
2. Open the link → success page; the row shows `email_verified = true`
   and `token_consumed_at` set.
3. **Refresh that page** → it stays on the success step (the tab still
   holds the grant), _not_ an error.
4. Open the same link in a **new tab** → "Already verified", offering
   sign-in plus a resend (single use holds — no second grant is issued).
5. Set a password → `auth.users` row appears, pending row flips to
   `completed` with all tokens blanked.
6. Open the link again → "Already verified".
7. Sign in with the new password.
8. Resend twice inside a minute → the cooldown message appears.
