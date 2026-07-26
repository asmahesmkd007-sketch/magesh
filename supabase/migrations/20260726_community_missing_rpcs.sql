-- =====================================================================
-- Community: missing RPCs + a pre-existing schema bug fix
-- ---------------------------------------------------------------------
-- STATUS: NOT APPLIED. Review, then run in the Supabase SQL editor.
--
-- CONTEXT
-- AUDIT_REPORT.md's "Fix Pass 2" note flagged that src/lib/api/
-- communityClient.ts calls several RPCs with no backing SQL. As of this
-- pass, schema.sql already defines the underlying tables (community_
-- posts/comments/reactions/bookmarks/follows/blocks/mutes/hidden_posts/
-- poll_votes/reports/achievements) and 5 of the RPCs (community_feed,
-- community_react, community_toggle_follow, community_toggle_bookmark,
-- admin_resolve_report). Re-checked against the current schema.sql and
-- confirmed 11 RPCs are still missing — every one of them causes a hard
-- PGRST202 error today wherever it's called:
--   community_get_post      -> community.post.$id.tsx (post detail page)
--   community_get_comments  -> community.post.$id.tsx (comment thread)
--   community_vote_poll     -> poll voting on any 'poll' post
--   community_share_post    -> the share button
--   community_profile       -> u.$username.tsx-style community profile view
--   community_follow_list   -> followers/following lists
--   community_leaderboard   -> community leaderboard widget
--   community_suggested_users -> "who to follow" suggestions
--   community_search_users  -> the user search box
--   community_trending_tags -> trending tags widget
--   admin_community_stats   -> admin.community.tsx dashboard tile
-- No new tables are needed; all 11 are pure additive functions on top of
-- tables that already exist.
--
-- SEPARATE BUG FOUND WHILE VERIFYING THIS
-- public.community_reports is CREATE TABLE IF NOT EXISTS'd TWICE in
-- schema.sql: once early (community system block, no resolved_by/
-- resolved_at columns) and once later (platform-reports-adjacent block,
-- WITH resolved_by/resolved_at). Because IF NOT EXISTS is a no-op once
-- the table exists, the first definition always wins on a fresh
-- database, so resolved_by/resolved_at are silently never created —
-- meaning the already-existing public.admin_resolve_report RPC fails at
-- runtime with "column resolved_by does not exist" the first time an
-- admin resolves a community report. Fixed below with idempotent ALTER
-- TABLE ... ADD COLUMN IF NOT EXISTS, safe regardless of which of the
-- two CREATE TABLE statements happened to run first.
--
-- ALSO FIXED: community_toggle_bookmark never incremented/decremented
-- community_posts.bookmarks_count, so that counter was permanently
-- stuck at 0. Redefined (CREATE OR REPLACE, same signature) to keep it
-- in sync.
--
-- All functions are SECURITY DEFINER, follow the exact param names/
-- order/return shape communityClient.ts expects, and reuse the same
-- auth.uid()-gated conventions as the existing community RPCs in
-- schema.sql. Nothing existing is dropped or renamed.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Bugfix: community_reports missing columns (see note above)
-- ---------------------------------------------------------------------
ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------
-- Bugfix: keep community_posts.bookmarks_count in sync
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_toggle_bookmark(p_post_id UUID, p_collection text DEFAULT 'Favorites')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_exists boolean;
BEGIN
    IF v_uid IS NULL THEN RETURN false; END IF;
    SELECT EXISTS(SELECT 1 FROM public.community_bookmarks WHERE user_id = v_uid AND post_id = p_post_id) INTO v_exists;
    IF v_exists THEN
        DELETE FROM public.community_bookmarks WHERE user_id = v_uid AND post_id = p_post_id;
        UPDATE public.community_posts SET bookmarks_count = GREATEST(bookmarks_count - 1, 0) WHERE id = p_post_id;
        RETURN false;
    ELSE
        INSERT INTO public.community_bookmarks (user_id, post_id, collection) VALUES (v_uid, p_post_id, p_collection);
        UPDATE public.community_posts SET bookmarks_count = bookmarks_count + 1 WHERE id = p_post_id;
        RETURN true;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 1. community_get_post — single-post fetch for the detail page. Same
