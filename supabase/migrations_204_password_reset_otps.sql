-- Standalone extract of SECTION 204 from schema_part6.sql — paste into the
-- Supabase SQL Editor. Idempotent: safe to run more than once.

-- SECTION 204: PASSWORD RESET — EMAIL OTP (2026-08-12)
-- ---------------------------------------------------------------------
-- Replaces the emailed recovery LINK with a 6-digit code the user types
-- back into the site. Supabase Auth's own recovery mailer is not used at
-- all; the code is generated, hashed and verified here, and the password
-- write goes through the Auth admin API at the end.
--
-- This table is deliberately separate from `pending_registrations`
-- (SECTION 103): a registration grant can never reset an existing
-- account's password, and a reset code can never create one. It is also
-- separate from the deprecated `email_otp_verifications` (SECTION 78),
-- which is a signup artefact with no user_id and no consumption record.
--
-- Security properties, all enforced server-side:
--   * Only an HMAC-SHA256 DIGEST of the code is stored — a database leak
--     cannot be replayed, and 6 digits is far too small a space to store
--     as a bare hash (the pepper is what makes the digest unguessable).
--   * One row per email (PRIMARY KEY), so issuing a code atomically
--     invalidates the previous one — there is never a second live code.
--   * attempts/max_attempts cap brute force at 5 wrong guesses.
--   * consumed_at makes verification single-use; a consumed row can never
--     be verified again.
--   * The reset AUTHORISATION issued on success is itself a hashed,
--     expiring, single-use token — it is not the OTP, and it is cleared
--     the moment the password is written.
--   * last_sent_at is the server-authoritative resend cooldown. It is
--     written only after an email is actually accepted by a provider, so
--     a delivery failure never starts a cooldown.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.password_reset_otps (
  -- One in-flight reset per address. Re-requesting overwrites the row,
  -- which is exactly the "a new OTP invalidates the previous one" rule.
  email           TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- HMAC-SHA256(code, OTP_HASH_SECRET). Never the code itself.
  otp_hash        TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  consumed_at     TIMESTAMPTZ,
  -- SHA-256 of the post-verification reset authorisation (not the OTP).
  auth_hash       TEXT,
  auth_expires_at TIMESTAMPTZ,
  last_sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_expires_at
  ON public.password_reset_otps (expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user_id
  ON public.password_reset_otps (user_id);
-- The reset step looks a row up by authorisation digest alone.
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_otps_auth_hash
  ON public.password_reset_otps (auth_hash) WHERE auth_hash IS NOT NULL;

-- RLS on with ZERO policies: anon and authenticated are denied outright.
-- Only the service-role server (which bypasses RLS) touches this table;
-- it is never queried from the browser.
ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;

-- 204.1  Housekeeping — drop rows that can no longer do anything.
CREATE OR REPLACE FUNCTION public.purge_expired_password_reset_otps(p_grace_hours INT DEFAULT 24)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.password_reset_otps
  WHERE created_at < now() - (p_grace_hours || ' hours')::INTERVAL
     OR (consumed_at IS NOT NULL AND consumed_at < now() - INTERVAL '1 hour');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;
REVOKE ALL ON FUNCTION public.purge_expired_password_reset_otps(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_password_reset_otps(INT) TO service_role;

-- 204.2  Force-logout after a password change.
-- Deleting the GoTrue session rows is what actually invalidates tokens
-- already issued to other devices; clearing public.user_sessions releases
-- the single-device lock so the next sign-in is not refused as
-- ALREADY_LOGGED_IN. Each step is guarded so a GoTrue schema difference
-- degrades to a partial revoke instead of failing the password reset.
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sessions INTEGER := 0;
  v_lock     INTEGER := 0;
BEGIN
  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::TEXT;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    DELETE FROM auth.sessions WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_sessions = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    UPDATE public.user_sessions
    SET is_active = false, updated_at = now()
    WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_lock = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('sessions_deleted', v_sessions, 'locks_released', v_lock);
END;
$fn$;
REVOKE ALL ON FUNCTION public.revoke_user_sessions(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(UUID) TO service_role;

SELECT
  CASE WHEN to_regclass('public.password_reset_otps') IS NOT NULL
       THEN 'ok' ELSE 'MISSING' END                       AS password_reset_otps,
  CASE WHEN to_regproc('public.purge_expired_password_reset_otps') IS NOT NULL
       THEN 'ok' ELSE 'MISSING' END                       AS purge_password_reset_otps,
  CASE WHEN to_regproc('public.revoke_user_sessions') IS NOT NULL
       THEN 'ok' ELSE 'MISSING' END                       AS revoke_user_sessions;
