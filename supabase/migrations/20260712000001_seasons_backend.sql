-- =====================================================================
-- SEASONS BACKEND
-- ---------------------------------------------------------------------
-- Backs src/lib/api/seasonsClient.ts (routes /seasons and /admin/seasons).
-- Prior audit (AUDIT_REPORT.md, "Fix Pass") found none of the RPCs the
-- client calls exist anywhere in schema.sql or migrations. This migration
-- creates the full additive backend: seasons table, per-season snapshot
-- table (season_rankings), history table (season_history), and every RPC
-- the client expects, matching its exact param names/order and return
-- shapes. Follows the same SECURITY DEFINER + has_role('admin') pattern
-- used by admin_credit_wallet/admin_debit_wallet (schema.sql ~line 1358)
-- and the leaderboard_view pattern (schema.sql ~line 3302) for rewards/
-- ranking math. Purely additive: no DROP, no ALTER that removes anything.
-- =====================================================================

-- ── 1. Core tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.seasons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number INT NOT NULL UNIQUE,
  name          TEXT,
  start_date    TIMESTAMPTZ NOT NULL,
  end_date      TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'upcoming'
                  CHECK (status IN ('upcoming', 'live', 'paused', 'ended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_seasons_status ON public.seasons(status);

-- Per-season leaderboard snapshot, refreshed live while a season is
-- 'live'/'paused' and frozen (ranks locked) once 'ended'.
CREATE TABLE IF NOT EXISTS public.season_rankings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id        UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rank             INT,
  iq_level         INT NOT NULL DEFAULT 0,
  rating_points    INT NOT NULL DEFAULT 0,
  rewards          TEXT[] NOT NULL DEFAULT '{}',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_season_rankings_season_rank
  ON public.season_rankings(season_id, rank);
CREATE INDEX IF NOT EXISTS idx_season_rankings_user
  ON public.season_rankings(user_id);

-- Final, immutable record written when a season ends (admin_end_season).
-- Backs season_history_for_user.
CREATE TABLE IF NOT EXISTS public.season_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id      UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  final_rank     INT NOT NULL,
  iq_level       INT NOT NULL DEFAULT 0,
  rating_points  INT NOT NULL DEFAULT 0,
  rewards        TEXT[] NOT NULL DEFAULT '{}',
  ended_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_season_history_user ON public.season_history(user_id);
CREATE INDEX IF NOT EXISTS idx_season_history_season ON public.season_history(season_id);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_history ENABLE ROW LEVEL SECURITY;

-- Everyone can read seasons/rankings/history (leaderboards are public,
-- consistent with leaderboard_view/get_dynamic_leaderboard being open to
-- anon/authenticated). All writes only ever happen via SECURITY DEFINER
-- functions below, so no INSERT/UPDATE/DELETE policies are granted here.
DROP POLICY IF EXISTS "seasons_select_all" ON public.seasons;
CREATE POLICY "seasons_select_all" ON public.seasons
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "season_rankings_select_all" ON public.season_rankings;
CREATE POLICY "season_rankings_select_all" ON public.season_rankings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "season_history_select_all" ON public.season_history;
CREATE POLICY "season_history_select_all" ON public.season_history
  FOR SELECT USING (true);

-- ── 2. Public read RPCs ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_season()
RETURNS public.seasons
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.seasons
  WHERE status IN ('live', 'paused')
  ORDER BY season_number DESC
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.current_season() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_season() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_seasons()
RETURNS SETOF public.seasons
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.seasons ORDER BY season_number DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.list_seasons() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_seasons() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.season_leaderboard(
  p_season_id UUID,
  p_country   TEXT DEFAULT NULL,
  p_state     TEXT DEFAULT NULL,
  p_district  TEXT DEFAULT NULL,
  p_search    TEXT DEFAULT NULL,
  p_limit     INT DEFAULT 25,
  p_offset    INT DEFAULT 0
)
RETURNS TABLE (
  rank                 INT,
  user_id              UUID,
  iq_level             INT,
  rating_points        INT,
  country              TEXT,
  state                TEXT,
  district             TEXT,
  rewards              TEXT[],
  username             TEXT,
  display_name         TEXT,
  avatar_url           TEXT,
  premium_active       BOOLEAN,
  premium_expires_at   TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.rank,
    sr.user_id,
    sr.iq_level,
    sr.rating_points,
    p.country,
    p.state,
    p.district,
    sr.rewards,
    p.username,
    p.display_name,
    p.avatar_url,
    p.premium_active,
    p.premium_expires_at
  FROM public.season_rankings sr
  JOIN public.profiles p ON p.id = sr.user_id
  WHERE sr.season_id = p_season_id
    AND (p_country IS NULL OR p.country = p_country)
    AND (p_state IS NULL OR p.state = p_state)
    AND (p_district IS NULL OR p.district = p_district)
    AND (p_search IS NULL OR p_search = '' OR p.username ILIKE '%' || p_search || '%' OR p.display_name ILIKE '%' || p_search || '%')
  ORDER BY sr.rank ASC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END; $$;
REVOKE EXECUTE ON FUNCTION public.season_leaderboard(UUID, TEXT, TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.season_leaderboard(UUID, TEXT, TEXT, TEXT, TEXT, INT, INT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.season_history_for_user(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result JSON;
  v_current_season_id UUID;
  v_current_rank INT;
BEGIN
  SELECT id INTO v_current_season_id FROM public.seasons
    WHERE status IN ('live', 'paused') ORDER BY season_number DESC LIMIT 1;

  IF v_current_season_id IS NOT NULL THEN
    SELECT rank INTO v_current_rank FROM public.season_rankings
      WHERE season_id = v_current_season_id AND user_id = p_user_id;
  END IF;

  SELECT json_build_object(
    'seasons', COALESCE((
      SELECT json_agg(json_build_object(
        'season_id', sh.season_id,
        'season_number', s.season_number,
        'season_name', s.name,
        'final_rank', sh.final_rank,
        'iq_level', sh.iq_level,
        'rating_points', sh.rating_points,
        'rewards', sh.rewards,
        'ended_at', sh.ended_at
      ) ORDER BY s.season_number DESC)
      FROM public.season_history sh
      JOIN public.seasons s ON s.id = sh.season_id
      WHERE sh.user_id = p_user_id
    ), '[]'::json),
    'current_season_rank', v_current_rank,
    'seasons_played', (SELECT COUNT(*) FROM public.season_history WHERE user_id = p_user_id),
    'seasons_won', (SELECT COUNT(*) FROM public.season_history WHERE user_id = p_user_id AND final_rank = 1),
    'top_10_finishes', (SELECT COUNT(*) FROM public.season_history WHERE user_id = p_user_id AND final_rank <= 10),
    'top_100_finishes', (SELECT COUNT(*) FROM public.season_history WHERE user_id = p_user_id AND final_rank <= 100),
    'best_rank_ever', (SELECT MIN(final_rank) FROM public.season_history WHERE user_id = p_user_id),
    'best_iq_level', COALESCE((SELECT MAX(iq_level) FROM public.season_history WHERE user_id = p_user_id), 0),
    'best_rating', COALESCE((SELECT MAX(rating_points) FROM public.season_history WHERE user_id = p_user_id), 0)
  ) INTO v_result;

  RETURN v_result;
END; $$;
REVOKE EXECUTE ON FUNCTION public.season_history_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.season_history_for_user(UUID) TO anon, authenticated, service_role;

-- ── 3. Internal helper: recompute rankings for a season ──────────────
-- Ranks all profiles by iq_level desc using the same "overall_rating"
-- concept as leaderboard_view (highest active time-class rating).
CREATE OR REPLACE FUNCTION public._season_recompute_rankings(p_season_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH ranked AS (
    SELECT
      p.id AS user_id,
      p.iq_level,
      GREATEST(
        COALESCE(MAX(CASE WHEN r.time_class = 'rapid' THEN r.rating END), 0),
        COALESCE(MAX(CASE WHEN r.time_class = 'blitz' THEN r.rating END), 0),
        COALESCE(MAX(CASE WHEN r.time_class = 'bullet' THEN r.rating END), 0),
        COALESCE(MAX(CASE WHEN r.time_class = 'classical' THEN r.rating END), 0)
      )::INT AS rating_points,
      ROW_NUMBER() OVER (ORDER BY p.iq_level DESC, p.id ASC) AS rnk
    FROM public.profiles p
    LEFT JOIN public.ratings r ON r.user_id = p.id
    GROUP BY p.id, p.iq_level
  )
  INSERT INTO public.season_rankings (season_id, user_id, rank, iq_level, rating_points, updated_at)
  SELECT p_season_id, ranked.user_id, ranked.rnk, ranked.iq_level, ranked.rating_points, now()
  FROM ranked
  ON CONFLICT (season_id, user_id) DO UPDATE SET
    rank = EXCLUDED.rank,
    iq_level = EXCLUDED.iq_level,
    rating_points = EXCLUDED.rating_points,
    updated_at = now();
END; $$;
REVOKE EXECUTE ON FUNCTION public._season_recompute_rankings(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._season_recompute_rankings(UUID) TO service_role;

-- ── 4. Admin write RPCs ───────────────────────────────────────────────
-- All follow the admin_credit_wallet pattern: allow service_role calls
-- (auth.uid() IS NULL) and require has_role(auth.uid(), 'admin') for any
-- authenticated caller.

CREATE OR REPLACE FUNCTION public.admin_create_season(
  p_name  TEXT,
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next_number INT;
  v_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION 'end must be after start'; END IF;

  SELECT COALESCE(MAX(season_number), 0) + 1 INTO v_next_number FROM public.seasons;

  INSERT INTO public.seasons (season_number, name, start_date, end_date, status)
  VALUES (v_next_number, p_name, p_start, p_end, 'upcoming')
  RETURNING id INTO v_id;

  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_create_season(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_season(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_edit_season(
  p_season_id UUID,
  p_name      TEXT,
  p_start     TIMESTAMPTZ,
  p_end       TIMESTAMPTZ
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION 'end must be after start'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seasons WHERE id = p_season_id) THEN
    RAISE EXCEPTION 'Season not found';
  END IF;

  UPDATE public.seasons
  SET name = p_name, start_date = p_start, end_date = p_end, updated_at = now()
  WHERE id = p_season_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_edit_season(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_edit_season(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_start_season(p_season_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT status INTO v_status FROM public.seasons WHERE id = p_season_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Season not found'; END IF;
  IF v_status NOT IN ('upcoming', 'paused') THEN
    RAISE EXCEPTION 'Season must be upcoming or paused to start';
  END IF;

  -- Only one season may be live at a time.
  UPDATE public.seasons SET status = 'paused', updated_at = now()
  WHERE status = 'live' AND id != p_season_id;

  UPDATE public.seasons SET status = 'live', updated_at = now() WHERE id = p_season_id;

  PERFORM public._season_recompute_rankings(p_season_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_start_season(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_start_season(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_pause_season(p_season_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seasons WHERE id = p_season_id AND status = 'live') THEN
    RAISE EXCEPTION 'Season is not live';
  END IF;

  UPDATE public.seasons SET status = 'paused', updated_at = now() WHERE id = p_season_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_pause_season(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pause_season(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_resume_season(p_season_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seasons WHERE id = p_season_id AND status = 'paused') THEN
    RAISE EXCEPTION 'Season is not paused';
  END IF;

  UPDATE public.seasons SET status = 'paused', updated_at = now()
  WHERE status = 'live' AND id != p_season_id;

  UPDATE public.seasons SET status = 'live', updated_at = now() WHERE id = p_season_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_resume_season(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resume_season(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_recalculate_season(p_season_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seasons WHERE id = p_season_id) THEN
    RAISE EXCEPTION 'Season not found';
  END IF;

  PERFORM public._season_recompute_rankings(p_season_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_recalculate_season(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recalculate_season(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_end_season(
  p_season_id       UUID,
  p_auto_start_next BOOLEAN DEFAULT true
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status TEXT;
  v_ranked_players INT;
  v_next_season_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT status INTO v_status FROM public.seasons WHERE id = p_season_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Season not found'; END IF;
  IF v_status = 'ended' THEN RAISE EXCEPTION 'Season already ended'; END IF;

  PERFORM public._season_recompute_rankings(p_season_id);

  -- Award simple rank-based reward tags, then freeze into season_history.
  UPDATE public.season_rankings
  SET rewards = CASE
    WHEN rank = 1 THEN ARRAY['champion_badge', 'top_1']
    WHEN rank <= 3 THEN ARRAY['podium_badge', 'top_3']
    WHEN rank <= 10 THEN ARRAY['top_10']
    WHEN rank <= 100 THEN ARRAY['top_100']
    ELSE '{}'::text[]
  END
  WHERE season_id = p_season_id;

  INSERT INTO public.season_history (season_id, user_id, final_rank, iq_level, rating_points, rewards, ended_at)
  SELECT season_id, user_id, rank, iq_level, rating_points, rewards, now()
  FROM public.season_rankings
  WHERE season_id = p_season_id AND rank IS NOT NULL
  ON CONFLICT (season_id, user_id) DO UPDATE SET
    final_rank = EXCLUDED.final_rank,
    iq_level = EXCLUDED.iq_level,
    rating_points = EXCLUDED.rating_points,
    rewards = EXCLUDED.rewards,
    ended_at = now();

  GET DIAGNOSTICS v_ranked_players = ROW_COUNT;

  UPDATE public.seasons SET status = 'ended', updated_at = now() WHERE id = p_season_id;

  IF p_auto_start_next THEN
    SELECT id INTO v_next_season_id FROM public.seasons
    WHERE status = 'upcoming'
    ORDER BY season_number ASC
    LIMIT 1;

    IF v_next_season_id IS NOT NULL THEN
      PERFORM public.admin_start_season(v_next_season_id);
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'ranked_players', v_ranked_players,
    'next_season_id', v_next_season_id
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_end_season(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_end_season(UUID, BOOLEAN) TO authenticated, service_role;
