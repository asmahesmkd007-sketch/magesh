-- =====================================================================
-- HOTFIX: leaderboard_view / get_dynamic_leaderboard referenced columns
-- and a table that were never created (p.community_score, p.iq_level,
-- public.community_achievements). This caused:
--   ERROR: 42703: column p.community_score does not exist
-- =====================================================================

-- 1. Add the missing profile columns.
--    iq_level mirrors the existing iq_rating column (kept in sync via
--    trigger below) rather than duplicating rating logic elsewhere.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS community_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iq_level INT NOT NULL DEFAULT 100;

-- Backfill iq_level from the existing iq_rating so current standings aren't reset.
UPDATE public.profiles SET iq_level = iq_rating WHERE iq_level = 100 AND iq_rating <> 100;

-- Keep iq_level in sync whenever iq_rating changes (apply_iq_change updates iq_rating directly).
CREATE OR REPLACE FUNCTION public.sync_iq_level()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.iq_level = NEW.iq_rating;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_iq_level ON public.profiles;
CREATE TRIGGER trg_sync_iq_level
  BEFORE INSERT OR UPDATE OF iq_rating ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_iq_level();

-- 2. community_achievements never existed; the community feature ships
--    posts/reactions/comments but no achievements table. Create a minimal
--    table so the leaderboard's achievements_count subquery resolves.
CREATE TABLE IF NOT EXISTS public.community_achievements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  title      TEXT NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);
CREATE INDEX IF NOT EXISTS idx_community_achievements_user ON public.community_achievements(user_id);
GRANT SELECT ON public.community_achievements TO anon, authenticated;
GRANT ALL ON public.community_achievements TO service_role;
ALTER TABLE public.community_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Achievements public read" ON public.community_achievements;
CREATE POLICY "Achievements public read"
  ON public.community_achievements FOR SELECT USING (true);

-- 3. Re-run leaderboard_view and get_dynamic_leaderboard now that their
--    dependencies exist (bodies unchanged from schema.sql SECTION 19-20).
CREATE OR REPLACE VIEW public.leaderboard_view AS
WITH user_ratings AS (
  SELECT
    user_id,
    MAX(CASE WHEN time_class = 'rapid' THEN rating END) as rapid_rating,
    MAX(CASE WHEN time_class = 'blitz' THEN rating END) as blitz_rating,
    MAX(CASE WHEN time_class = 'bullet' THEN rating END) as bullet_rating,
    MAX(CASE WHEN time_class = 'classical' THEN rating END) as classical_rating,
    SUM(wins) as wins,
    SUM(losses) as losses,
    SUM(draws) as draws
  FROM public.ratings
  GROUP BY user_id
)
SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.title,
    p.country,
    p.state,
    p.district,
    p.created_at,
    p.is_online,
    p.last_seen,
    p.premium_active,
    p.premium_expires_at,
    p.community_score,
    r.rapid_rating,
    r.blitz_rating,
    r.bullet_rating,
    r.classical_rating,
    GREATEST(
        COALESCE(r.rapid_rating, 0),
        COALESCE(r.blitz_rating, 0),
        COALESCE(r.bullet_rating, 0),
        COALESCE(r.classical_rating, 0)
    )::integer as overall_rating,
    COALESCE(r.wins, 0)::integer as wins,
    COALESCE(r.losses, 0)::integer as losses,
    COALESCE(r.draws, 0)::integer as draws,
    (COALESCE(r.wins, 0) + COALESCE(r.losses, 0) + COALESCE(r.draws, 0))::integer as total_matches,
    CASE
        WHEN (COALESCE(r.wins, 0) + COALESCE(r.losses, 0) + COALESCE(r.draws, 0)) > 0
        THEN (COALESCE(r.wins, 0)::numeric / (COALESCE(r.wins, 0) + COALESCE(r.losses, 0) + COALESCE(r.draws, 0))::numeric) * 100
        ELSE 0
    END::numeric as win_rate,
    p.iq_level,
    (p.iq_level * 10 + p.community_score * 5 + COALESCE(r.wins, 0) * 15)::integer as xp,
    (FLOOR(SQRT(p.iq_level * 10 + p.community_score * 5 + COALESCE(r.wins, 0) * 15) / 10) + 1)::integer as level,
    (SELECT COUNT(*) FROM public.community_achievements ca WHERE ca.user_id = p.id)::integer as achievements_count
FROM public.profiles p
LEFT JOIN user_ratings r ON p.id = r.user_id;

CREATE OR REPLACE FUNCTION public.get_dynamic_leaderboard(
    p_search text DEFAULT '',
    p_country text DEFAULT NULL,
    p_state text DEFAULT NULL,
    p_district text DEFAULT NULL,
    p_sort_col text DEFAULT 'iq_desc',
    p_limit integer DEFAULT 25,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    username text,
    display_name text,
    avatar_url text,
    title text,
    country text,
    state text,
    district text,
    created_at timestamp with time zone,
    is_online boolean,
    last_seen timestamp with time zone,
    premium_active boolean,
    premium_expires_at timestamp with time zone,
    community_score integer,
    rapid_rating integer,
    blitz_rating integer,
    bullet_rating integer,
    classical_rating integer,
    overall_rating integer,
    wins integer,
    losses integer,
    draws integer,
    total_matches integer,
    win_rate numeric,
    iq_level integer,
    xp integer,
    level integer,
    achievements_count integer,
    total_count bigint
) AS $$
BEGIN
    RETURN QUERY
    WITH filtered_players AS (
        SELECT v.*
        FROM public.leaderboard_view v
        WHERE
            (p_search = '' OR v.username ILIKE '%' || p_search || '%' OR v.display_name ILIKE '%' || p_search || '%')
            AND (p_country IS NULL OR v.country = p_country)
            AND (p_state IS NULL OR v.state = p_state)
            AND (p_district IS NULL OR v.district = p_district)
    ),
    counted_players AS (
        SELECT COUNT(*) as exact_count FROM filtered_players
    )
    SELECT
        f.id,
        f.username,
        f.display_name,
        f.avatar_url,
        f.title,
        f.country,
        f.state,
        f.district,
        f.created_at,
        f.is_online,
        f.last_seen,
        f.premium_active,
        f.premium_expires_at,
        f.community_score,
        f.rapid_rating,
        f.blitz_rating,
        f.bullet_rating,
        f.classical_rating,
        f.overall_rating,
        f.wins,
        f.losses,
        f.draws,
        f.total_matches,
        f.win_rate,
        f.iq_level,
        f.xp,
        f.level,
        f.achievements_count,
        c.exact_count as total_count
    FROM filtered_players f
    CROSS JOIN counted_players c
    ORDER BY
        CASE WHEN p_sort_col = 'iq_desc' THEN f.iq_level END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'iq_asc' THEN f.iq_level END ASC NULLS LAST,
        CASE WHEN p_sort_col = 'rating_desc' THEN f.overall_rating END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'newest' THEN f.created_at END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'oldest' THEN f.created_at END ASC NULLS LAST,
        CASE WHEN p_sort_col = 'wins_desc' THEN f.wins END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'matches_desc' THEN f.total_matches END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'winrate_desc' THEN f.win_rate END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'active_desc' THEN f.last_seen END DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_dynamic_leaderboard(text, text, text, text, text, integer, integer) TO anon, authenticated, service_role;
