# Authentication — registration, verification & passwords

ChessOx has **two separate credential flows** that never share a token,
a table, or a code path:

| Flow                | Entry              | Credential                       | Ends at        |
| ------------------- | ------------------ | -------------------------------- | -------------- |
| **Registration**    | `/auth` (signup)   | emailed **link** (ours)          | Account active |
| **Forgot password** | `/forgot-password` | emailed **6-digit code** (ours)  | Password reset |

Keeping them apart is deliberate: a registration link can never reset an
existing account's password, and a reset code can never create one. They
share no token, no table and no code path.

Backend: `supabase/schema.sql` **SECTION 103** (registration),
`supabase/schema_part6.sql` **SECTION 204** (reset).
Server functions: `src/lib/api/registration.functions.ts`,
`src/lib/api/passwordReset.functions.ts`.

**Both flows send their own email.** Supabase's built-in mailer is not
configured on this project and nothing depends on it — see
[Password recovery flow](#password-recovery-flow).

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

## Password recovery flow

A 6-digit code, typed back into the site. **No reset link is ever sent.**

```
/forgot-password        email only
   │                    requestPasswordResetOtp()
   │                    ├─ no account   → nothing sent, same reply, same delay
   │                    ├─ Google-only  → "use Google Sign-In" email, no code
   │                    └─ has password → 6-digit code emailed
   ▼
/verify-reset-otp       verifyPasswordResetOtp(email, code)
   │                    OTP consumed, single-use reset grant issued
   │                    grant handed on in sessionStorage (never the URL)
   ▼
/reset-password         resetPasswordWithAuth(grant, password)
   │                    admin.updateUserById() → revoke_user_sessions()
   ▼
/auth (signin)          email + new password
```

Backend: `supabase/schema_part6.sql` **SECTION 204**.
Server functions: `src/lib/api/passwordReset.functions.ts`.
Rules (unit-tested, no I/O): `src/lib/auth/otpPolicy.ts`.

### Why a code and not a link

A link has to survive being clicked, and the places it gets clicked are
hostile: mail scanners follow links before the human does, phones open
them in a webview that shares nothing with the browser that asked, and the
token rides in a URL that lands in history, `Referer` headers and proxy
logs. A code the reader types has none of those failure modes, and the
tab that started the flow is the tab that finishes it.

Supabase's recovery mailer is not used, and neither is
`resetPasswordForEmail()`. Supabase Auth still owns the password hash —
the new password is written through `admin.updateUserById` and nowhere
else — but the code itself is minted, hashed and checked here, and
delivered by `email.server.ts`, the same sender as every other ChessOx
email.

### The code

| Property   | Value                                                    |
| ---------- | -------------------------------------------------------- |
| Shape      | exactly 6 digits, `crypto.randomInt` (rejection-sampled)  |
| Lifetime   | 5 minutes                                                 |
| Attempts   | 5 wrong guesses, then the code is dead                    |
| Storage    | **HMAC-SHA256 digest only**, peppered with `OTP_HASH_SECRET` |
| Uniqueness | one row per email — a new code invalidates the old one    |

A plain SHA-256 of a 6-digit number is reversible in a million guesses, so
the pepper is what makes the stored digest useless on its own. The
address is bound into the digest too, so a hash cannot be lifted from one
row and replayed against another. Comparison is `timingSafeEqual`.

The code is never logged, never returned by any endpoint, never placed in
a URL, and never written to client storage.

`classifyOtp()` rejects consumed, attempt-exhausted and expired rows
**before** the digest is compared, in that order — so a spent code can
never be revived by guessing it correctly.

### The reset grant

Verifying the code consumes it and issues a separate authorisation: 32
random bytes, stored as a SHA-256 digest, valid 10 minutes, single-use.
It is spent (`auth_hash` nulled) *before* the password write, so two
concurrent submits cannot both land — the second is a lookup miss.

It travels to `/reset-password` in **sessionStorage**, like the
registration setup grant (see `setupHandoff.ts`): tab-scoped, cleared on
close, and never in a URL. Not localStorage, which would outlive the tab
and sit on disk.

### Enumeration, including by clock

Registered, unregistered and Google addresses all get the same reply.
Sending an email costs hundreds of milliseconds and skipping it costs
nothing, so every public path is also padded to a common floor
(`MIN_RESPONSE_MS`) — otherwise response *time* answers the question the
response body refuses to. The Google-only path writes a born-spent row
(already expired, already consumed) purely so its cooldown behaves like
every other address's.

### Throttling: a cooldown is not a rate limit

| Control             | Key                   | Limit  | Spent when          |
| ------------------- | --------------------- | ------ | ------------------- |
| Request per IP      | `pwotp-ip:*`          | 15 / h | every attempt       |
| Request per email   | `pwotp-email:*`       | 5 / h  | every attempt       |
| Verify per IP       | `pwotp-verify-ip:*`   | 30 / 10 min | every attempt  |
| Reset per IP        | `pwotp-reset-ip:*`    | 20 / 10 min | every attempt  |
| Resend cooldown     | `last_sent_at` column | 60 s   | **only on success** |

The caps exist to stop hammering, so a failing request should spend one.
The cooldown exists to space out *emails that actually went out*, so a
request that failed has nothing to space out.

This distinction was a real bug once: implementing the cooldown as
`rateLimit({ limit: 1 })` spent the window when the request *started*, so
a failed delivery still burnt it and the retry was answered "please wait"
instead of showing the real error. The cooldown now lives in
`password_reset_otps.last_sent_at`, written only after a provider accepts
the message — which also makes it server-authoritative across restarts
and multiple instances, where an in-memory map is neither.

Hence the send ordering in `requestPasswordResetOtp`: **send first,
persist after.** Writing the row first would overwrite a code the user may
still be holding and start a cooldown, both on the strength of a send
that might fail.

### Google accounts

A Google account has no password to reset, and minting one would fork a
single identity into two ways to sign in — which `registerAccount`
already treats as a conflict. Those addresses get an email explaining to
use **Continue with Google**. An account with both a Google identity and
a password gets a normal code. Rules in `src/lib/auth/recoveryPolicy.ts`.

### Recovery never trips the device lock

The OTP flow establishes **no Supabase session at all** — there is no
recovery session to be mistaken for a second device, which is what made
the old link flow fragile. `/verify-reset-otp` and `/reset-password` also
call `suppressSessionLock()` while open, so even a user who is already
signed in on that device cannot be signed out mid-reset.

After the password is written, `revoke_user_sessions()` deletes the
GoTrue session rows for that user *and* releases the `user_sessions`
lock. Both matter: without the first, other devices keep working with the
old password's tokens; without the second, the next sign-in is refused as
`ALREADY_LOGGED_IN` because the signed-out device keeps heartbeating its
claim alive.

### What must be true to deploy this

**Database** — `SECTION 204` must be applied (`password_reset_otps`,
`purge_expired_password_reset_otps`, `revoke_user_sessions`). Without the
table every request fails; the flow does not silently degrade.

**Environment** — `SUPABASE_SERVICE_ROLE_KEY`, `OTP_HASH_SECRET` (falls
back to the service key, but set a dedicated value so rotating one does
not invalidate the other), and a working mail provider. Nothing in this
flow depends on Site URL, the Redirect URLs allow-list, Supabase SMTP or
any Supabase email template.

Schedule `purge_expired_password_reset_otps(24)` daily alongside
`purge_expired_registrations`.

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

`src/lib/api/email.server.ts` is the single sender for every message the
app produces — signup verification code, resend, welcome, password-reset
code and the Google-account reset notice. **Email only**: this project
sends no SMS, WhatsApp, voice or phone codes.

One provider, the **Resend HTTP API** over HTTPS via native `fetch`:

| Variable          | Required | Notes                                              |
| ----------------- | -------- | -------------------------------------------------- |
| `RESEND_API_KEY`  | yes      | **Secret, server-only.** Never a `VITE_*` name.     |
| `EMAIL_FROM`      | yes      | `ChessOx <noreply@your-verified-domain>`            |

`EMAIL_FROM` must sit on a domain verified at resend.com/domains.
`email.server.ts` refuses two classes of sender up front, with an
explanatory error, rather than letting them fail per-recipient at send
time: Resend's sandbox `onboarding@resend.dev` (which delivers only to
the Resend account owner) and consumer mailboxes such as `@gmail.com`
whose DNS you cannot control.

