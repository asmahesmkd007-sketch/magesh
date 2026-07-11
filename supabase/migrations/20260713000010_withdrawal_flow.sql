-- =====================================================================
-- MIGRATION 20260713000010: WITHDRAWAL / BANK-DETAILS FLOW
-- =====================================================================
-- Fixes AUDIT_REPORT.md HIGH finding #7. Frontend (src/hooks/useBankDetails.ts,
-- src/hooks/useWithdrawal.ts, src/routes/wallet.tsx, wallet.bank.tsx,
-- admin.withdrawals.tsx) expects:
--   table  public.bank_details          (NOT the existing public.bank_accounts)
--   rpc    public.save_bank_details(...)
--   table  public.withdrawal_requests
--   rpc    public.submit_withdrawal_request(p_amount)
--   rpc    public.cancel_withdrawal_request(p_request_id)
--   rpc    public.admin_approve_withdrawal(p_request_id)
--   rpc    public.admin_reject_withdrawal(p_request_id, p_reason)
--   rpc    public.admin_get_withdrawal_requests(p_status)
-- None of these exist in schema.sql or prior migrations (public.bank_accounts /
-- public.save_bank_account from SECTION 63 are a different, unused pair — left
-- untouched). This migration adds the missing pieces additively.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ---------------------------------------------------------------------
-- 1. bank_details table (one row per user; matches useBankDetails.ts shape)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_details (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  account_holder_name       TEXT NOT NULL,
  account_number_encrypted  TEXT NOT NULL,
  account_number_last4      TEXT NOT NULL,
  ifsc_code                 TEXT NOT NULL,
  bank_name                 TEXT NOT NULL,
  branch_name               TEXT NOT NULL,
  branch_address            TEXT NOT NULL,
  account_type              TEXT NOT NULL CHECK (account_type IN ('savings', 'current')),
  verification_status       TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('verified', 'failed', 'pending')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bank_details TO authenticated;
GRANT ALL ON public.bank_details TO service_role;
ALTER TABLE public.bank_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own bank details" ON public.bank_details;
CREATE POLICY "Users can view their own bank details"
  ON public.bank_details FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_bank_details_updated_at ON public.bank_details;
CREATE TRIGGER trg_bank_details_updated_at
  BEFORE UPDATE ON public.bank_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- No direct INSERT/UPDATE from client — encryption happens in the RPC below.
CREATE OR REPLACE FUNCTION public.save_bank_details(
  p_account_holder_name TEXT,
  p_account_number      TEXT,
  p_ifsc_code           TEXT,
  p_bank_name           TEXT,
  p_branch_name         TEXT,
  p_branch_address      TEXT,
  p_account_type        TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_secret    TEXT := 'chessox_secret_key_123!'; -- matches SECTION 63 convention; move to vault in prod
  v_last4     TEXT;
  v_encrypted TEXT;
  v_id        UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF length(p_account_number) < 4 THEN
    RAISE EXCEPTION 'Account number too short';
  END IF;

  v_last4 := right(p_account_number, 4);
  v_encrypted := pgp_sym_encrypt(p_account_number, v_secret);

  INSERT INTO public.bank_details (
    user_id, account_holder_name, account_number_encrypted, account_number_last4,
    ifsc_code, bank_name, branch_name, branch_address, account_type, verification_status
  ) VALUES (
    v_uid, p_account_holder_name, v_encrypted, v_last4,
    p_ifsc_code, p_bank_name, p_branch_name, p_branch_address, p_account_type, 'verified'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    account_holder_name      = EXCLUDED.account_holder_name,
    account_number_encrypted = EXCLUDED.account_number_encrypted,
    account_number_last4     = EXCLUDED.account_number_last4,
    ifsc_code                = EXCLUDED.ifsc_code,
    bank_name                = EXCLUDED.bank_name,
    branch_name              = EXCLUDED.branch_name,
    branch_address           = EXCLUDED.branch_address,
    account_type             = EXCLUDED.account_type,
    verification_status      = 'verified',
    updated_at                = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.save_bank_details(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_bank_details(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. withdrawal_requests table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_details_id  UUID NOT NULL REFERENCES public.bank_details(id) ON DELETE RESTRICT,
  amount           INT NOT NULL CHECK (amount > 0),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  reject_reason    TEXT,
  admin_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  wallet_tx_id     UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  refund_tx_id     UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user ON public.withdrawal_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests(status);

GRANT SELECT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Users view own withdrawal requests"
  ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_withdrawal_requests_updated_at ON public.withdrawal_requests;
CREATE TRIGGER trg_withdrawal_requests_updated_at
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'withdrawal_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawal_requests;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. RPC: submit_withdrawal_request(p_amount) — escrows funds immediately
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_withdrawal_request(p_amount INT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_wallet  RECORD;
  v_bank    RECORD;
  v_new_bal INT;
  v_tx_id   UUID;
  v_req_id  UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;

  SELECT * INTO v_bank FROM public.bank_details WHERE user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Add your bank details before requesting a withdrawal'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.withdrawal_requests WHERE user_id = v_uid AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending withdrawal request';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_wallet.balance < p_amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  v_new_bal := v_wallet.balance - p_amount;

  UPDATE public.wallets SET
    balance     = v_new_bal,
    total_spent = total_spent + p_amount,
    updated_at  = now()
  WHERE user_id = v_uid;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  VALUES
    (v_uid, 'withdrawal_request', -p_amount, v_new_bal, 'Withdrawal request submitted', NULL)
  RETURNING id INTO v_tx_id;

  INSERT INTO public.withdrawal_requests (user_id, bank_details_id, amount, status, wallet_tx_id)
  VALUES (v_uid, v_bank.id, p_amount, 'pending', v_tx_id)
  RETURNING id INTO v_req_id;

  UPDATE public.wallet_transactions SET reference_id = v_req_id::text WHERE id = v_tx_id;

  RETURN v_req_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.submit_withdrawal_request(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_withdrawal_request(INT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. RPC: cancel_withdrawal_request(p_request_id) — user-initiated, refunds
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_withdrawal_request(p_request_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_req     RECORD;
  v_wallet  RECORD;
  v_new_bal INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_req FROM public.withdrawal_requests
    WHERE id = p_request_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Only pending requests can be cancelled'; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
  v_new_bal := v_wallet.balance + v_req.amount;

  UPDATE public.wallets SET
    balance      = v_new_bal,
    total_earned = total_earned + v_req.amount,
    updated_at   = now()
  WHERE user_id = v_uid;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  VALUES
    (v_uid, 'withdrawal_cancelled', v_req.amount, v_new_bal, 'Withdrawal request cancelled', p_request_id::text);

  UPDATE public.withdrawal_requests SET
    status       = 'cancelled',
    processed_at = now()
  WHERE id = p_request_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.cancel_withdrawal_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal_request(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. RPC: admin_approve_withdrawal(p_request_id) — admin marks transferred
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_withdrawal(p_request_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req RECORD;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Only pending requests can be approved'; END IF;

  UPDATE public.withdrawal_requests SET
    status       = 'completed',
    admin_id     = v_uid,
    processed_at = now()
  WHERE id = p_request_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_approve_withdrawal(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_withdrawal(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. RPC: admin_reject_withdrawal(p_request_id, p_reason) — refunds user
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal(p_request_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_req     RECORD;
  v_wallet  RECORD;
  v_new_bal INT;
  v_tx_id   UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Only pending requests can be rejected'; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_req.user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id) VALUES (v_req.user_id);
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_req.user_id FOR UPDATE;
  END IF;

  v_new_bal := v_wallet.balance + v_req.amount;

  UPDATE public.wallets SET
    balance      = v_new_bal,
    total_earned = total_earned + v_req.amount,
    updated_at   = now()
  WHERE user_id = v_req.user_id;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  VALUES
    (v_req.user_id, 'withdrawal_rejected', v_req.amount, v_new_bal,
     COALESCE('Withdrawal rejected: ' || p_reason, 'Withdrawal rejected'), p_request_id::text)
  RETURNING id INTO v_tx_id;

  UPDATE public.withdrawal_requests SET
    status        = 'rejected',
    reject_reason = p_reason,
    admin_id      = v_uid,
    refund_tx_id  = v_tx_id,
    processed_at  = now()
  WHERE id = p_request_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_reject_withdrawal(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_withdrawal(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. RPC: admin_get_withdrawal_requests(p_status) — joined admin view
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_withdrawal_requests(p_status TEXT DEFAULT NULL)
RETURNS TABLE (
  id             UUID,
  user_id        UUID,
  username       TEXT,
  display_name   TEXT,
  amount         INT,
  bank_name      TEXT,
  account_last4  TEXT,
  ifsc_code      TEXT,
  status         TEXT,
  reject_reason  TEXT,
  admin_id       UUID,
  created_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ,
  processed_at   TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    wr.id,
    wr.user_id,
    COALESCE(p.username, ''),
    COALESCE(p.display_name, ''),
    wr.amount,
    bd.bank_name,
    bd.account_number_last4,
    bd.ifsc_code,
    wr.status,
    wr.reject_reason,
    wr.admin_id,
    wr.created_at,
    wr.updated_at,
    wr.processed_at
  FROM public.withdrawal_requests wr
  JOIN public.bank_details bd ON bd.id = wr.bank_details_id
  LEFT JOIN public.profiles p ON p.id = wr.user_id
  WHERE p_status IS NULL OR wr.status = p_status
  ORDER BY wr.created_at DESC;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_get_withdrawal_requests(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_withdrawal_requests(TEXT) TO authenticated, service_role;