--    row shape as community_feed's per-post object, plus real (not
--    hardcoded) followers_count/is_following_author/poll_counts/
--    my_poll_vote since a permalink view justifies the extra cost.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_get_post(p_id UUID)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_result json;
BEGIN
    SELECT json_build_object(
        'id', p.id,
        'user_id', p.user_id,
        'post_type', p.post_type,
        'content', p.content,
        'media_url', p.media_url,
        'link_url', p.link_url,
        'fen', p.fen,
        'pgn', p.pgn,
        'puzzle_solution', p.puzzle_solution,
        'poll_options', p.poll_options,
        'poll_ends_at', p.poll_ends_at,
        'tags', p.tags,
        'likes_count', p.likes_count,
        'dislikes_count', p.dislikes_count,
        'comments_count', p.comments_count,
        'shares_count', p.shares_count,
        'bookmarks_count', p.bookmarks_count,
        'score', p.score,
        'is_pinned', p.is_pinned,
        'is_hidden', p.is_hidden,
        'is_featured', p.is_featured,
        'created_at', p.created_at,
        'updated_at', p.updated_at,
        'author', json_build_object(
            'id', pr.id,
            'username', pr.username,
            'full_name', pr.full_name,
            'avatar_url', pr.avatar_url,
            'title', pr.title,
            'country', pr.country,
            'premium_tier', pr.premium_tier,
            'community_score', pr.community_score,
            'iq_level', pr.iq_rating,
            'followers_count', (SELECT COUNT(*) FROM public.community_follows cf WHERE cf.following_id = pr.id)
        ),
        'my_reaction', (SELECT reaction_type FROM public.community_reactions cr WHERE cr.post_id = p.id AND cr.user_id = v_uid LIMIT 1),
        'is_bookmarked', v_uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.community_bookmarks cb WHERE cb.post_id = p.id AND cb.user_id = v_uid),
        'is_following_author', v_uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.community_follows cf WHERE cf.follower_id = v_uid AND cf.following_id = p.user_id),
        'poll_counts', CASE WHEN p.poll_options IS NULL THEN NULL ELSE (
            SELECT json_agg(cnt ORDER BY idx) FROM (
                SELECT o.idx, COUNT(pv.user_id) AS cnt
                FROM unnest(p.poll_options) WITH ORDINALITY AS o(opt, idx)
                LEFT JOIN public.community_poll_votes pv ON pv.post_id = p.id AND pv.option_idx = o.idx - 1
                GROUP BY o.idx
            ) counts
        ) END,
        'my_poll_vote', (SELECT option_idx FROM public.community_poll_votes pv WHERE pv.post_id = p.id AND pv.user_id = v_uid)
    ) INTO v_result
    FROM public.community_posts p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.id = p_id;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_get_post(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. community_get_comments — flat list (client nests by parent_id).
--    Comment-level reactions aren't wired at the DB level yet
--    (community_reactions only has post_id, no comment_id column) so
--    my_reaction is always NULL here — a pre-existing limitation, not
--    introduced or expanded by this migration.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_get_comments(p_post_id UUID)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_result json;
BEGIN
    SELECT COALESCE(json_agg(
        json_build_object(
            'id', c.id,
            'post_id', c.post_id,
            'user_id', c.user_id,
            'parent_id', c.parent_id,
            'content', c.content,
            'fen', c.fen,
            'pgn', c.pgn,
            'likes_count', c.likes_count,
            'dislikes_count', c.dislikes_count,
            'replies_count', c.replies_count,
            'created_at', c.created_at,
            'author', json_build_object(
                'id', pr.id,
                'username', pr.username,
                'full_name', pr.full_name,
                'avatar_url', pr.avatar_url,
                'premium_tier', pr.premium_tier,
                'community_score', pr.community_score
            ),
            'my_reaction', NULL
        )
        ORDER BY c.created_at ASC
    ), '[]'::json) INTO v_result
    FROM public.community_comments c
    JOIN public.profiles pr ON pr.id = c.user_id
    WHERE c.post_id = p_post_id AND COALESCE(c.is_hidden, false) = false;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_get_comments(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. community_vote_poll — upsert into the existing community_poll_
--    votes table (its own PK is (user_id, post_id), so this naturally
--    allows changing your vote, matching the "Users can change poll
--    votes" RLS policy already defined on that table).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_vote_poll(p_post_id UUID, p_option INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_post RECORD;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT poll_options, poll_ends_at INTO v_post FROM public.community_posts WHERE id = p_post_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
    IF v_post.poll_options IS NULL THEN RAISE EXCEPTION 'This post has no poll'; END IF;
    IF p_option < 0 OR p_option >= array_length(v_post.poll_options, 1) THEN
        RAISE EXCEPTION 'Invalid poll option';
    END IF;
    IF v_post.poll_ends_at IS NOT NULL AND v_post.poll_ends_at < now() THEN
        RAISE EXCEPTION 'This poll has ended';
    END IF;

    INSERT INTO public.community_poll_votes (user_id, post_id, option_idx)
    VALUES (v_uid, p_post_id, p_option)
    ON CONFLICT (user_id, post_id) DO UPDATE SET option_idx = p_option;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_vote_poll(UUID, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. community_share_post — simplest interpretation matching the
--    client's void-returning, no-dedupe call site: increment the
--    counter every time. No per-user "already shared" tracking exists
--    (or was requested) for this feature.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_share_post(p_post_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    UPDATE public.community_posts SET shares_count = shares_count + 1 WHERE id = p_post_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_share_post(UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. community_profile — social counts are computed live from
--    community_follows/community_posts/community_comments rather than
--    trusting profiles.followers_count/following_count/posts_count:
--    those columns appear in the generated src/integrations/supabase/
--    types.ts (live-DB drift) but do not exist anywhere in schema.sql,
--    so schema.sql (this migration's source of truth) cannot rely on
--    them being present or kept in sync.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_profile(p_username text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_target UUID;
    v_result json;
BEGIN
    SELECT id INTO v_target FROM public.profiles WHERE username = p_username;
    IF v_target IS NULL THEN RETURN NULL; END IF;

    SELECT json_build_object(
        'id', pr.id,
        'username', pr.username,
        'full_name', pr.full_name,
        'bio', pr.bio,
        'country', pr.country,
        'avatar_url', pr.avatar_url,
        'banner_url', pr.banner_url,
        'website', pr.website,
        'title', pr.title,
        'youtube_url', pr.youtube_url,
        'instagram_url', pr.instagram_url,
        'facebook_url', pr.facebook_url,
        'twitter_url', pr.twitter_url,
        'premium_tier', pr.premium_tier,
        'iq_level', pr.iq_rating,
        'community_score', pr.community_score,
        'created_at', pr.created_at,
        'followers_count', (SELECT COUNT(*) FROM public.community_follows WHERE following_id = pr.id),
        'following_count', (SELECT COUNT(*) FROM public.community_follows WHERE follower_id = pr.id),
        'posts_count', (SELECT COUNT(*) FROM public.community_posts WHERE user_id = pr.id AND COALESCE(is_hidden, false) = false),
        'comments_count', (SELECT COUNT(*) FROM public.community_comments WHERE user_id = pr.id),
        'is_following', v_uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.community_follows WHERE follower_id = v_uid AND following_id = pr.id),
        'follows_me', v_uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.community_follows WHERE follower_id = pr.id AND following_id = v_uid),
        'is_muted', v_uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.community_mutes WHERE user_id = v_uid AND muted_id = pr.id),
        'is_blocked', v_uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.community_blocks WHERE user_id = v_uid AND blocked_id = pr.id),
        'mutual_followers', CASE WHEN v_uid IS NULL THEN 0 ELSE (
            SELECT COUNT(*) FROM public.community_follows f
            WHERE f.following_id = pr.id
              AND f.follower_id IN (SELECT following_id FROM public.community_follows WHERE follower_id = v_uid)
        ) END,
        'achievements', COALESCE((
            SELECT json_agg(json_build_object('code', ca.achievement_name, 'awarded_at', ca.earned_at) ORDER BY ca.earned_at DESC)
            FROM public.community_achievements ca WHERE ca.user_id = pr.id
        ), '[]'::json)
    ) INTO v_result
    FROM public.profiles pr
    WHERE pr.id = v_target;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_profile(text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. community_follow_list
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_follow_list(p_user UUID, p_kind text, p_limit integer DEFAULT 50)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_result json;
BEGIN
    IF p_kind NOT IN ('followers', 'following') THEN
        RAISE EXCEPTION 'Invalid kind';
    END IF;

    IF p_kind = 'followers' THEN
        SELECT COALESCE(json_agg(row), '[]'::json) INTO v_result FROM (
            SELECT json_build_object(
                'id', pr.id, 'username', pr.username, 'full_name', pr.full_name,
                'avatar_url', pr.avatar_url, 'premium_tier', pr.premium_tier,
                'community_score', pr.community_score,
                'followers_count', (SELECT COUNT(*) FROM public.community_follows WHERE following_id = pr.id),
                'is_following', v_uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.community_follows WHERE follower_id = v_uid AND following_id = pr.id)
            ) AS row
            FROM public.community_follows cf
            JOIN public.profiles pr ON pr.id = cf.follower_id
            WHERE cf.following_id = p_user
            ORDER BY cf.created_at DESC
            LIMIT p_limit
        ) t;
    ELSE
        SELECT COALESCE(json_agg(row), '[]'::json) INTO v_result FROM (
            SELECT json_build_object(
                'id', pr.id, 'username', pr.username, 'full_name', pr.full_name,
                'avatar_url', pr.avatar_url, 'premium_tier', pr.premium_tier,
                'community_score', pr.community_score,
                'followers_count', (SELECT COUNT(*) FROM public.community_follows WHERE following_id = pr.id),
                'is_following', v_uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.community_follows WHERE follower_id = v_uid AND following_id = pr.id)
            ) AS row
            FROM public.community_follows cf
            JOIN public.profiles pr ON pr.id = cf.following_id
            WHERE cf.follower_id = p_user
            ORDER BY cf.created_at DESC
            LIMIT p_limit
        ) t;
    END IF;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_follow_list(UUID, text, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. community_leaderboard
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_leaderboard(p_kind text, p_limit integer DEFAULT 10)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_result json;
BEGIN
    IF p_kind NOT IN ('score', 'posts', 'comments', 'followers') THEN
        RAISE EXCEPTION 'Invalid kind';
    END IF;

    SELECT COALESCE(json_agg(
        json_build_object(
            'id', t.id, 'username', t.username, 'full_name', t.full_name,
            'avatar_url', t.avatar_url, 'premium_tier', t.premium_tier,
            'community_score', t.community_score, 'followers_count', t.followers_count,
            'is_following', v_uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.community_follows WHERE follower_id = v_uid AND following_id = t.id),
            'metric', t.metric
        ) ORDER BY t.metric DESC
    ), '[]'::json) INTO v_result
    FROM (
        SELECT
            pr.id, pr.username, pr.full_name, pr.avatar_url, pr.premium_tier, pr.community_score,
            (SELECT COUNT(*) FROM public.community_follows cf2 WHERE cf2.following_id = pr.id) AS followers_count,
            CASE p_kind
                WHEN 'score' THEN pr.community_score
                WHEN 'posts' THEN (SELECT COUNT(*) FROM public.community_posts cp WHERE cp.user_id = pr.id)::int
                WHEN 'comments' THEN (SELECT COUNT(*) FROM public.community_comments cc WHERE cc.user_id = pr.id)::int
                WHEN 'followers' THEN (SELECT COUNT(*) FROM public.community_follows cf3 WHERE cf3.following_id = pr.id)::int
            END AS metric
        FROM public.profiles pr
        ORDER BY metric DESC
        LIMIT p_limit
    ) t;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_leaderboard(text, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. community_suggested_users — popular users the viewer doesn't
--    already follow and isn't blocked by/hasn't blocked.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_suggested_users(p_limit integer DEFAULT 5)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_result json;
BEGIN
    IF v_uid IS NULL THEN RETURN '[]'::json; END IF;

    SELECT COALESCE(json_agg(row), '[]'::json) INTO v_result FROM (
        SELECT json_build_object(
            'id', pr.id, 'username', pr.username, 'full_name', pr.full_name,
            'avatar_url', pr.avatar_url, 'premium_tier', pr.premium_tier,
            'community_score', pr.community_score,
            'followers_count', (SELECT COUNT(*) FROM public.community_follows WHERE following_id = pr.id),
            'is_following', false
        ) AS row
        FROM public.profiles pr
        WHERE pr.id <> v_uid
          AND NOT EXISTS (SELECT 1 FROM public.community_follows WHERE follower_id = v_uid AND following_id = pr.id)
          AND NOT EXISTS (SELECT 1 FROM public.community_blocks WHERE user_id = v_uid AND blocked_id = pr.id)
          AND NOT EXISTS (SELECT 1 FROM public.community_blocks WHERE user_id = pr.id AND blocked_id = v_uid)
        ORDER BY pr.community_score DESC, pr.created_at DESC
        LIMIT p_limit
    ) t;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_suggested_users(integer) TO authenticated;

-- ---------------------------------------------------------------------
-- 9. community_search_users
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_search_users(p_query text, p_limit integer DEFAULT 10)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_result json;
BEGIN
    IF p_query IS NULL OR length(trim(p_query)) = 0 THEN RETURN '[]'::json; END IF;

    SELECT COALESCE(json_agg(row), '[]'::json) INTO v_result FROM (
        SELECT json_build_object(
            'id', pr.id, 'username', pr.username, 'full_name', pr.full_name,
            'avatar_url', pr.avatar_url, 'premium_tier', pr.premium_tier,
            'community_score', pr.community_score,
            'followers_count', (SELECT COUNT(*) FROM public.community_follows WHERE following_id = pr.id),
            'is_following', v_uid IS NOT NULL AND EXISTS(SELECT 1 FROM public.community_follows WHERE follower_id = v_uid AND following_id = pr.id)
        ) AS row
        FROM public.profiles pr
        WHERE pr.username ILIKE '%' || p_query || '%' OR pr.full_name ILIKE '%' || p_query || '%'
        ORDER BY pr.community_score DESC
        LIMIT p_limit
    ) t;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_search_users(text, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. community_trending_tags — last 30 days, unnest via a FROM-clause
--     set-returning function (not repeated in GROUP BY) so each tag
--     lines up correctly with its source post.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_trending_tags(p_limit integer DEFAULT 8)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_result json;
BEGIN
    SELECT COALESCE(json_agg(json_build_object('tag', tag, 'count', cnt) ORDER BY cnt DESC), '[]'::json) INTO v_result
    FROM (
        SELECT tag, COUNT(*) AS cnt
        FROM public.community_posts cp, unnest(cp.tags) AS tag
        WHERE cp.created_at > now() - interval '30 days'
          AND COALESCE(cp.is_hidden, false) = false
        GROUP BY tag
        ORDER BY cnt DESC
        LIMIT p_limit
    ) t;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_trending_tags(integer) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 11. admin_community_stats
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_community_stats()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_result json;
BEGIN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    SELECT json_build_object(
        'users', (SELECT COUNT(*) FROM public.profiles),
        'online', (SELECT COUNT(*) FROM public.profiles WHERE is_online = true),
        'posts', (SELECT COUNT(*) FROM public.community_posts),
        'comments', (SELECT COUNT(*) FROM public.community_comments),
        'likes', (SELECT COUNT(*) FROM public.community_reactions WHERE reaction_type = 'like'),
        'follows', (SELECT COUNT(*) FROM public.community_follows),
        'open_reports', (SELECT COUNT(*) FROM public.community_reports WHERE status = 'open'),
        'posts_7d', (SELECT COUNT(*) FROM public.community_posts WHERE created_at > now() - interval '7 days')
    ) INTO v_result;

    RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_community_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_community_stats() TO authenticated, service_role;

COMMIT;