### Why HTTP and not SMTP

The sender used to try Gmail SMTP, then EmailJS, then Resend. That chain
is exactly how signup codes went missing: each provider failed for its
own reason, the failures were swallowed in turn, and outside production
the final step **returned as if the mail had been sent**, printing the
code to the server console. The caller, told the send succeeded, moved
the user to the "enter your code" screen for a code that never left.

On a managed host (Railway, Vercel, Render) an HTTPS API also has no
outbound SMTP port to be blocked, rate-limited or null-routed, and it
reports acceptance synchronously. Gmail SMTP additionally capped at
~500/day and could only send from a `@gmail.com` address.

There is **no fallback provider and no dev-mode shortcut**. A normal
return from `sendMail()` means Resend answered 2xx; anything else throws
`EmailDeliveryError` and the caller reports a retryable failure. The OTP
flows depend on that distinction — a failed send must not start a resend
cooldown.

Templates are table-based with inline styles — the only thing that
renders reliably in Gmail, Outlook and Apple Mail.

Set **`PUBLIC_SITE_URL`** in production so verification links point at the
right origin. Without it the server falls back to the request's own
`Origin`/`Host`, which works for previews but is not something to rely on
behind a proxy. One definition, in
`src/lib/api/siteOrigin.server.ts` — a second copy is how a link ends up
pointing at localhost in production.

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

