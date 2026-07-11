-- =====================================================================
-- MIGRATION 20260713000012: PLATFORM REPORTS (bug / fair-play / abuse)
-- =====================================================================
-- Fixes AUDIT_REPORT.md MEDIUM finding #9. src/routes/report.tsx inserts
-- directly into public.reports; src/routes/admin.reports.tsx selects from it
-- and calls public.admin_resolve_platform_report(p_report_id, p_status).
-- This is a distinct, simpler table from the community-specific
-- public.community_reports created in the companion community migration —
-- report.tsx covers user/post/comment/game/bug reports platform-wide, not
-- just community posts.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('player', 'issue')),
  issue_type    TEXT NOT NULL, -- 'user' | 'post' | 'comment' | 'game' (free-form target category from the UI)
  reported_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason        TEXT,
  description   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  resolved_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);

GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own reports or admins view all" ON public.reports;
CREATE POLICY "Users view own reports or admins view all"
  ON public.reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users insert own reports" ON public.reports;
CREATE POLICY "Users insert own reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- ---------------------------------------------------------------------
-- RPC: admin_resolve_platform_report(p_report_id, p_status)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_platform_report(
  p_report_id UUID,
  p_status    TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_status NOT IN ('resolved', 'ignored') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.reports SET
    status      = p_status,
    resolved_by = auth.uid(),
    resolved_at = now()
  WHERE id = p_report_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_resolve_platform_report(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_platform_report(UUID, TEXT) TO authenticated, service_role;
