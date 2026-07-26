-- =====================================================================
-- Public read access for PUBLISHED policy / news / about content
-- ---------------------------------------------------------------------
-- STATUS: NOT APPLIED. Review, then run in the Supabase SQL editor.
--
-- PROBLEM
-- Signed-out visitors cannot read any published policy, news article or
-- about article. Every such request fails with:
--
--     42501: permission denied for function has_role
--
-- Cause: the SELECT policies are written as
--
--     USING (is_published OR public.has_role(auth.uid(), 'admin'))
--
-- with no TO clause, so they also apply to the `anon` role. Line 129 of
-- schema.sql deliberately revokes EXECUTE on has_role from anon:
--
--     REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role)
--       FROM PUBLIC, anon;
--
-- so when anon hits the policy, evaluating has_role() raises 42501 and
-- the whole SELECT fails — even for rows where is_published = true.
--
-- WHY NOT SIMPLY GRANT EXECUTE ON has_role TO anon
-- That would fix the read, but has_role is SECURITY DEFINER and is also
-- reachable as a PostgREST RPC. Granting it to anon makes
-- `rpc('has_role', {_user_id, _role})` callable by anybody. Since
-- public.profiles is already readable by anon (schema.sql line 80), user
-- ids are enumerable, so an anonymous caller could walk the profile list
-- and test each id for the 'admin' role — publishing the full admin
-- roster. The REVOKE on line 129 is deliberate hardening; this migration
-- keeps it intact.
--
-- FIX
-- Split each SELECT policy in two. Permissive policies are OR'd, so the
-- result is identical for admins, while the branch that calls has_role
-- is scoped TO authenticated and is therefore never evaluated for anon.
-- This is the same convention the INSERT/UPDATE/DELETE policies on these
-- tables already use.
--
-- EFFECT
--   anon           : reads published rows only (unchanged for drafts)
--   authenticated  : reads published rows only, unless admin
--   admin          : reads everything, including drafts — unchanged
--   INSERT/UPDATE/DELETE policies : untouched
--   has_role grants: untouched (anon still cannot execute it)
--   every other table's RLS       : untouched
--
-- VERIFY AFTER RUNNING (with the anon/publishable key, signed out):
--   select policy_type, is_published from policies;   -- published rows only
--   select slug, published        from news_articles; -- published rows only
--   select id, is_published       from about_articles;-- published rows only
--   rpc has_role(...)  -- must STILL fail with 42501
-- Then sign in as an admin and confirm /admin/policies still lists and
-- edits drafts.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- public.policies
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Published policies are public, admins see all" ON public.policies;

CREATE POLICY "Published policies are public"
  ON public.policies FOR SELECT
  TO anon, authenticated
  USING (is_published);

CREATE POLICY "Admins read all policies"
  ON public.policies FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- public.news_articles
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Published news public" ON public.news_articles;

CREATE POLICY "Published news public"
  ON public.news_articles FOR SELECT
  TO anon, authenticated
  USING (published);

CREATE POLICY "Admins read all news"
  ON public.news_articles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- public.about_articles
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Published articles are public, admins see all" ON public.about_articles;

CREATE POLICY "Published about articles are public"
  ON public.about_articles FOR SELECT
  TO anon, authenticated
  USING (is_published);

CREATE POLICY "Admins read all about articles"
  ON public.about_articles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

COMMIT;
