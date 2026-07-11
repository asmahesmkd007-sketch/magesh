-- =====================================================================
-- MIGRATION 20260713000014: ABOUT / POLICIES / FEEDBACK CMS TABLES
-- =====================================================================
-- Fixes AUDIT_REPORT.md MEDIUM finding #8. src/lib/api/aboutClient.ts,
-- src/lib/api/policyClient.ts, and src/lib/api/feedbackClient.ts each
-- reference a table that does not exist in schema.sql or migrations
-- (about_articles, policies + policy_versions, feedbacks). All three
-- clients already degrade gracefully to localStorage when the table is
-- missing, so this was non-fatal, but adding the real tables lets content
-- persist server-side and sync across devices/admins as intended.
-- =====================================================================

-- ---------------------------------------------------------------------
-- about_articles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.about_articles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  content      TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT '',
  tags         TEXT[] NOT NULL DEFAULT '{}',
  author_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_about_articles_sort ON public.about_articles(sort_order, created_at DESC);

GRANT SELECT ON public.about_articles TO anon, authenticated;
GRANT ALL ON public.about_articles TO service_role;
ALTER TABLE public.about_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published articles are public, admins see all" ON public.about_articles;
CREATE POLICY "Published articles are public, admins see all"
  ON public.about_articles FOR SELECT
  USING (is_published OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage articles" ON public.about_articles;
CREATE POLICY "Admins manage articles"
  ON public.about_articles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update articles" ON public.about_articles;
CREATE POLICY "Admins update articles"
  ON public.about_articles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete articles" ON public.about_articles;
CREATE POLICY "Admins delete articles"
  ON public.about_articles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_about_articles_updated_at ON public.about_articles;
CREATE TRIGGER trg_about_articles_updated_at
  BEFORE UPDATE ON public.about_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- policies + policy_versions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.policies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_type  TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  author_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  version      INT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.policies TO anon, authenticated;
GRANT ALL ON public.policies TO service_role;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published policies are public, admins see all" ON public.policies;
CREATE POLICY "Published policies are public, admins see all"
  ON public.policies FOR SELECT
  USING (is_published OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage policies" ON public.policies;
CREATE POLICY "Admins manage policies"
  ON public.policies FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update policies" ON public.policies;
CREATE POLICY "Admins update policies"
  ON public.policies FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete policies" ON public.policies;
CREATE POLICY "Admins delete policies"
  ON public.policies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_policies_updated_at ON public.policies;
CREATE TRIGGER trg_policies_updated_at
  BEFORE UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.policy_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id  UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  version    INT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  author_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON public.policy_versions(policy_id, version DESC);

GRANT SELECT ON public.policy_versions TO authenticated;
GRANT ALL ON public.policy_versions TO service_role;
ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view policy history" ON public.policy_versions;
CREATE POLICY "Admins view policy history"
  ON public.policy_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins insert policy history" ON public.policy_versions;
CREATE POLICY "Admins insert policy history"
  ON public.policy_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- feedbacks
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feedbacks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating     INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON public.feedbacks(created_at DESC);

GRANT SELECT, INSERT ON public.feedbacks TO authenticated;
GRANT ALL ON public.feedbacks TO service_role;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view all feedback" ON public.feedbacks;
CREATE POLICY "Admins view all feedback"
  ON public.feedbacks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users submit feedback" ON public.feedbacks;
CREATE POLICY "Users submit feedback"
  ON public.feedbacks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