`recoveryPolicy.test.ts` (7) covers the recovery decision: unknown
addresses stay silent even when they look federated, Google-only accounts
are notified rather than reset, and an account holding a real password is
always sent a code. `otpPolicy.test.ts` (24) covers the OTP lifecycle in
isolation: replay, expiry, consumption, the 5-attempt cap, the ordering
that stops a spent code being revived, grant validity, cooldown
arithmetic and code shape. `sessionLock.test.ts` (13) additionally covers
the suppression toggle and releasing a lock without knowing its session
id.

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

Password recovery, likewise against a real project (it needs SECTION 204
applied, the service role key, `OTP_HASH_SECRET` and a mail provider):

1. `/forgot-password` with a registered address → the OTP page, and a
   "ChessOx Password Reset OTP" email arrives from the ChessOx sender
   (not `supabase.io`). It contains a code and **no link**.
2. Submit an address with **no** account → the same page, no email, and
   visibly the same delay. A noticeably faster answer means the response
   padding has regressed into an enumeration oracle.
3. Enter a wrong code five times → "no longer valid", and the correct
   code is refused afterwards too.
4. Request a new code → the previous code stops working immediately.
5. Resend inside 60 s → "Resend in Ns" with a real countdown; the button
   re-enables on its own.
6. **Leave the OTP page open past 5 minutes** → "Code expired", and the
   correct code is refused.
7. Enter the right code → `/reset-password`. Reload that page → the form
   survives (sessionStorage); open it in a **new tab** → "Verification
   needed first".
8. Set a new password → success, redirected to sign in. Sign in with it.
9. Old password is refused. Other devices are signed out.
10. Going back and re-submitting the same grant → "no longer valid".
11. A Google-only address → the "use Google Sign-In" email, no code, and
    Google sign-in still works.
12. On a phone: the six boxes fit without horizontal scroll, the numeric
    keypad opens, and pasting a code from the mail app fills the row.
