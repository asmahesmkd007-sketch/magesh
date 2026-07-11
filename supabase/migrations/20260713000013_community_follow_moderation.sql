-- =====================================================================
-- MIGRATION 20260713000013: COMMUNITY FOLLOW / MODERATION TABLES
-- =====================================================================
-- Fixes AUDIT_REPORT.md MEDIUM finding #5. src/lib/api/communityClient.ts and
-- src/routes/community.bookmarks.tsx reference six tables that do not exist
-- anywhere in schema.sql or migrations: community_blocks, community_bookmarks,
-- community_follows, community_hidden_posts, community_mutes,
-- community_reports. Core posting (community_posts/community_reactions/
-- community_comments/community_saved_posts) already exists and is untouched.
-- Note: community_bookmarks (with a `collection` label, used by the bookmarks
-- page) is functionally close to the existing community_saved_posts but is a
-- distinct, already-referenced table in the frontend — added as-is rather
-- than silently repointing callers at community_saved_posts.
--
-- This migration only creates tables + RLS. The RPCs communityClient.ts calls
-- against these tables (community_toggle_follow, community_toggle_bookmark,
-- admin_resolve_report, etc.) beyond what's implemented here are a larger,
-- separate gap — see the Fix Pass 2 note in AUDIT_REPORT.md.
-- =====================================================================

-- ---------------------------------------------------------------------
-- community_follows
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_follows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_community_follows_follower ON public.community_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_community_follows_following ON public.community_follows(following_id);

GRANT SELECT, INSERT, DELETE ON public.community_follows TO authenticated;
GRANT ALL ON public.community_follows TO service_role;
ALTER TABLE public.community_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view follows" ON public.community_follows;
CREATE POLICY "Anyone can view follows"
  ON public.community_follows FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users manage own follows" ON public.community_follows;
CREATE POLICY "Users manage own follows"
  ON public.community_follows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users remove own follows" ON public.community_follows;
CREATE POLICY "Users remove own follows"
  ON public.community_follows FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

-- ---------------------------------------------------------------------
-- community_bookmarks (labelled collections; distinct from community_saved_posts)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_bookmarks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  collection TEXT NOT NULL DEFAULT 'Favorites',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_community_bookmarks_user ON public.community_bookmarks(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_bookmarks TO authenticated;
GRANT ALL ON public.community_bookmarks TO service_role;
ALTER TABLE public.community_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own bookmarks" ON public.community_bookmarks;
CREATE POLICY "Users manage own bookmarks"
  ON public.community_bookmarks FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- community_hidden_posts ("hide this post for me")
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_hidden_posts (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

GRANT SELECT, INSERT, DELETE ON public.community_hidden_posts TO authenticated;
GRANT ALL ON public.community_hidden_posts TO service_role;
ALTER TABLE public.community_hidden_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own hidden posts" ON public.community_hidden_posts;
CREATE POLICY "Users manage own hidden posts"
  ON public.community_hidden_posts FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- community_mutes (mute another user's content without blocking)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_mutes (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, muted_id),
  CHECK (user_id <> muted_id)
);

GRANT SELECT, INSERT, DELETE ON public.community_mutes TO authenticated;
GRANT ALL ON public.community_mutes TO service_role;
ALTER TABLE public.community_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own mutes" ON public.community_mutes;
CREATE POLICY "Users manage own mutes"
  ON public.community_mutes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- community_blocks (block another user)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_blocks (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_id),
  CHECK (user_id <> blocked_id)
);

GRANT SELECT, INSERT, DELETE ON public.community_blocks TO authenticated;
GRANT ALL ON public.community_blocks TO service_role;
ALTER TABLE public.community_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own blocks" ON public.community_blocks;
CREATE POLICY "Users manage own blocks"
  ON public.community_blocks FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- community_reports (post/comment/user reports within the community feature,
-- distinct from the platform-wide public.reports table)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
  target_id   UUID NOT NULL,
  reason      TEXT NOT NULL,
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_community_reports_status ON public.community_reports(status, created_at DESC);

GRANT SELECT, INSERT ON public.community_reports TO authenticated;
GRANT ALL ON public.community_reports TO service_role;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own reports or admins view all" ON public.community_reports;
CREATE POLICY "Users view own reports or admins view all"
  ON public.community_reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users insert own reports" ON public.community_reports;
CREATE POLICY "Users insert own reports"
  ON public.community_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- ---------------------------------------------------------------------
-- RPC: admin_resolve_report(p_report_id, p_status) — pairs with
-- community_reports, called from communityClient.ts resolveReport()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id UUID,
  p_status    TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_status NOT IN ('resolved', 'dismissed', 'open') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.community_reports SET
    status      = p_status,
    resolved_by = CASE WHEN p_status = 'open' THEN NULL ELSE auth.uid() END,
    resolved_at = CASE WHEN p_status = 'open' THEN NULL ELSE now() END
  WHERE id = p_report_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_resolve_report(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(UUID, TEXT) TO authenticated, service_role;
