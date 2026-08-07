-- SECTION: PUZZLE LIBRARY EXPANSION (500+ puzzles, rotation, admin RPCs) Idempo...

-- ── puzzles: additional metadata columns (additive, non-breaking) ──────
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Tactics';
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'Intermediate';
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS explanation TEXT NOT NULL DEFAULT '';
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS alternative_lines JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS hints JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_puzzles_goal ON public.puzzles(goal);
CREATE INDEX IF NOT EXISTS idx_puzzles_category ON public.puzzles(category);
CREATE INDEX IF NOT EXISTS idx_puzzles_enabled ON public.puzzles(enabled);
CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzles_slug ON public.puzzles(slug) WHERE slug IS NOT NULL;

-- Only expose enabled puzzles to normal clients; admins/service_role see all vi...
DROP POLICY IF EXISTS "Puzzles public read" ON public.puzzles;
CREATE POLICY "Puzzles public read"
  ON public.puzzles FOR SELECT USING (enabled = true);

ALTER TABLE public.user_puzzle_stats ADD COLUMN IF NOT EXISTS puzzle_rating INT NOT NULL DEFAULT 100;



-- ── Admin RPCs for /admin/puzzles (were referenced by src/lib/api/adminClient....
-- p_id is TEXT, not UUID: public.puzzles.id is a TEXT primary key (e.g
DROP FUNCTION IF EXISTS public.admin_upsert_puzzle(UUID, TEXT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_set_puzzle_enabled(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_delete_puzzle(UUID);

CREATE OR REPLACE FUNCTION public.admin_upsert_puzzle(
  p_id TEXT,
  p_fen TEXT,
  p_moves TEXT,
  p_rating INT,
  p_theme TEXT,
  p_category TEXT,
  p_goal TEXT,
  p_difficulty TEXT,
  p_explanation TEXT,
  p_themes TEXT[],
  p_enabled BOOLEAN DEFAULT true
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_id IS NULL THEN
    v_id := 'p-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.puzzles (id, fen, moves, rating, theme, category, goal, difficulty, explanation, themes, enabled)
    VALUES (v_id, p_fen, string_to_array(p_moves, ' '), p_rating, p_theme, p_category, p_goal, p_difficulty, p_explanation, COALESCE(p_themes, '{}'), COALESCE(p_enabled, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.puzzles
    SET fen = p_fen, moves = string_to_array(p_moves, ' '), rating = p_rating, theme = p_theme, category = p_category,
        goal = p_goal, difficulty = p_difficulty, explanation = p_explanation, themes = COALESCE(p_themes, '{}'),
        enabled = COALESCE(p_enabled, enabled)
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_puzzle(TEXT, TEXT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_puzzle(TEXT, TEXT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_puzzle_enabled(p_id TEXT, p_enabled BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  UPDATE public.puzzles SET enabled = p_enabled WHERE id = p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_puzzle_enabled(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_puzzle_enabled(TEXT, BOOLEAN) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_puzzle(p_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  DELETE FROM public.puzzles WHERE id = p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_puzzle(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_puzzle(TEXT) TO authenticated, service_role;

-- Upserts on id (falling back to slug, then a generated id) so re-running "Seed...
CREATE OR REPLACE FUNCTION public.admin_bulk_import_puzzles(p_items JSONB)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item JSONB;
  v_count INT := 0;
  v_id TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_id := COALESCE(
      NULLIF(v_item->>'id', ''),
      NULLIF(v_item->>'slug', ''),
      'p-' || replace(gen_random_uuid()::text, '-', '')
    );
    INSERT INTO public.puzzles (id, fen, moves, rating, theme, category, goal, difficulty, explanation, themes, enabled)
    VALUES (
      v_id,
      v_item->>'fen',
      string_to_array(v_item->>'moves', ' '),
      COALESCE((v_item->>'rating')::INT, 1500),
      COALESCE(v_item->>'theme', 'Tactics'),
      COALESCE(v_item->>'category', 'Tactics'),
      COALESCE(v_item->>'goal', 'Best move'),
      COALESCE(v_item->>'difficulty', 'Intermediate'),
      COALESCE(v_item->>'explanation', ''),
      CASE WHEN v_item ? 'themes' THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'themes')) ELSE '{}' END,
      COALESCE((v_item->>'enabled')::BOOLEAN, true)
    )
    ON CONFLICT (id) DO UPDATE SET
      fen = EXCLUDED.fen, moves = EXCLUDED.moves, rating = EXCLUDED.rating, theme = EXCLUDED.theme,
      category = EXCLUDED.category, goal = EXCLUDED.goal, difficulty = EXCLUDED.difficulty,
      explanation = EXCLUDED.explanation, themes = EXCLUDED.themes, enabled = EXCLUDED.enabled;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_bulk_import_puzzles(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_import_puzzles(JSONB) TO authenticated, service_role;
DROP VIEW IF EXISTS public.leaderboard_view CASCADE;
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
    p.full_name,
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
    p.iq_rating as iq_level,
    (p.iq_rating * 10 + p.community_score * 5 + COALESCE(r.wins, 0) * 15)::integer as xp,
    (FLOOR(SQRT(p.iq_rating * 10 + p.community_score * 5 + COALESCE(r.wins, 0) * 15) / 10) + 1)::integer as level,
    (SELECT COUNT(*) FROM public.community_achievements ca WHERE ca.user_id = p.id)::integer as achievements_count,
    COALESCE(pz.puzzle_rating, 100)::integer as puzzle_rating,
    COALESCE(pz.total_solved, 0)::integer as puzzle_solved,
    COALESCE(pz.current_streak, 0)::integer as win_streak,
    (SELECT COUNT(*) FROM public.community_follows cf WHERE cf.following_id = p.id)::integer as followers,
    (SELECT COUNT(*) FROM public.community_follows cf WHERE cf.follower_id = p.id)::integer as following
FROM public.profiles p
LEFT JOIN user_ratings r ON p.id = r.user_id
LEFT JOIN public.user_puzzle_stats pz ON p.id = pz.user_id;

-- 2. Create the RPC function that the frontend will call
DROP FUNCTION IF EXISTS public.get_dynamic_leaderboard(text, text, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_dynamic_leaderboard(text, text, text, text, text, text, boolean, integer, integer);
CREATE OR REPLACE FUNCTION public.get_dynamic_leaderboard(
    p_search text DEFAULT '',
    p_country text DEFAULT NULL,
    p_state text DEFAULT NULL,
    p_district text DEFAULT NULL,
    p_sort_col text DEFAULT 'iq_desc',
    p_timeframe text DEFAULT 'all_time',
    p_friends_only boolean DEFAULT false,
    p_limit integer DEFAULT 25,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    username text,
    full_name text,
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
    puzzle_rating integer,
    puzzle_solved integer,
    win_streak integer,
    followers integer,
    following integer,
    total_count bigint
) AS $body$
DECLARE
  v_cutoff TIMESTAMPTZ;
BEGIN
    IF p_timeframe = 'today' THEN v_cutoff := date_trunc('day', now());
    ELSIF p_timeframe = 'week' THEN v_cutoff := date_trunc('week', now());
    ELSIF p_timeframe = 'month' THEN v_cutoff := date_trunc('month', now());
    ELSE v_cutoff := '1970-01-01'::timestamptz;
    END IF;

    RETURN QUERY
    WITH dynamic_stats AS (
        SELECT 
            u.id as user_id,
            SUM(CASE WHEN g.winner_id = u.id THEN 1 ELSE 0 END)::integer as dyn_wins,
            SUM(CASE WHEN g.result = 'draw' OR g.result = 'stalemate' THEN 1 ELSE 0 END)::integer as dyn_draws,
            SUM(CASE WHEN g.winner_id IS NOT NULL AND g.winner_id != u.id THEN 1 ELSE 0 END)::integer as dyn_losses
        FROM public.profiles u
        LEFT JOIN public.games g ON (g.white_id = u.id OR g.black_id = u.id) AND g.created_at >= v_cutoff
        WHERE p_timeframe != 'all_time'
        GROUP BY u.id
    ),
    filtered_players AS (
        SELECT 
            v.id, v.username, v.full_name, v.avatar_url, v.title, v.country, v.state, v.district, 
            v.created_at, v.is_online, v.last_seen, v.premium_active, v.premium_expires_at, 
            v.community_score, v.rapid_rating, v.blitz_rating, v.bullet_rating, v.classical_rating, 
            v.overall_rating, 
            CASE WHEN p_timeframe = 'all_time' THEN v.wins ELSE COALESCE(d.dyn_wins, 0) END as wins,
            CASE WHEN p_timeframe = 'all_time' THEN v.losses ELSE COALESCE(d.dyn_losses, 0) END as losses,
            CASE WHEN p_timeframe = 'all_time' THEN v.draws ELSE COALESCE(d.dyn_draws, 0) END as draws,
            CASE WHEN p_timeframe = 'all_time' THEN v.total_matches ELSE (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0)) END as total_matches,
            CASE 
              WHEN p_timeframe = 'all_time' THEN v.win_rate 
              ELSE 
                CASE WHEN (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0)) > 0 
                THEN (COALESCE(d.dyn_wins, 0)::numeric / (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0))::numeric) * 100 
                ELSE 0 END 
            END as win_rate,
            v.iq_level, v.xp, v.level, v.achievements_count, 
            v.puzzle_rating, v.puzzle_solved, v.win_streak, v.followers, v.following
        FROM public.leaderboard_view v
        LEFT JOIN dynamic_stats d ON v.id = d.user_id
        WHERE 
            (p_search = '' OR v.username ILIKE '%' || p_search || '%' OR v.full_name ILIKE '%' || p_search || '%')
            AND (p_country IS NULL OR v.country = p_country)
            AND (p_state IS NULL OR v.state = p_state)
            AND (p_district IS NULL OR v.district = p_district)
            AND (p_friends_only = false OR EXISTS (SELECT 1 FROM public.community_follows cf WHERE cf.follower_id = auth.uid() AND cf.following_id = v.id))
    ),
    counted_players AS (
        SELECT COUNT(*) as exact_count FROM filtered_players
    )
    SELECT 
        f.id, f.username, f.full_name, f.avatar_url, f.title, f.country, f.state, f.district,
        f.created_at, f.is_online, f.last_seen, f.premium_active, f.premium_expires_at,
        f.community_score, f.rapid_rating, f.blitz_rating, f.bullet_rating, f.classical_rating,
        f.overall_rating, f.wins, f.losses, f.draws, f.total_matches, f.win_rate,
        f.iq_level, f.xp, f.level, f.achievements_count,
        f.puzzle_rating, f.puzzle_solved, f.win_streak, f.followers, f.following,
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
        CASE WHEN p_sort_col = 'active_desc' THEN f.last_seen END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'puzzle_desc' THEN f.puzzle_rating END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'streak_desc' THEN f.win_streak END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'score_desc' THEN f.community_score END DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;


-- CHAT SUBSYSTEM
-- Backs src/lib/api/chatClient.ts (Global Chat + Custom Rooms + Direct Messages...

-- ── 1. Core tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL CHECK (type IN ('global', 'room', 'dm')),
  slug         TEXT UNIQUE,
  name         TEXT,
  description  TEXT DEFAULT '',
  is_private   BOOLEAN NOT NULL DEFAULT false,
  owner_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
-- For DM channels: canonical pair (least(user), greatest(user)) so a unique ind...
  dm_user_a    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  dm_user_b    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_channels_dm_pair
  ON public.chat_channels(dm_user_a, dm_user_b) WHERE type = 'dm';
CREATE INDEX IF NOT EXISTS idx_chat_channels_type ON public.chat_channels(type);

CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
  muted_until TIMESTAMPTZ,
  is_banned   BOOLEAN NOT NULL DEFAULT false,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_channel_members_channel ON public.chat_channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_channel_members_user ON public.chat_channel_members(user_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  reply_to_id  UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_deleted   BOOLEAN NOT NULL DEFAULT false,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created
  ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned
  ON public.chat_messages(channel_id) WHERE is_pinned = true;

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message
  ON public.chat_message_reactions(message_id);

CREATE TABLE IF NOT EXISTS public.chat_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'harassment', 'fake_information', 'other')),
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_reports_status ON public.chat_reports(status);

-- ── 2

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;

-- Public rooms/global are readable by anyone; DMs/private rooms only by members
DROP POLICY IF EXISTS "chat_channels_select" ON public.chat_channels;
CREATE POLICY "chat_channels_select" ON public.chat_channels
  FOR SELECT USING (
    (type IN ('global', 'room') AND is_private = false)
    OR EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = chat_channels.id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_channel_members_select_own" ON public.chat_channel_members;
CREATE POLICY "chat_channel_members_select_own" ON public.chat_channel_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_channel_members me
      WHERE me.channel_id = chat_channel_members.channel_id AND me.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_messages_select_members" ON public.chat_messages;
CREATE POLICY "chat_messages_select_members" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_messages.channel_id
        AND ((c.type IN ('global', 'room') AND c.is_private = false)
          OR EXISTS (
            SELECT 1 FROM public.chat_channel_members m
            WHERE m.channel_id = c.id AND m.user_id = auth.uid()
          ))
    )
  );

DROP POLICY IF EXISTS "chat_message_reactions_select_members" ON public.chat_message_reactions;
CREATE POLICY "chat_message_reactions_select_members" ON public.chat_message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages msg
      JOIN public.chat_channels c ON c.id = msg.channel_id
      WHERE msg.id = chat_message_reactions.message_id
        AND ((c.type IN ('global', 'room') AND c.is_private = false)
          OR EXISTS (
            SELECT 1 FROM public.chat_channel_members m
            WHERE m.channel_id = c.id AND m.user_id = auth.uid()
          ))
    )
  );

-- Reports: only admins and the reporter may read; only authenticated users may ...
DROP POLICY IF EXISTS "chat_reports_select_admin_or_own" ON public.chat_reports;
CREATE POLICY "chat_reports_select_admin_or_own" ON public.chat_reports
  FOR SELECT USING (
    reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );

GRANT SELECT ON public.chat_channels, public.chat_channel_members, public.chat_messages,
  public.chat_message_reactions, public.chat_reports TO authenticated;
GRANT ALL ON public.chat_channels, public.chat_channel_members, public.chat_messages,
  public.chat_message_reactions, public.chat_reports TO service_role;

-- Realtime, so open channels can live-update (consistent with game_chat).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;

-- ── 3. Shared helpers ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._chat_user_lite(p_user_id UUID)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_user_id IS NULL THEN NULL ELSE json_build_object(
    'id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url
  ) END
  FROM public.profiles p WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public._chat_is_member(p_channel UUID, p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channel_members
    WHERE channel_id = p_channel AND user_id = p_user AND is_banned = false
  );
$$;

CREATE OR REPLACE FUNCTION public._chat_role(p_channel UUID, p_user UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.chat_channel_members
  WHERE channel_id = p_channel AND user_id = p_user;
$$;

-- Ensures the single global channel exists; auto-joins the caller to it.
CREATE OR REPLACE FUNCTION public._chat_ensure_global(p_user UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.chat_channels WHERE slug = 'global' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.chat_channels (type, slug, name, description, is_private)
    VALUES ('global', 'global', 'Global Chat', 'ChessOx community chat', false)
    ON CONFLICT (slug) DO UPDATE SET type = 'global', is_private = false
    RETURNING id INTO v_id;
  END IF;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.chat_channels WHERE slug = 'global' LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.chat_channels
    SET type = 'global', is_private = false
    WHERE id = v_id AND (type != 'global' OR is_private = true);

    IF p_user IS NOT NULL THEN
      INSERT INTO public.chat_channel_members (channel_id, user_id, role)
      VALUES (v_id, p_user, 'member')
      ON CONFLICT (channel_id, user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN v_id;
END; $$;

-- Named composite type (NOT the same as a RETURNS TABLE(...) signature, which i...
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_channel_row') THEN
    CREATE TYPE public.chat_channel_row AS (
      id UUID, type TEXT, slug TEXT, name TEXT, description TEXT, is_private BOOLEAN,
      owner_id UUID, member_count INT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
      my_role TEXT, is_member BOOLEAN, owner JSON, other_user JSON,
      last_message JSON, unread_count INT
    );
  END IF;
END $$;

-- Builds one ChatChannel row for channel c as seen by p_user.
CREATE OR REPLACE FUNCTION public._chat_channel_row(p_channel_id UUID, p_user UUID)
RETURNS SETOF public.chat_channel_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_other UUID;
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.type, c.slug, c.name, c.description, c.is_private, c.owner_id,
    (SELECT COUNT(*)::INT FROM public.chat_channel_members m WHERE m.channel_id = c.id),
    c.created_at, c.updated_at,
    (SELECT m.role FROM public.chat_channel_members m WHERE m.channel_id = c.id AND m.user_id = p_user),
    EXISTS (SELECT 1 FROM public.chat_channel_members m WHERE m.channel_id = c.id AND m.user_id = p_user),
    public._chat_user_lite(c.owner_id),
    CASE WHEN c.type = 'dm' THEN
      public._chat_user_lite(CASE WHEN c.dm_user_a = p_user THEN c.dm_user_b ELSE c.dm_user_a END)
    ELSE NULL END,
    (SELECT json_build_object('content', msg.content, 'created_at', msg.created_at, 'user_id', msg.user_id)
       FROM public.chat_messages msg
       WHERE msg.channel_id = c.id AND msg.is_deleted = false
       ORDER BY msg.created_at DESC LIMIT 1),
    (SELECT COUNT(*)::INT FROM public.chat_messages msg
       JOIN public.chat_channel_members m ON m.channel_id = c.id AND m.user_id = p_user
       WHERE msg.channel_id = c.id AND msg.is_deleted = false AND msg.created_at > m.last_read_at)
  FROM public.chat_channels c
  WHERE c.id = p_channel_id;
END; $$;

-- ── 4. Channel RPCs ───────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.chat_my_channels();
CREATE OR REPLACE FUNCTION public.chat_my_channels()
RETURNS SETOF public.chat_channel_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_global UUID;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  v_global := public._chat_ensure_global(auth.uid());
  RETURN QUERY
  SELECT r.* FROM public.chat_channel_members m
  CROSS JOIN LATERAL public._chat_channel_row(m.channel_id, auth.uid()) r
  WHERE m.user_id = auth.uid()
  ORDER BY (r.last_message->>'created_at') DESC NULLS LAST, r.created_at DESC;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_my_channels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_my_channels() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_discover_rooms(TEXT, INT);
CREATE OR REPLACE FUNCTION public.chat_discover_rooms(p_search TEXT DEFAULT NULL, p_limit INT DEFAULT 30)
RETURNS SETOF public.chat_channel_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT r.* FROM public.chat_channels c
  CROSS JOIN LATERAL public._chat_channel_row(c.id, auth.uid()) r
  WHERE c.type = 'room' AND c.is_private = false
    AND (p_search IS NULL OR p_search = '' OR c.name ILIKE '%' || p_search || '%')
  ORDER BY r.member_count DESC, c.created_at DESC
  LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_discover_rooms(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_discover_rooms(TEXT, INT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_get_channel(TEXT);
CREATE OR REPLACE FUNCTION public.chat_get_channel(p_slug_or_id TEXT)
RETURNS public.chat_channel_row
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_row public.chat_channel_row;
BEGIN
  IF p_slug_or_id = 'global' THEN
    v_id := public._chat_ensure_global(auth.uid());
  ELSE
    BEGIN
      v_id := p_slug_or_id::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_id := NULL;
    END;

    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM public.chat_channels WHERE slug = p_slug_or_id;
    END IF;
  END IF;

  IF v_id IS NOT NULL AND auth.uid() IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.chat_channels WHERE id = v_id AND (type = 'global' OR (type = 'room' AND is_private = false))) THEN
      INSERT INTO public.chat_channel_members (channel_id, user_id, role)
      VALUES (v_id, auth.uid(), 'member')
      ON CONFLICT (channel_id, user_id) DO NOTHING;
    END IF;
  END IF;
  
  IF v_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_row FROM public._chat_channel_row(v_id, auth.uid());
  RETURN v_row;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_get_channel(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_get_channel(TEXT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_create_room(TEXT, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.chat_create_room(p_name TEXT, p_description TEXT, p_is_private BOOLEAN)
RETURNS public.chat_channel_row
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_slug TEXT;
  v_row public.chat_channel_row;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF p_name IS NULL OR trim(p_name) = '' THEN RAISE EXCEPTION 'Room name required'; END IF;

  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::TEXT, 1, 6);

  INSERT INTO public.chat_channels (type, slug, name, description, is_private, owner_id)
  VALUES ('room', v_slug, p_name, COALESCE(p_description, ''), COALESCE(p_is_private, false), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (v_id, auth.uid(), 'owner');

  SELECT * INTO v_row FROM public._chat_channel_row(v_id, auth.uid());
  RETURN v_row;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_create_room(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_create_room(TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_update_room(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.chat_update_room(p_channel UUID, p_name TEXT, p_description TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public._chat_role(p_channel, auth.uid()) NOT IN ('owner', 'moderator') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.chat_channels
  SET name = p_name, description = COALESCE(p_description, ''), updated_at = now()
  WHERE id = p_channel AND type = 'room';
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_update_room(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_update_room(UUID, TEXT, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_delete_room(UUID);
CREATE OR REPLACE FUNCTION public.chat_delete_room(p_channel UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public._chat_role(p_channel, auth.uid()) != 'owner' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.chat_channels WHERE id = p_channel AND type = 'room';
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_delete_room(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_delete_room(UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_join_room(UUID);
CREATE OR REPLACE FUNCTION public.chat_join_room(p_channel UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_channels WHERE id = p_channel AND type = 'room' AND is_private = false) THEN
    RAISE EXCEPTION 'Room not found or private';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chat_channel_members WHERE channel_id = p_channel AND user_id = auth.uid() AND is_banned = true) THEN
    RAISE EXCEPTION 'You are banned from this room';
  END IF;
  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (p_channel, auth.uid(), 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_join_room(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_join_room(UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_leave_room(UUID);
CREATE OR REPLACE FUNCTION public.chat_leave_room(p_channel UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.chat_channel_members WHERE channel_id = p_channel AND user_id = auth.uid();
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_leave_room(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_leave_room(UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_invite_user(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.chat_invite_user(p_channel UUID, p_username TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target UUID;
BEGIN
  IF public._chat_role(p_channel, auth.uid()) NOT IN ('owner', 'moderator') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT id INTO v_target FROM public.profiles WHERE username = p_username;
  IF v_target IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (p_channel, v_target, 'member')
  ON CONFLICT (channel_id, user_id) DO UPDATE SET is_banned = false;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_invite_user(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_invite_user(UUID, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_remove_member(UUID, UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.chat_remove_member(p_channel UUID, p_user UUID, p_ban BOOLEAN DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public._chat_role(p_channel, auth.uid()) NOT IN ('owner', 'moderator') AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_ban THEN
    UPDATE public.chat_channel_members SET is_banned = true WHERE channel_id = p_channel AND user_id = p_user;
  ELSE
    DELETE FROM public.chat_channel_members WHERE channel_id = p_channel AND user_id = p_user;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_remove_member(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_remove_member(UUID, UUID, BOOLEAN) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_mute_member(UUID, UUID, INT);
CREATE OR REPLACE FUNCTION public.chat_mute_member(p_channel UUID, p_user UUID, p_minutes INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public._chat_role(p_channel, auth.uid()) NOT IN ('owner', 'moderator') AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.chat_channel_members
  SET muted_until = now() + make_interval(mins => GREATEST(p_minutes, 0))
  WHERE channel_id = p_channel AND user_id = p_user;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_mute_member(UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_mute_member(UUID, UUID, INT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_set_moderator(UUID, UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.chat_set_moderator(p_channel UUID, p_user UUID, p_is_mod BOOLEAN)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public._chat_role(p_channel, auth.uid()) != 'owner' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.chat_channel_members
  SET role = CASE WHEN p_is_mod THEN 'moderator' ELSE 'member' END
  WHERE channel_id = p_channel AND user_id = p_user AND role != 'owner';
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_set_moderator(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_set_moderator(UUID, UUID, BOOLEAN) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_get_or_create_dm(UUID);
CREATE OR REPLACE FUNCTION public.chat_get_or_create_dm(p_other UUID)
RETURNS public.chat_channel_row
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_a UUID;
  v_b UUID;
  v_row public.chat_channel_row;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF p_other = auth.uid() THEN RAISE EXCEPTION 'Cannot DM yourself'; END IF;

  v_a := LEAST(auth.uid(), p_other);
  v_b := GREATEST(auth.uid(), p_other);

  SELECT id INTO v_id FROM public.chat_channels WHERE type = 'dm' AND dm_user_a = v_a AND dm_user_b = v_b;

  IF v_id IS NULL THEN
    INSERT INTO public.chat_channels (type, is_private, dm_user_a, dm_user_b)
    VALUES ('dm', true, v_a, v_b)
    RETURNING id INTO v_id;

    INSERT INTO public.chat_channel_members (channel_id, user_id, role)
    VALUES (v_id, auth.uid(), 'member'), (v_id, p_other, 'member')
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  SELECT * INTO v_row FROM public._chat_channel_row(v_id, auth.uid());
  RETURN v_row;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_get_or_create_dm(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_get_or_create_dm(UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_mark_read(UUID);
CREATE OR REPLACE FUNCTION public.chat_mark_read(p_channel UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chat_channel_members SET last_read_at = now()
  WHERE channel_id = p_channel AND user_id = auth.uid();
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_mark_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_mark_read(UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_channel_members(UUID);
CREATE OR REPLACE FUNCTION public.chat_channel_members(p_channel UUID)
RETURNS TABLE (
  id UUID, username TEXT, full_name TEXT, avatar_url TEXT,
  premium_tier TEXT, role TEXT, muted_until TIMESTAMPTZ, joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.avatar_url,
    p.premium_tier::TEXT, m.role, m.muted_until, m.joined_at
  FROM public.chat_channel_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.channel_id = p_channel AND m.is_banned = false
  ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, m.joined_at ASC;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_channel_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_channel_members(UUID) TO anon, authenticated, service_role;

-- ── 5. Message RPCs ───────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_message_row') THEN
    CREATE TYPE public.chat_message_row AS (
      id UUID, channel_id UUID, user_id UUID, content TEXT, reply_to_id UUID,
      is_deleted BOOLEAN, is_pinned BOOLEAN, created_at TIMESTAMPTZ,
      author JSON, reply_to JSON, reactions JSON
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._chat_message_row(p_message_id UUID)
RETURNS SETOF public.chat_message_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    msg.id, msg.channel_id, msg.user_id, msg.content, msg.reply_to_id,
    msg.is_deleted, msg.is_pinned, msg.created_at,
    (SELECT json_build_object(
       'id', p.id, 'username', p.username, 'full_name', p.full_name,
       'avatar_url', p.avatar_url, 'premium_tier', p.premium_tier
     ) FROM public.profiles p WHERE p.id = msg.user_id),
    (SELECT json_build_object(
       'id', rp.id, 'content', rp.content, 'user_id', rp.user_id,
       'author_name', pr.full_name
     ) FROM public.chat_messages rp
     LEFT JOIN public.profiles pr ON pr.id = rp.user_id
     WHERE rp.id = msg.reply_to_id),
    COALESCE((
      SELECT json_agg(json_build_object('emoji', t.emoji, 'count', t.cnt, 'mine', t.mine))
      FROM (
        SELECT r.emoji, COUNT(*) AS cnt, bool_or(r.user_id = auth.uid()) AS mine
        FROM public.chat_message_reactions r
        WHERE r.message_id = msg.id
        GROUP BY r.emoji
      ) t
    ), '[]'::json)
  FROM public.chat_messages msg
  WHERE msg.id = p_message_id;
END; $$;

DROP FUNCTION IF EXISTS public.chat_channel_feed(UUID, TIMESTAMPTZ, INT);
CREATE OR REPLACE FUNCTION public.chat_channel_feed(p_channel UUID, p_before TIMESTAMPTZ DEFAULT NULL, p_limit INT DEFAULT 40)
RETURNS SETOF public.chat_message_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._chat_is_member(p_channel, auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.chat_channels WHERE id = p_channel AND type IN ('global', 'room') AND is_private = false) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT r.* FROM public.chat_messages msg
  CROSS JOIN LATERAL public._chat_message_row(msg.id) r
  WHERE msg.channel_id = p_channel
    AND (p_before IS NULL OR msg.created_at < p_before)
  ORDER BY msg.created_at DESC
  LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_channel_feed(UUID, TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_channel_feed(UUID, TIMESTAMPTZ, INT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_search_messages(UUID, TEXT, INT);
CREATE OR REPLACE FUNCTION public.chat_search_messages(p_channel UUID, p_query TEXT, p_limit INT DEFAULT 30)
RETURNS SETOF public.chat_message_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._chat_is_member(p_channel, auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.chat_channels WHERE id = p_channel AND type IN ('global', 'room') AND is_private = false) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT r.* FROM public.chat_messages msg
  CROSS JOIN LATERAL public._chat_message_row(msg.id) r
  WHERE msg.channel_id = p_channel AND msg.is_deleted = false
    AND msg.content ILIKE '%' || p_query || '%'
  ORDER BY msg.created_at DESC
  LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_search_messages(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_search_messages(UUID, TEXT, INT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_pinned_messages(UUID);
CREATE OR REPLACE FUNCTION public.chat_pinned_messages(p_channel UUID)
RETURNS SETOF public.chat_message_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT r.* FROM public.chat_messages msg
  CROSS JOIN LATERAL public._chat_message_row(msg.id) r
  WHERE msg.channel_id = p_channel AND msg.is_pinned = true AND msg.is_deleted = false
  ORDER BY msg.created_at DESC;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_pinned_messages(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_pinned_messages(UUID) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_send_message(UUID, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.chat_send_message(p_channel UUID, p_content TEXT, p_reply_to UUID DEFAULT NULL)
RETURNS public.chat_message_row
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_muted TIMESTAMPTZ;
  v_row public.chat_message_row;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF p_content IS NULL OR trim(p_content) = '' THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  IF length(p_content) > 2000 THEN RAISE EXCEPTION 'Message too long'; END IF;

  -- Auto-join global or public rooms; require existing membership for private rooms/dms.
  IF EXISTS (SELECT 1 FROM public.chat_channels WHERE id = p_channel AND (type = 'global' OR (type = 'room' AND is_private = false))) THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id, role)
    VALUES (p_channel, auth.uid(), 'member')
    ON CONFLICT (channel_id, user_id) DO NOTHING;

    -- Inline check avoids snapshot caching issues of STABLE _chat_is_member
    IF EXISTS (SELECT 1 FROM public.chat_channel_members WHERE channel_id = p_channel AND user_id = auth.uid() AND is_banned = true) THEN
      RAISE EXCEPTION 'You are banned from this channel';
    END IF;
  ELSE
    IF NOT public._chat_is_member(p_channel, auth.uid()) THEN
      RAISE EXCEPTION 'Not a member of this channel';
    END IF;
  END IF;

  SELECT muted_until INTO v_muted FROM public.chat_channel_members
  WHERE channel_id = p_channel AND user_id = auth.uid();
  IF v_muted IS NOT NULL AND v_muted > now() THEN
    RAISE EXCEPTION 'You are muted in this channel until %', v_muted;
  END IF;

  INSERT INTO public.chat_messages (channel_id, user_id, content, reply_to_id)
  VALUES (p_channel, auth.uid(), p_content, p_reply_to)
  RETURNING id INTO v_id;

  UPDATE public.chat_channels SET updated_at = now() WHERE id = p_channel;

  SELECT * INTO v_row FROM public._chat_message_row(v_id);
  RETURN v_row;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_send_message(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_send_message(UUID, TEXT, UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_delete_message(UUID);
CREATE OR REPLACE FUNCTION public.chat_delete_message(p_message UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_channel UUID;
  v_author UUID;
BEGIN
  SELECT channel_id, user_id INTO v_channel, v_author FROM public.chat_messages WHERE id = p_message;
  IF v_channel IS NULL THEN RAISE EXCEPTION 'Message not found'; END IF;

  IF v_author != auth.uid()
     AND public._chat_role(v_channel, auth.uid()) NOT IN ('owner', 'moderator')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.chat_messages SET is_deleted = true, content = '[deleted]' WHERE id = p_message;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_delete_message(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_delete_message(UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_react(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.chat_react(p_message UUID, p_emoji TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existed BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.chat_message_reactions WHERE message_id = p_message AND user_id = auth.uid() AND emoji = p_emoji
  ) INTO v_existed;

  IF v_existed THEN
    DELETE FROM public.chat_message_reactions WHERE message_id = p_message AND user_id = auth.uid() AND emoji = p_emoji;
    RETURN false;
  ELSE
    INSERT INTO public.chat_message_reactions (message_id, user_id, emoji) VALUES (p_message, auth.uid(), p_emoji);
    RETURN true;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_react(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_react(UUID, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_pin_message(UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.chat_pin_message(p_message UUID, p_pinned BOOLEAN)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_channel UUID;
BEGIN
  SELECT channel_id INTO v_channel FROM public.chat_messages WHERE id = p_message;
  IF v_channel IS NULL THEN RAISE EXCEPTION 'Message not found'; END IF;
  IF public._chat_role(v_channel, auth.uid()) NOT IN ('owner', 'moderator') AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.chat_messages SET is_pinned = p_pinned WHERE id = p_message;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_pin_message(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_pin_message(UUID, BOOLEAN) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.chat_report_message(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.chat_report_message(p_message UUID, p_reason TEXT, p_details TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_messages WHERE id = p_message) THEN
    RAISE EXCEPTION 'Message not found';
  END IF;
  INSERT INTO public.chat_reports (message_id, reporter_id, reason, details)
  VALUES (p_message, auth.uid(), p_reason, p_details);
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_report_message(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_report_message(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ── 6. Admin RPCs ─────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.admin_chat_stats();
CREATE OR REPLACE FUNCTION public.admin_chat_stats()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN json_build_object(
    'rooms', (SELECT COUNT(*) FROM public.chat_channels WHERE type = 'room'),
    'dms', (SELECT COUNT(*) FROM public.chat_channels WHERE type = 'dm'),
    'messages_24h', (SELECT COUNT(*) FROM public.chat_messages WHERE created_at > now() - interval '24 hours'),
    'open_reports', (SELECT COUNT(*) FROM public.chat_reports WHERE status = 'open')
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_chat_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_chat_stats() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_resolve_chat_report(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_resolve_chat_report(p_report_id UUID, p_status TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_status NOT IN ('resolved', 'dismissed', 'open') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  UPDATE public.chat_reports
  SET status = p_status, resolved_at = CASE WHEN p_status = 'open' THEN NULL ELSE now() END
  WHERE id = p_report_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_chat_report(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_chat_report(UUID, TEXT) TO authenticated, service_role;

-- CHAT SUBSYSTEM — ROOM SYSTEM UPGRADE
-- Adds: 14 permanent/system rooms (World Chat + 11 language General Chats + New...
-- section above; no existing object is dropped/renamed.

-- ── 1. New columns on chat_channels ──────────────────────────────────
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS room_code TEXT;
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS max_members INT;
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '💬';
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS coming_soon BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_chat_channels_room_code') THEN
    CREATE UNIQUE INDEX idx_chat_channels_room_code ON public.chat_channels(room_code) WHERE room_code IS NOT NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_chat_channels_name_search ON public.chat_channels(name);
CREATE INDEX IF NOT EXISTS idx_chat_channels_permanent ON public.chat_channels(is_permanent) WHERE is_permanent = true;

-- ── 2
INSERT INTO public.chat_channels (type, slug, name, description, is_private, is_permanent, icon, sort_order)
VALUES

  ('room', 'new-player-chat', 'New Player Chat', 'Say hello — a welcoming room for new ChessOx players', false, true, '🆕', 13),
  ('room', 'location-chat', 'Location Chat', 'Chat with players near you — coming soon', false, true, '📍', 14)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.chat_channels SET coming_soon = true, is_permanent = true
WHERE slug = 'location-chat' AND coming_soon = false;

-- ── 3. Upgrade _chat_ensure_global to mark World Chat permanent ─────
CREATE OR REPLACE FUNCTION public._chat_ensure_global(p_user UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.chat_channels WHERE type = 'global' AND slug = 'global' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.chat_channels (type, slug, name, description, is_private, is_permanent, icon, sort_order)
    VALUES ('global', 'global', 'Global Chat', 'Every ChessOx player, one room', false, true, '🌍', 1)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.chat_channels
    SET is_permanent = true, icon = COALESCE(icon, '🌍'), sort_order = 1
    WHERE id = v_id AND (is_permanent = false OR icon IS NULL);
  END IF;

  IF p_user IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id, role)
    VALUES (v_id, p_user, 'member')
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  RETURN v_id;
END; $$;

-- ── 4. Extend chat_channel_row with the new display fields ──────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.chat_channel_row'::regclass AND attname = 'room_code') THEN
    ALTER TYPE public.chat_channel_row ADD ATTRIBUTE room_code TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.chat_channel_row'::regclass AND attname = 'icon') THEN
    ALTER TYPE public.chat_channel_row ADD ATTRIBUTE icon TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.chat_channel_row'::regclass AND attname = 'max_members') THEN
    ALTER TYPE public.chat_channel_row ADD ATTRIBUTE max_members INT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.chat_channel_row'::regclass AND attname = 'online_count') THEN
    ALTER TYPE public.chat_channel_row ADD ATTRIBUTE online_count INT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.chat_channel_row'::regclass AND attname = 'is_permanent') THEN
    ALTER TYPE public.chat_channel_row ADD ATTRIBUTE is_permanent BOOLEAN;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.chat_channel_row'::regclass AND attname = 'coming_soon') THEN
    ALTER TYPE public.chat_channel_row ADD ATTRIBUTE coming_soon BOOLEAN;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.chat_channel_row'::regclass AND attname = 'password_protected') THEN
    ALTER TYPE public.chat_channel_row ADD ATTRIBUTE password_protected BOOLEAN;
  END IF;
END $$;

-- Re-declare the row-builder so the SELECT list matches the now-wider type (new...
CREATE OR REPLACE FUNCTION public._chat_channel_row(p_channel_id UUID, p_user UUID)
RETURNS SETOF public.chat_channel_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.type, c.slug, c.name, c.description, c.is_private, c.owner_id,
    (SELECT COUNT(*)::INT FROM public.chat_channel_members m WHERE m.channel_id = c.id),
    c.created_at, c.updated_at,
    (SELECT m.role FROM public.chat_channel_members m WHERE m.channel_id = c.id AND m.user_id = p_user),
    EXISTS (SELECT 1 FROM public.chat_channel_members m WHERE m.channel_id = c.id AND m.user_id = p_user),
    public._chat_user_lite(c.owner_id),
    CASE WHEN c.type = 'dm' THEN
      public._chat_user_lite(CASE WHEN c.dm_user_a = p_user THEN c.dm_user_b ELSE c.dm_user_a END)
    ELSE NULL END,
    (SELECT json_build_object('content', msg.content, 'created_at', msg.created_at, 'user_id', msg.user_id)
       FROM public.chat_messages msg
       WHERE msg.channel_id = c.id AND msg.is_deleted = false
       ORDER BY msg.created_at DESC LIMIT 1),
    (SELECT COUNT(*)::INT FROM public.chat_messages msg
       JOIN public.chat_channel_members m ON m.channel_id = c.id AND m.user_id = p_user
       WHERE msg.channel_id = c.id AND msg.is_deleted = false AND msg.created_at > m.last_read_at),
    c.room_code, c.icon, c.max_members,
    (SELECT COUNT(*)::INT FROM public.chat_channel_members m
       WHERE m.channel_id = c.id AND m.last_read_at > now() - interval '5 minutes'),
    c.is_permanent, c.coming_soon, (c.password_hash IS NOT NULL)
  FROM public.chat_channels c
  WHERE c.id = p_channel_id;
END; $$;

-- ── 5. Room code generator (ROOM-XXXXXXXX, guaranteed unique) ───────
CREATE OR REPLACE FUNCTION public._chat_gen_room_code()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  chars TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_code TEXT;
  i INT;
BEGIN
  LOOP
    v_code := 'ROOM-';
    FOR i IN 1..8 LOOP
      v_code := v_code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.chat_channels WHERE room_code = v_code);
  END LOOP;
  RETURN v_code;
END; $$;

-- ── 6
DROP FUNCTION IF EXISTS public.chat_permanent_rooms();
CREATE OR REPLACE FUNCTION public.chat_permanent_rooms()
RETURNS SETOF public.chat_channel_row
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._chat_ensure_global(auth.uid());
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id, role)
    SELECT c.id, auth.uid(), 'member'
    FROM public.chat_channels c
    WHERE c.is_permanent = true AND c.type = 'room' AND c.coming_soon = false
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT r.* FROM public.chat_channels c
  CROSS JOIN LATERAL public._chat_channel_row(c.id, auth.uid()) r
  WHERE c.is_permanent = true
  ORDER BY c.sort_order ASC;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_permanent_rooms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_permanent_rooms() TO anon, authenticated, service_role;

-- ── 7. Public / Private room discovery (search by name or Room ID) ──
CREATE OR REPLACE FUNCTION public.chat_discover_rooms(p_search TEXT DEFAULT NULL, p_limit INT DEFAULT 30)
RETURNS SETOF public.chat_channel_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT r.* FROM public.chat_channels c
  CROSS JOIN LATERAL public._chat_channel_row(c.id, auth.uid()) r
  WHERE c.type = 'room' AND c.is_private = false AND c.is_permanent = false
    AND (p_search IS NULL OR p_search = '' OR c.name ILIKE '%' || p_search || '%' OR c.room_code ILIKE '%' || p_search || '%')
  ORDER BY r.member_count DESC, c.created_at DESC
  LIMIT p_limit;
END; $$;

DROP FUNCTION IF EXISTS public.chat_discover_private_rooms(TEXT, INT);
CREATE OR REPLACE FUNCTION public.chat_discover_private_rooms(p_search TEXT DEFAULT NULL, p_limit INT DEFAULT 30)
RETURNS SETOF public.chat_channel_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
-- Metadata only (name/owner/counts/last message) — password_hash is never selec...
  RETURN QUERY
  SELECT r.* FROM public.chat_channels c
  CROSS JOIN LATERAL public._chat_channel_row(c.id, auth.uid()) r
  WHERE c.type = 'room' AND c.is_private = true AND c.is_permanent = false
    AND (p_search IS NULL OR p_search = '' OR c.name ILIKE '%' || p_search || '%' OR c.room_code ILIKE '%' || p_search || '%')
  ORDER BY r.member_count DESC, c.created_at DESC
  LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_discover_private_rooms(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_discover_private_rooms(TEXT, INT) TO anon, authenticated, service_role;

-- ── 8. Create room — extended with icon / max members / password ────
DROP FUNCTION IF EXISTS public.chat_create_room(TEXT, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.chat_create_room(
  p_name TEXT, p_description TEXT, p_is_private BOOLEAN,
  p_icon TEXT DEFAULT '💬', p_max_members INT DEFAULT NULL, p_password TEXT DEFAULT NULL
)
RETURNS public.chat_channel_row
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_slug TEXT;
  v_code TEXT;
  v_row public.chat_channel_row;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF p_name IS NULL OR trim(p_name) = '' THEN RAISE EXCEPTION 'Room name required'; END IF;
  IF p_is_private AND (p_password IS NULL OR trim(p_password) = '') THEN
    RAISE EXCEPTION 'Password required for private rooms';
  END IF;

  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::TEXT, 1, 6);
  v_code := public._chat_gen_room_code();

  INSERT INTO public.chat_channels (
    type, slug, name, description, is_private, owner_id,
    room_code, icon, max_members, password_hash
  )
  VALUES (
    'room', v_slug, p_name, COALESCE(p_description, ''), COALESCE(p_is_private, false), auth.uid(),
    v_code, COALESCE(NULLIF(trim(p_icon), ''), '💬'), p_max_members,
    CASE WHEN p_is_private THEN crypt(p_password, gen_salt('bf')) ELSE NULL END
  )
  RETURNING id INTO v_id;

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (v_id, auth.uid(), 'owner');

  SELECT * INTO v_row FROM public._chat_channel_row(v_id, auth.uid());
  RETURN v_row;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_create_room(TEXT, TEXT, BOOLEAN, TEXT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_create_room(TEXT, TEXT, BOOLEAN, TEXT, INT, TEXT) TO authenticated, service_role;

-- ── 9
DROP FUNCTION IF EXISTS public.chat_join_private_room(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.chat_join_private_room(p_room_code TEXT, p_password TEXT)
RETURNS public.chat_channel_row
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_hash TEXT;
  v_max INT;
  v_count INT;
  v_row public.chat_channel_row;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;

  SELECT id, password_hash, max_members INTO v_id, v_hash, v_max
  FROM public.chat_channels
  WHERE (room_code = p_room_code OR slug = p_room_code) AND type = 'room' AND is_private = true;

  IF v_id IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_hash IS NULL OR p_password IS NULL OR crypt(p_password, v_hash) != v_hash THEN
    RAISE EXCEPTION 'Incorrect room ID or password';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chat_channel_members WHERE channel_id = v_id AND user_id = auth.uid() AND is_banned = true) THEN
    RAISE EXCEPTION 'You are banned from this room';
  END IF;

  IF v_max IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM public.chat_channel_members WHERE channel_id = v_id;
    IF v_count >= v_max AND NOT EXISTS (SELECT 1 FROM public.chat_channel_members WHERE channel_id = v_id AND user_id = auth.uid()) THEN
      RAISE EXCEPTION 'This room is full';
    END IF;
  END IF;

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (v_id, auth.uid(), 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  SELECT * INTO v_row FROM public._chat_channel_row(v_id, auth.uid());
  RETURN v_row;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_join_private_room(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_join_private_room(TEXT, TEXT) TO authenticated, service_role;

-- ── 10. Protect permanent rooms from rename/delete ───────────────────
CREATE OR REPLACE FUNCTION public.chat_update_room(p_channel UUID, p_name TEXT, p_description TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public._chat_role(p_channel, auth.uid()) NOT IN ('owner', 'moderator') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chat_channels WHERE id = p_channel AND is_permanent = true) THEN
    RAISE EXCEPTION 'Permanent rooms cannot be renamed';
  END IF;
  UPDATE public.chat_channels
  SET name = p_name, description = COALESCE(p_description, ''), updated_at = now()
  WHERE id = p_channel AND type = 'room';
END; $$;

CREATE OR REPLACE FUNCTION public.chat_delete_room(p_channel UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chat_channels WHERE id = p_channel AND is_permanent = true) THEN
    RAISE EXCEPTION 'Permanent rooms cannot be deleted';
  END IF;
  IF public._chat_role(p_channel, auth.uid()) != 'owner' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.chat_channels WHERE id = p_channel AND type = 'room';
END; $$;

-- Also block joining a permanent room's public-join RPC as a no-op guard (they ...
CREATE OR REPLACE FUNCTION public.chat_join_room(p_channel UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_channels WHERE id = p_channel AND type = 'room' AND is_private = false) THEN
    RAISE EXCEPTION 'Room not found or private';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chat_channel_members WHERE channel_id = p_channel AND user_id = auth.uid() AND is_banned = true) THEN
    RAISE EXCEPTION 'You are banned from this room';
  END IF;
  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (p_channel, auth.uid(), 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END; $$;
-- SECTION: PUZZLE PROGRESS AND DAILY LIMITS
-- 1. Create a view that joins all the player stats together by pivoting the ratings table
DROP VIEW IF EXISTS public.leaderboard_view CASCADE;
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
    p.full_name,
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
    p.iq_rating as iq_level,
    (p.iq_rating * 10 + p.community_score * 5 + COALESCE(r.wins, 0) * 15)::integer as xp,
    (FLOOR(SQRT(p.iq_rating * 10 + p.community_score * 5 + COALESCE(r.wins, 0) * 15) / 10) + 1)::integer as level,
    (SELECT COUNT(*) FROM public.community_achievements ca WHERE ca.user_id = p.id)::integer as achievements_count,
    COALESCE(pz.puzzle_rating, 100)::integer as puzzle_rating,
    COALESCE(pz.total_solved, 0)::integer as puzzle_solved,
    COALESCE(pz.current_streak, 0)::integer as win_streak,
    (SELECT COUNT(*) FROM public.community_follows cf WHERE cf.following_id = p.id)::integer as followers,
    (SELECT COUNT(*) FROM public.community_follows cf WHERE cf.follower_id = p.id)::integer as following
FROM public.profiles p
LEFT JOIN user_ratings r ON p.id = r.user_id
LEFT JOIN public.user_puzzle_stats pz ON p.id = pz.user_id;

-- 2. Create the RPC function that the frontend will call
DROP FUNCTION IF EXISTS public.get_dynamic_leaderboard(text, text, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_dynamic_leaderboard(text, text, text, text, text, text, boolean, integer, integer);
CREATE OR REPLACE FUNCTION public.get_dynamic_leaderboard(
    p_search text DEFAULT '',
    p_country text DEFAULT NULL,
    p_state text DEFAULT NULL,
    p_district text DEFAULT NULL,
    p_sort_col text DEFAULT 'iq_desc',
    p_timeframe text DEFAULT 'all_time',
    p_friends_only boolean DEFAULT false,
    p_limit integer DEFAULT 25,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    username text,
    full_name text,
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
    puzzle_rating integer,
    puzzle_solved integer,
    win_streak integer,
    followers integer,
    following integer,
    total_count bigint
) AS $body$
DECLARE
  v_cutoff TIMESTAMPTZ;
BEGIN
    IF p_timeframe = 'today' THEN v_cutoff := date_trunc('day', now());
    ELSIF p_timeframe = 'week' THEN v_cutoff := date_trunc('week', now());
    ELSIF p_timeframe = 'month' THEN v_cutoff := date_trunc('month', now());
    ELSE v_cutoff := '1970-01-01'::timestamptz;
    END IF;

    RETURN QUERY
    WITH dynamic_stats AS (
        SELECT 
            u.id as user_id,
            SUM(CASE WHEN g.winner_id = u.id THEN 1 ELSE 0 END)::integer as dyn_wins,
            SUM(CASE WHEN g.result = 'draw' OR g.result = 'stalemate' THEN 1 ELSE 0 END)::integer as dyn_draws,
            SUM(CASE WHEN g.winner_id IS NOT NULL AND g.winner_id != u.id THEN 1 ELSE 0 END)::integer as dyn_losses
        FROM public.profiles u
        LEFT JOIN public.games g ON (g.white_id = u.id OR g.black_id = u.id) AND g.created_at >= v_cutoff
        WHERE p_timeframe != 'all_time'
        GROUP BY u.id
    ),
    filtered_players AS (
        SELECT 
            v.id, v.username, v.full_name, v.avatar_url, v.title, v.country, v.state, v.district, 
            v.created_at, v.is_online, v.last_seen, v.premium_active, v.premium_expires_at, 
            v.community_score, v.rapid_rating, v.blitz_rating, v.bullet_rating, v.classical_rating, 
            v.overall_rating, 
            CASE WHEN p_timeframe = 'all_time' THEN v.wins ELSE COALESCE(d.dyn_wins, 0) END as wins,
            CASE WHEN p_timeframe = 'all_time' THEN v.losses ELSE COALESCE(d.dyn_losses, 0) END as losses,
            CASE WHEN p_timeframe = 'all_time' THEN v.draws ELSE COALESCE(d.dyn_draws, 0) END as draws,
            CASE WHEN p_timeframe = 'all_time' THEN v.total_matches ELSE (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0)) END as total_matches,
            CASE 
              WHEN p_timeframe = 'all_time' THEN v.win_rate 
              ELSE 
                CASE WHEN (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0)) > 0 
                THEN (COALESCE(d.dyn_wins, 0)::numeric / (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0))::numeric) * 100 
                ELSE 0 END 
            END as win_rate,
            v.iq_level, v.xp, v.level, v.achievements_count, 
            v.puzzle_rating, v.puzzle_solved, v.win_streak, v.followers, v.following
        FROM public.leaderboard_view v
        LEFT JOIN dynamic_stats d ON v.id = d.user_id
        WHERE 
            (p_search = '' OR v.username ILIKE '%' || p_search || '%' OR v.full_name ILIKE '%' || p_search || '%')
            AND (p_country IS NULL OR v.country = p_country)
            AND (p_state IS NULL OR v.state = p_state)
            AND (p_district IS NULL OR v.district = p_district)
            AND (p_friends_only = false OR EXISTS (SELECT 1 FROM public.community_follows cf WHERE cf.follower_id = auth.uid() AND cf.following_id = v.id))
    ),
    counted_players AS (
        SELECT COUNT(*) as exact_count FROM filtered_players
    )
    SELECT 
        f.id, f.username, f.full_name, f.avatar_url, f.title, f.country, f.state, f.district,
        f.created_at, f.is_online, f.last_seen, f.premium_active, f.premium_expires_at,
        f.community_score, f.rapid_rating, f.blitz_rating, f.bullet_rating, f.classical_rating,
        f.overall_rating, f.wins, f.losses, f.draws, f.total_matches, f.win_rate,
        f.iq_level, f.xp, f.level, f.achievements_count,
        f.puzzle_rating, f.puzzle_solved, f.win_streak, f.followers, f.following,
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
        CASE WHEN p_sort_col = 'active_desc' THEN f.last_seen END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'puzzle_desc' THEN f.puzzle_rating END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'streak_desc' THEN f.win_streak END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'score_desc' THEN f.community_score END DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;





-- 1. Create a view that joins all the player stats together by pivoting the ratings table
DROP VIEW IF EXISTS public.leaderboard_view CASCADE;
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
    p.full_name,
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
    p.iq_rating as iq_level,
    (p.iq_rating * 10 + p.community_score * 5 + COALESCE(r.wins, 0) * 15)::integer as xp,
    (FLOOR(SQRT(p.iq_rating * 10 + p.community_score * 5 + COALESCE(r.wins, 0) * 15) / 10) + 1)::integer as level,
    (SELECT COUNT(*) FROM public.community_achievements ca WHERE ca.user_id = p.id)::integer as achievements_count,
    COALESCE(pz.puzzle_rating, 100)::integer as puzzle_rating,
    COALESCE(pz.total_solved, 0)::integer as puzzle_solved,
    COALESCE(pz.current_streak, 0)::integer as win_streak,
    (SELECT COUNT(*) FROM public.community_follows cf WHERE cf.following_id = p.id)::integer as followers,
    (SELECT COUNT(*) FROM public.community_follows cf WHERE cf.follower_id = p.id)::integer as following
FROM public.profiles p
LEFT JOIN user_ratings r ON p.id = r.user_id
LEFT JOIN public.user_puzzle_stats pz ON p.id = pz.user_id;

-- 2. Create the RPC function that the frontend will call
DROP FUNCTION IF EXISTS public.get_dynamic_leaderboard(text, text, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_dynamic_leaderboard(text, text, text, text, text, text, boolean, integer, integer);
CREATE OR REPLACE FUNCTION public.get_dynamic_leaderboard(
    p_search text DEFAULT '',
    p_country text DEFAULT NULL,
    p_state text DEFAULT NULL,
    p_district text DEFAULT NULL,
    p_sort_col text DEFAULT 'iq_desc',
    p_timeframe text DEFAULT 'all_time',
    p_friends_only boolean DEFAULT false,
    p_limit integer DEFAULT 25,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    username text,
    full_name text,
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
    puzzle_rating integer,
    puzzle_solved integer,
    win_streak integer,
    followers integer,
    following integer,
    total_count bigint
) AS $body$
DECLARE
  v_cutoff TIMESTAMPTZ;
BEGIN
    IF p_timeframe = 'today' THEN v_cutoff := date_trunc('day', now());
    ELSIF p_timeframe = 'week' THEN v_cutoff := date_trunc('week', now());
    ELSIF p_timeframe = 'month' THEN v_cutoff := date_trunc('month', now());
    ELSE v_cutoff := '1970-01-01'::timestamptz;
    END IF;

    RETURN QUERY
    WITH dynamic_stats AS (
        SELECT 
            u.id as user_id,
            SUM(CASE WHEN g.winner_id = u.id THEN 1 ELSE 0 END)::integer as dyn_wins,
            SUM(CASE WHEN g.result = 'draw' OR g.result = 'stalemate' THEN 1 ELSE 0 END)::integer as dyn_draws,
            SUM(CASE WHEN g.winner_id IS NOT NULL AND g.winner_id != u.id THEN 1 ELSE 0 END)::integer as dyn_losses
        FROM public.profiles u
        LEFT JOIN public.games g ON (g.white_id = u.id OR g.black_id = u.id) AND g.created_at >= v_cutoff
        WHERE p_timeframe != 'all_time'
        GROUP BY u.id
    ),
    filtered_players AS (
        SELECT 
            v.id, v.username, v.full_name, v.avatar_url, v.title, v.country, v.state, v.district, 
            v.created_at, v.is_online, v.last_seen, v.premium_active, v.premium_expires_at, 
            v.community_score, v.rapid_rating, v.blitz_rating, v.bullet_rating, v.classical_rating, 
            v.overall_rating, 
            CASE WHEN p_timeframe = 'all_time' THEN v.wins ELSE COALESCE(d.dyn_wins, 0) END as wins,
            CASE WHEN p_timeframe = 'all_time' THEN v.losses ELSE COALESCE(d.dyn_losses, 0) END as losses,
            CASE WHEN p_timeframe = 'all_time' THEN v.draws ELSE COALESCE(d.dyn_draws, 0) END as draws,
            CASE WHEN p_timeframe = 'all_time' THEN v.total_matches ELSE (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0)) END as total_matches,
            CASE 
              WHEN p_timeframe = 'all_time' THEN v.win_rate 
              ELSE 
                CASE WHEN (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0)) > 0 
                THEN (COALESCE(d.dyn_wins, 0)::numeric / (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0))::numeric) * 100 
                ELSE 0 END 
            END as win_rate,
            v.iq_level, v.xp, v.level, v.achievements_count, 
            v.puzzle_rating, v.puzzle_solved, v.win_streak, v.followers, v.following
        FROM public.leaderboard_view v
        LEFT JOIN dynamic_stats d ON v.id = d.user_id
        WHERE 
            (p_search = '' OR v.username ILIKE '%' || p_search || '%' OR v.full_name ILIKE '%' || p_search || '%')
            AND (p_country IS NULL OR v.country = p_country)
            AND (p_state IS NULL OR v.state = p_state)
            AND (p_district IS NULL OR v.district = p_district)
            AND (p_friends_only = false OR EXISTS (SELECT 1 FROM public.community_follows cf WHERE cf.follower_id = auth.uid() AND cf.following_id = v.id))
    ),
    counted_players AS (
        SELECT COUNT(*) as exact_count FROM filtered_players
    )
    SELECT 
        f.id, f.username, f.full_name, f.avatar_url, f.title, f.country, f.state, f.district,
        f.created_at, f.is_online, f.last_seen, f.premium_active, f.premium_expires_at,
        f.community_score, f.rapid_rating, f.blitz_rating, f.bullet_rating, f.classical_rating,
        f.overall_rating, f.wins, f.losses, f.draws, f.total_matches, f.win_rate,
        f.iq_level, f.xp, f.level, f.achievements_count,
        f.puzzle_rating, f.puzzle_solved, f.win_streak, f.followers, f.following,
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
        CASE WHEN p_sort_col = 'active_desc' THEN f.last_seen END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'puzzle_desc' THEN f.puzzle_rating END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'streak_desc' THEN f.win_streak END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'score_desc' THEN f.community_score END DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;



-- 1. Ensure puzzle tables exist first so the leaderboard view can reference them
CREATE TABLE IF NOT EXISTS public.puzzles (
  id         TEXT PRIMARY KEY,
  fen        TEXT NOT NULL,
  moves      TEXT NOT NULL,
  rating     INT NOT NULL DEFAULT 1500,
  themes     TEXT[] NOT NULL DEFAULT '{}',
  popularity INT NOT NULL DEFAULT 0,
  theme      TEXT NOT NULL DEFAULT 'Tactics',
  goal       TEXT NOT NULL DEFAULT 'Best move',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_puzzle_stats (
  user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_today       INT NOT NULL DEFAULT 0,
  daily_reset_time      TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_unlock_time      TIMESTAMPTZ,
  current_streak        INT NOT NULL DEFAULT 0,
  longest_streak        INT NOT NULL DEFAULT 0,
  total_solved          INT NOT NULL DEFAULT 0,
  total_failed          INT NOT NULL DEFAULT 0,
  total_attempts        INT NOT NULL DEFAULT 0,
  total_puzzle_rating   INT NOT NULL DEFAULT 0,
  xp                    INT NOT NULL DEFAULT 0,
  coins_earned          INT NOT NULL DEFAULT 0,
  last_played_puzzle    TEXT REFERENCES public.puzzles(id) ON DELETE SET NULL,
  last_active           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  puzzle_rating         INT NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS public.user_puzzle_progress (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_id             TEXT NOT NULL REFERENCES public.puzzles(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'NOT_STARTED',
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  solved_at             TIMESTAMPTZ,
  attempts              INT NOT NULL DEFAULT 0,
  time_spent_ms         INT NOT NULL DEFAULT 0,
  hint_used             BOOLEAN NOT NULL DEFAULT false,
  wrong_moves_count     INT NOT NULL DEFAULT 0,
  correct_move          TEXT,
  completion_percentage INT NOT NULL DEFAULT 0,
  last_viewed_time      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_move_played      TEXT,
  rating_earned         INT NOT NULL DEFAULT 0,
  xp_earned             INT NOT NULL DEFAULT 0,
  board_fen             TEXT,
  step_index            INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, puzzle_id)
);

-- 2. Drop the old view
DROP VIEW IF EXISTS public.leaderboard_view CASCADE;

-- 3. Create the new dynamic view
CREATE OR REPLACE VIEW public.leaderboard_view AS
WITH user_ratings AS (
  SELECT 
    r.user_id,
    MAX(CASE WHEN r.time_class = 'rapid' THEN r.rating END) as rapid_rating,
    MAX(CASE WHEN r.time_class = 'blitz' THEN r.rating END) as blitz_rating,
    MAX(CASE WHEN r.time_class = 'bullet' THEN r.rating END) as bullet_rating,
    MAX(CASE WHEN r.time_class = 'classical' THEN r.rating END) as classical_rating,
    SUM(r.wins) as wins,
    SUM(r.losses) as losses,
    SUM(r.draws) as draws
  FROM public.ratings r
  GROUP BY r.user_id
),
overall_ratings AS (
  SELECT 
    user_id,
    rapid_rating,
    blitz_rating,
    bullet_rating,
    classical_rating,
    ROUND((
      COALESCE(rapid_rating, 1000) * 0.4 +
      COALESCE(blitz_rating, 1000) * 0.3 +
      COALESCE(bullet_rating, 1000) * 0.2 +
      COALESCE(classical_rating, 1000) * 0.1
    ))::integer as overall_rating,
    wins,
    losses,
    draws
  FROM user_ratings
)
SELECT 
  p.id,
  p.username,
  p.full_name,
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
  COALESCE(p.community_score, 0) as community_score,
  COALESCE(r.rapid_rating, 1000) as rapid_rating,
  COALESCE(r.blitz_rating, 1000) as blitz_rating,
  COALESCE(r.bullet_rating, 1000) as bullet_rating,
  COALESCE(r.classical_rating, 1000) as classical_rating,
  COALESCE(r.overall_rating, 1000) as overall_rating,
  COALESCE(r.wins, 0) as wins,
  COALESCE(r.losses, 0) as losses,
  COALESCE(r.draws, 0) as draws,
  (COALESCE(r.wins, 0) + COALESCE(r.losses, 0) + COALESCE(r.draws, 0)) as total_matches,
  CASE 
    WHEN (COALESCE(r.wins, 0) + COALESCE(r.losses, 0) + COALESCE(r.draws, 0)) > 0 
    THEN (COALESCE(r.wins, 0)::numeric / (COALESCE(r.wins, 0) + COALESCE(r.losses, 0) + COALESCE(r.draws, 0))::numeric) * 100 
    ELSE 0 
  END as win_rate,
  COALESCE(p.iq_rating, 100) as iq_level,
  (COALESCE(p.iq_rating, 100) * 10 + COALESCE(p.community_score, 0) * 5 + COALESCE(r.wins, 0) * 15)::integer as xp,
  (FLOOR(SQRT(COALESCE(p.iq_rating, 100) * 10 + COALESCE(p.community_score, 0) * 5 + COALESCE(r.wins, 0) * 15) / 10) + 1)::integer as level,
  COALESCE((SELECT COUNT(*) FROM public.community_achievements ca WHERE ca.user_id = p.id), 0)::integer as achievements_count,
  COALESCE(pz.puzzle_rating, 100) as puzzle_rating,
  COALESCE(pz.total_solved, 0) as puzzle_solved,
  COALESCE(pz.current_streak, 0) as win_streak,
  COALESCE((SELECT COUNT(*) FROM public.community_follows WHERE following_id = p.id), 0) as followers,
  COALESCE((SELECT COUNT(*) FROM public.community_follows WHERE follower_id = p.id), 0) as following
FROM public.profiles p
LEFT JOIN overall_ratings r ON p.id = r.user_id
LEFT JOIN public.user_puzzle_stats pz ON p.id = pz.user_id;

-- 4. Create the new dynamic RPC
CREATE OR REPLACE FUNCTION public.get_dynamic_leaderboard(
    p_search text DEFAULT '',
    p_country text DEFAULT NULL,
    p_state text DEFAULT NULL,
    p_district text DEFAULT NULL,
    p_sort_col text DEFAULT 'iq_desc',
    p_timeframe text DEFAULT 'all_time',
    p_friends_only boolean DEFAULT false,
    p_limit integer DEFAULT 25,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid, username text, full_name text, avatar_url text, title text,
    country text, state text, district text, created_at timestamp with time zone,
    is_online boolean, last_seen timestamp with time zone, premium_active boolean,
    premium_expires_at timestamp with time zone, community_score integer,
    rapid_rating integer, blitz_rating integer, bullet_rating integer,
    classical_rating integer, overall_rating integer, wins integer, losses integer,
    draws integer, total_matches integer, win_rate numeric, iq_level integer,
    xp integer, level integer, achievements_count integer, puzzle_rating integer,
    puzzle_solved integer, win_streak integer, followers integer, following integer, total_count bigint
) AS $body$
DECLARE
  v_cutoff TIMESTAMPTZ;
BEGIN
    IF p_timeframe = 'today' THEN v_cutoff := date_trunc('day', now());
    ELSIF p_timeframe = 'week' THEN v_cutoff := date_trunc('week', now());
    ELSIF p_timeframe = 'month' THEN v_cutoff := date_trunc('month', now());
    ELSE v_cutoff := '1970-01-01'::timestamptz;
    END IF;

    RETURN QUERY
    WITH dynamic_stats AS (
        SELECT 
            u.id as user_id,
            SUM(CASE WHEN g.winner_id = u.id THEN 1 ELSE 0 END)::integer as dyn_wins,
            SUM(CASE WHEN g.result = 'draw' OR g.result = 'stalemate' THEN 1 ELSE 0 END)::integer as dyn_draws,
            SUM(CASE WHEN g.winner_id IS NOT NULL AND g.winner_id != u.id THEN 1 ELSE 0 END)::integer as dyn_losses
        FROM public.profiles u
        LEFT JOIN public.games g ON (g.white_id = u.id OR g.black_id = u.id) AND g.created_at >= v_cutoff
        WHERE p_timeframe != 'all_time'
        GROUP BY u.id
    ),
    filtered_players AS (
        SELECT 
            v.id, v.username, v.full_name, v.avatar_url, v.title, v.country, v.state, v.district, 
            v.created_at, v.is_online, v.last_seen, v.premium_active, v.premium_expires_at, 
            v.community_score, v.rapid_rating, v.blitz_rating, v.bullet_rating, v.classical_rating, 
            v.overall_rating, 
            CASE WHEN p_timeframe = 'all_time' THEN v.wins ELSE COALESCE(d.dyn_wins, 0) END as wins,
            CASE WHEN p_timeframe = 'all_time' THEN v.losses ELSE COALESCE(d.dyn_losses, 0) END as losses,
            CASE WHEN p_timeframe = 'all_time' THEN v.draws ELSE COALESCE(d.dyn_draws, 0) END as draws,
            CASE WHEN p_timeframe = 'all_time' THEN v.total_matches ELSE (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0)) END as total_matches,
            CASE 
              WHEN p_timeframe = 'all_time' THEN v.win_rate 
              ELSE 
                CASE WHEN (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0)) > 0 
                THEN (COALESCE(d.dyn_wins, 0)::numeric / (COALESCE(d.dyn_wins, 0) + COALESCE(d.dyn_losses, 0) + COALESCE(d.dyn_draws, 0))::numeric) * 100 
                ELSE 0 END 
            END as win_rate,
            v.iq_level, v.xp, v.level, v.achievements_count, 
            v.puzzle_rating, v.puzzle_solved, v.win_streak, v.followers, v.following
        FROM public.leaderboard_view v
        LEFT JOIN dynamic_stats d ON v.id = d.user_id
        WHERE 
            (p_search = '' OR v.username ILIKE '%' || p_search || '%' OR v.full_name ILIKE '%' || p_search || '%')
            AND (p_country IS NULL OR v.country = p_country)
            AND (p_state IS NULL OR v.state = p_state)
            AND (p_district IS NULL OR v.district = p_district)
            AND (p_friends_only = false OR EXISTS (SELECT 1 FROM public.community_follows cf WHERE cf.follower_id = auth.uid() AND cf.following_id = v.id))
    ),
    counted_players AS (
        SELECT COUNT(*) as exact_count FROM filtered_players
    )
    SELECT 
        fp.*,
        (SELECT exact_count FROM counted_players LIMIT 1) as total_count
    FROM filtered_players fp
    ORDER BY 
        CASE WHEN p_sort_col = 'iq_desc' THEN fp.iq_level END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'iq_asc' THEN fp.iq_level END ASC NULLS LAST,
        CASE WHEN p_sort_col = 'rating_desc' THEN fp.overall_rating END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'newest' THEN fp.created_at END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'oldest' THEN fp.created_at END ASC NULLS LAST,
        CASE WHEN p_sort_col = 'wins_desc' THEN fp.wins END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'matches_desc' THEN fp.total_matches END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'winrate_desc' THEN fp.win_rate END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'puzzle_desc' THEN fp.puzzle_rating END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'streak_desc' THEN fp.win_streak END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'score_desc' THEN fp.community_score END DESC NULLS LAST,
        CASE WHEN p_sort_col = 'active_desc' THEN fp.last_seen END DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_dynamic_leaderboard(text, text, text, text, text, text, boolean, integer, integer) TO authenticated, anon;




-- Section 25: CLAN SYSTEM

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clan_privacy') THEN
    CREATE TYPE public.clan_privacy AS ENUM ('public', 'private', 'invite_only');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clan_role') THEN
    CREATE TYPE public.clan_role AS ENUM ('leader', 'co_leader', 'member');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clan_request_status') THEN
    CREATE TYPE public.clan_request_status AS ENUM ('pending', 'accepted', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clan_war_status') THEN
    CREATE TYPE public.clan_war_status AS ENUM ('pending', 'accepted', 'active', 'finished');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.clans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  tag             TEXT UNIQUE NOT NULL,
  description     TEXT DEFAULT '',
  country         TEXT DEFAULT 'International',
  language        TEXT DEFAULT 'English',
  logo_url        TEXT,
  banner_url      TEXT,
  privacy         public.clan_privacy NOT NULL DEFAULT 'public',
  max_members     INT NOT NULL DEFAULT 20 CHECK (max_members <= 20),
  clan_rating     INT NOT NULL DEFAULT 1200,
  clan_score      INT NOT NULL DEFAULT 0,
  war_wins        INT NOT NULL DEFAULT 0,
  war_losses      INT NOT NULL DEFAULT 0,
  war_draws       INT NOT NULL DEFAULT 0,
  total_wars      INT NOT NULL DEFAULT 0,
  clan_level      INT NOT NULL DEFAULT 1,
  clan_xp         INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clan_members (
  id        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  clan_id   UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role      public.clan_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (clan_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.clan_join_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id    UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     public.clan_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(clan_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.clan_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id    UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     public.clan_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(clan_id, invitee_id)
);

CREATE TABLE IF NOT EXISTS public.clan_chat (
  clan_id    UUID PRIMARY KEY REFERENCES public.clans(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clan_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id      UUID NOT NULL REFERENCES public.clan_chat(clan_id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL DEFAULT 'text',
  content      TEXT NOT NULL,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clan_wars (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_clan_id UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  defender_clan_id   UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  status             public.clan_war_status NOT NULL DEFAULT 'pending',
  starts_at          TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ,
  winner_clan_id     UUID REFERENCES public.clans(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (challenger_clan_id != defender_clan_id)
);

CREATE TABLE IF NOT EXISTS public.clan_war_lineups (
  war_id       UUID NOT NULL REFERENCES public.clan_wars(id) ON DELETE CASCADE,
  clan_id      UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_number INT NOT NULL CHECK (board_number >= 1 AND board_number <= 16),
  PRIMARY KEY (war_id, clan_id, user_id),
  UNIQUE (war_id, clan_id, board_number)
);

CREATE TABLE IF NOT EXISTS public.clan_matches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id         UUID NOT NULL REFERENCES public.clan_wars(id) ON DELETE CASCADE,
  white_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  black_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  winner_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  moves_count    INT NOT NULL DEFAULT 0,
  pgn            TEXT,
  duration       INT NOT NULL DEFAULT 0,
  points_awarded INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clan_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id    UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TABLE IF EXISTS public.clan_activity CASCADE;
CREATE TABLE IF NOT EXISTS public.clan_activity (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id    UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type       TEXT NOT NULL CHECK (type IN (
    'created','joined','left','kicked','promoted','demoted','edited',
    'transferred','request_approved','request_rejected',
    'war_declared','war_started','war_declined','war_finished'
  )),
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    DROP VIEW IF EXISTS public.clan_leaderboard CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    DROP MATERIALIZED VIEW IF EXISTS public.clan_leaderboard CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE VIEW public.clan_leaderboard AS
SELECT 
  id, slug, name, tag, logo_url, country, clan_rating, clan_score, war_wins, total_wars,
  (SELECT COUNT(*) FROM public.clan_members WHERE clan_id = public.clans.id) as member_count
FROM public.clans
ORDER BY clan_score DESC, war_wins DESC, clan_rating DESC;

-- RLS & Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

ALTER TABLE public.clans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_wars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_war_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clans viewable by everyone" ON public.clans;
CREATE POLICY "Clans viewable by everyone" ON public.clans FOR SELECT USING (true);

DROP POLICY IF EXISTS "Clan members viewable by everyone" ON public.clan_members;
CREATE POLICY "Clan members viewable by everyone" ON public.clan_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "Wars viewable by everyone" ON public.clan_wars;
CREATE POLICY "Wars viewable by everyone" ON public.clan_wars FOR SELECT USING (true);

DROP POLICY IF EXISTS "Lineups viewable by everyone" ON public.clan_war_lineups;
CREATE POLICY "Lineups viewable by everyone" ON public.clan_war_lineups FOR SELECT USING (true);

DROP POLICY IF EXISTS "Matches viewable by everyone" ON public.clan_matches;
CREATE POLICY "Matches viewable by everyone" ON public.clan_matches FOR SELECT USING (true);

-- Users can read their own join requests
DROP POLICY IF EXISTS "View own join requests" ON public.clan_join_requests;
CREATE POLICY "View own join requests" ON public.clan_join_requests FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = public.clan_join_requests.clan_id AND user_id = auth.uid() AND role IN ('leader', 'co_leader')));

-- Users can read their own invites
DROP POLICY IF EXISTS "View own invites" ON public.clan_invites;
CREATE POLICY "View own invites" ON public.clan_invites FOR SELECT USING (auth.uid() = invitee_id OR auth.uid() = inviter_id);

-- Only clan members can view/insert clan messages
DROP POLICY IF EXISTS "Clan members can chat" ON public.clan_messages;
CREATE POLICY "Clan members can chat" ON public.clan_messages FOR SELECT USING (EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = public.clan_messages.clan_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Clan members can send messages" ON public.clan_messages;
CREATE POLICY "Clan members can send messages" ON public.clan_messages FOR INSERT WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = public.clan_messages.clan_id AND user_id = auth.uid()));

-- Enable Realtime
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['clans', 'clan_members', 'clan_messages', 'clan_wars', 'clan_join_requests'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;



-- CLAN RPC FUNCTIONS

DROP FUNCTION IF EXISTS public.clan_create(TEXT, TEXT, TEXT, TEXT, TEXT, public.clan_privacy, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.clan_create(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.clan_create(
  p_name TEXT,
  p_tag TEXT,
  p_description TEXT,
  p_country TEXT,
  p_language TEXT,
  p_privacy TEXT,
  p_logo_url TEXT,
  p_banner_url TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clan_id UUID;
  v_user_id UUID := auth.uid();
  v_existing_clan UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  -- Check if user is already in a clan
  SELECT clan_id INTO v_existing_clan FROM public.clan_members WHERE user_id = v_user_id;
  IF v_existing_clan IS NOT NULL THEN RAISE EXCEPTION 'User is already in a clan'; END IF;
  
  -- Insert clan
  INSERT INTO public.clans (slug, name, tag, description, country, language, privacy, logo_url, banner_url)
  VALUES (
    LOWER(REGEXP_REPLACE(p_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || extract(epoch from now())::int,
    p_name, UPPER(p_tag), p_description, COALESCE(p_country, 'International'), COALESCE(p_language, 'English'), 
    p_privacy::public.clan_privacy, p_logo_url, p_banner_url
  ) RETURNING id INTO v_clan_id;
  
  -- Add creator as leader
  INSERT INTO public.clan_members (clan_id, user_id, role)
  VALUES (v_clan_id, v_user_id, 'leader');
  
  -- Create clan chat
  INSERT INTO public.clan_chat (clan_id) VALUES (v_clan_id);
  
  RETURN v_clan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clan_create(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_request_join(UUID);
CREATE OR REPLACE FUNCTION public.clan_request_join(p_clan_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_privacy public.clan_privacy;
  v_existing_clan UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  SELECT clan_id INTO v_existing_clan FROM public.clan_members WHERE user_id = v_user_id;
  IF v_existing_clan IS NOT NULL THEN RAISE EXCEPTION 'User is already in a clan'; END IF;
  
  SELECT privacy INTO v_privacy FROM public.clans WHERE id = p_clan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clan not found'; END IF;
  
  IF v_privacy = 'invite_only' THEN
    RAISE EXCEPTION 'Clan is invite only';
  END IF;
  
  IF v_privacy = 'public' THEN
    -- Join immediately
    INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (p_clan_id, v_user_id, 'member');
    RETURN 'joined';
  ELSE
    -- Private, create request
    INSERT INTO public.clan_join_requests (clan_id, user_id, status) VALUES (p_clan_id, v_user_id, 'pending')
    ON CONFLICT (clan_id, user_id) DO UPDATE SET status = 'pending';
    RETURN 'requested';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_request_join(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clan_approve_join(p_request_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req public.clan_join_requests;
  v_is_admin BOOLEAN;
  v_count INT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  SELECT * INTO v_req FROM public.clan_join_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or not pending'; END IF;
  
  SELECT EXISTS(SELECT 1 FROM public.clan_members WHERE clan_id = v_req.clan_id AND user_id = v_user_id AND role IN ('leader', 'co_leader')) INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Not authorized'; END IF;
  
  SELECT COUNT(*) INTO v_count FROM public.clan_members WHERE clan_id = v_req.clan_id;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Clan is full';
  END IF;
  
  UPDATE public.clan_join_requests SET status = 'accepted' WHERE id = p_request_id;
  
  INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (v_req.clan_id, v_req.user_id, 'member')
  ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_approve_join(UUID) TO authenticated;

-- (More RPCs like clan_declare_war, clan_calculate_war_results can be added, but this covers the core requirement for phase 1)

-- CLAN MEMBER MANAGEMENT RPC FUNCTIONS

CREATE OR REPLACE FUNCTION public.clan_promote_member(p_clan_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_leader BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  SELECT EXISTS(SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_caller_id AND role = 'leader') INTO v_is_leader;
  IF NOT v_is_leader THEN RAISE EXCEPTION 'Only the leader can promote members'; END IF;
  
  UPDATE public.clan_members SET role = 'co_leader' WHERE clan_id = p_clan_id AND user_id = p_user_id AND role = 'member';
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found or is already a co-leader'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_promote_member(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clan_demote_member(p_clan_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_leader BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  SELECT EXISTS(SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_caller_id AND role = 'leader') INTO v_is_leader;
  IF NOT v_is_leader THEN RAISE EXCEPTION 'Only the leader can demote members'; END IF;
  
  UPDATE public.clan_members SET role = 'member' WHERE clan_id = p_clan_id AND user_id = p_user_id AND role = 'co_leader';
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found or is already a member'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_demote_member(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clan_kick_member(p_clan_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role public.clan_role;
  v_target_role public.clan_role;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  SELECT role INTO v_caller_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role = 'member' THEN RAISE EXCEPTION 'Not authorized to kick'; END IF;
  
  SELECT role INTO v_target_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = p_user_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'User not in clan'; END IF;
  
  IF v_target_role = 'leader' THEN RAISE EXCEPTION 'Cannot kick the leader'; END IF;
  IF v_target_role = 'co_leader' AND v_caller_role != 'leader' THEN RAISE EXCEPTION 'Only the leader can kick a co-leader'; END IF;
  
  DELETE FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = p_user_id;
  
  -- Update member count cache in leaderboard view isn't direct, but the trigger will handle stats if configured.
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_kick_member(UUID, UUID) TO authenticated;
-- PUZZLE LIBRARY EXPANSION

DROP TABLE IF EXISTS public.puzzle_progress CASCADE;
DROP TABLE IF EXISTS public.user_puzzle_progress CASCADE;
DROP TABLE IF EXISTS public.user_puzzle_stats CASCADE;
DROP TABLE IF EXISTS public.puzzles CASCADE;

CREATE TABLE IF NOT EXISTS public.puzzles (
    id TEXT PRIMARY KEY,
    fen TEXT NOT NULL,
    moves TEXT[] NOT NULL,
    rating INTEGER DEFAULT 1200,
    themes TEXT[] DEFAULT '{}',
    goal TEXT DEFAULT 'Find the best move',
    popularity INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Metadata columns the admin puzzle-management UI depends on (theme, category, ...
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'Tactics';
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Tactics';
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'Intermediate';
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS explanation TEXT NOT NULL DEFAULT '';
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS alternative_lines JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS hints JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON public.puzzles(rating);
CREATE INDEX IF NOT EXISTS idx_puzzles_goal ON public.puzzles(goal);
CREATE INDEX IF NOT EXISTS idx_puzzles_category ON public.puzzles(category);
CREATE INDEX IF NOT EXISTS idx_puzzles_enabled ON public.puzzles(enabled);
CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzles_slug ON public.puzzles(slug) WHERE slug IS NOT NULL;

-- DROP TABLE ..
ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.puzzles TO anon, authenticated;
GRANT ALL ON public.puzzles TO service_role;
DROP POLICY IF EXISTS "Puzzles public read" ON public.puzzles;
CREATE POLICY "Puzzles public read" ON public.puzzles FOR SELECT USING (enabled = true);

CREATE TABLE IF NOT EXISTS public.user_puzzle_stats (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    completed_today INTEGER DEFAULT 0,
    daily_reset_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) + interval '1 day',
    next_unlock_time TIMESTAMP WITH TIME ZONE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    total_solved INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_attempts INTEGER DEFAULT 0,
    total_puzzle_rating INTEGER DEFAULT 1200,
    xp INTEGER DEFAULT 0,
    coins_earned INTEGER DEFAULT 0,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Restored after the CASCADE above wiped RLS/grants
ALTER TABLE public.user_puzzle_stats ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.user_puzzle_stats TO authenticated;
GRANT ALL ON public.user_puzzle_stats TO service_role;
DROP POLICY IF EXISTS "Puzzle stats public read" ON public.user_puzzle_stats;
CREATE POLICY "Puzzle stats public read" ON public.user_puzzle_stats FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.puzzle_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    puzzle_id TEXT NOT NULL REFERENCES public.puzzles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'SOLVED', 'FAILED', 'SKIPPED')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    solved_at TIMESTAMP WITH TIME ZONE,
    attempts INTEGER DEFAULT 0,
    time_spent_ms INTEGER DEFAULT 0,
    hint_used BOOLEAN DEFAULT FALSE,
    wrong_moves_count INTEGER DEFAULT 0,
    board_fen TEXT,
    step_index INTEGER DEFAULT 0,
    last_move_played TEXT,
    last_viewed_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, puzzle_id)
);

-- Restored after the CASCADE above wiped RLS/grants
ALTER TABLE public.puzzle_progress ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.puzzle_progress TO authenticated;
GRANT ALL ON public.puzzle_progress TO service_role;
DROP POLICY IF EXISTS "Users can view own puzzle progress" ON public.puzzle_progress;
CREATE POLICY "Users can view own puzzle progress" ON public.puzzle_progress FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_daily_puzzle()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_stats public.user_puzzle_stats;
    v_puzzle public.puzzles;
    v_progress public.puzzle_progress;
    v_locked BOOLEAN := FALSE;
    v_remaining INT := 3;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Upsert stats
    INSERT INTO public.user_puzzle_stats (user_id, daily_reset_time)
    VALUES (v_user_id, timezone('utc'::text, now()) + interval '1 day')
    ON CONFLICT (user_id) DO UPDATE SET last_active = timezone('utc'::text, now())
    RETURNING * INTO v_stats;

    -- Check if reset time has passed
    IF timezone('utc'::text, now()) >= v_stats.daily_reset_time THEN
        -- Expire any uncompleted puzzle progress from previous day so it doesn't loop
        UPDATE public.puzzle_progress
        SET status = 'SKIPPED'
        WHERE user_id = v_user_id AND status IN ('NOT_STARTED', 'IN_PROGRESS');

        UPDATE public.user_puzzle_stats 
        SET completed_today = 0, 
            daily_reset_time = timezone('utc'::text, now()) + interval '1 day'
        WHERE user_id = v_user_id
        RETURNING * INTO v_stats;
    END IF;

    -- Check lock
    IF v_stats.completed_today >= 3 THEN
        v_locked := TRUE;
        v_remaining := 0;
        RETURN json_build_object(
            'locked', v_locked,
            'remaining_today', v_remaining,
            'stats', row_to_json(v_stats),
            'puzzle', NULL,
            'progress', NULL
        );
    END IF;

    v_remaining := 3 - v_stats.completed_today;

    -- Find an IN_PROGRESS puzzle first
    SELECT pp.* INTO v_progress
    FROM public.puzzle_progress pp
    WHERE pp.user_id = v_user_id AND pp.status IN ('NOT_STARTED', 'IN_PROGRESS')
    ORDER BY pp.last_viewed_time DESC
    LIMIT 1;

    IF FOUND THEN
        SELECT * INTO v_puzzle FROM public.puzzles WHERE id = v_progress.puzzle_id;
    ELSE
-- Find a new puzzle based on progress (1st: Mate in 1, 2nd: Mate in 2, 3rd: Mat...
        SELECT p.* INTO v_puzzle
        FROM public.puzzles p
        LEFT JOIN public.puzzle_progress pp ON p.id = pp.puzzle_id AND pp.user_id = v_user_id
        WHERE pp.id IS NULL
          AND p.enabled = true
          AND (
            (v_stats.completed_today = 0 AND p.goal = 'Mate in 1') OR
            (v_stats.completed_today = 1 AND p.goal = 'Mate in 2') OR
            (v_stats.completed_today = 2 AND p.goal = 'Mate in 3') OR
            (v_stats.completed_today > 2)
          )
        ORDER BY random()
        LIMIT 1;

        -- Fallback 1 if the specific puzzle type runs out
        IF NOT FOUND THEN
            SELECT p.* INTO v_puzzle
            FROM public.puzzles p
            LEFT JOIN public.puzzle_progress pp ON p.id = pp.puzzle_id AND pp.user_id = v_user_id
            WHERE pp.id IS NULL AND p.enabled = true
            ORDER BY random()
            LIMIT 1;
        END IF;

        -- Fallback 2 if ALL puzzles in DB have been played (pool exhausted): cycle to least recently played
        IF NOT FOUND THEN
            SELECT p.* INTO v_puzzle
            FROM public.puzzles p
            JOIN public.puzzle_progress pp ON p.id = pp.puzzle_id AND pp.user_id = v_user_id
            WHERE p.enabled = true
            ORDER BY pp.last_viewed_time ASC, random()
            LIMIT 1;
        END IF;

        IF NOT FOUND THEN
            -- No puzzles in DB at all
            RETURN json_build_object(
                'locked', FALSE,
                'remaining_today', v_remaining,
                'stats', row_to_json(v_stats),
                'puzzle', NULL,
                'progress', NULL
            );
        END IF;

        -- Create or reset progress for the selected puzzle
        INSERT INTO public.puzzle_progress (user_id, puzzle_id, board_fen, status)
        VALUES (v_user_id, v_puzzle.id, v_puzzle.fen, 'NOT_STARTED')
        ON CONFLICT (user_id, puzzle_id) DO UPDATE SET
            status = 'NOT_STARTED',
            started_at = timezone('utc'::text, now()),
            solved_at = NULL,
            attempts = 0,
            time_spent_ms = 0,
            hint_used = FALSE,
            wrong_moves_count = 0,
            board_fen = EXCLUDED.board_fen,
            step_index = 0,
            last_move_played = NULL,
            last_viewed_time = timezone('utc'::text, now())
        RETURNING * INTO v_progress;
    END IF;

    -- Update last viewed
    UPDATE public.puzzle_progress SET last_viewed_time = timezone('utc'::text, now()) WHERE id = v_progress.id;

    RETURN json_build_object(
        'locked', v_locked,
        'remaining_today', v_remaining,
        'stats', row_to_json(v_stats),
        'puzzle', row_to_json(v_puzzle),
        'progress', row_to_json(v_progress)
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_daily_puzzle() TO authenticated;

-- DROP the old function signature first if it exists, to avoid Postgres duplicate function overloading
DROP FUNCTION IF EXISTS public.update_puzzle_progress(UUID, TEXT, INT, TEXT, INT, INT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.update_puzzle_progress(TEXT, TEXT, INTEGER, TEXT, INTEGER, INTEGER, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.update_puzzle_progress(
    p_puzzle_id TEXT,
    p_status TEXT,
    p_time_spent_ms INTEGER,
    p_board_fen TEXT,
    p_step_index INTEGER,
    p_wrong_moves INTEGER,
    p_hint_used BOOLEAN,
    p_last_move TEXT
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_progress public.puzzle_progress;
    v_stats public.user_puzzle_stats;
    v_new_status TEXT;
    v_old_status TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_progress FROM public.puzzle_progress WHERE user_id = v_user_id AND puzzle_id = p_puzzle_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Progress not found';
    END IF;

-- Capture the pre-update status: v_progress gets overwritten by the RETURNING c...
    v_old_status := v_progress.status;

    -- Don't allow changing status if already solved/skipped
    IF v_progress.status IN ('SOLVED', 'SKIPPED') THEN
        v_new_status := v_progress.status;
    ELSE
        v_new_status := p_status;
    END IF;

    UPDATE public.puzzle_progress
    SET status = v_new_status,
        time_spent_ms = p_time_spent_ms,
        board_fen = p_board_fen,
        step_index = p_step_index,
        wrong_moves_count = p_wrong_moves,
        hint_used = p_hint_used,
        last_move_played = p_last_move,
        last_viewed_time = timezone('utc'::text, now()),
        solved_at = CASE WHEN v_new_status = 'SOLVED' AND v_old_status != 'SOLVED' THEN timezone('utc'::text, now()) ELSE solved_at END
    WHERE id = v_progress.id
    RETURNING * INTO v_progress;

    -- Update stats if newly solved
    SELECT * INTO v_stats FROM public.user_puzzle_stats WHERE user_id = v_user_id;

    IF v_new_status IN ('SOLVED', 'FAILED', 'SKIPPED') AND v_old_status NOT IN ('SOLVED', 'FAILED', 'SKIPPED') THEN
        UPDATE public.user_puzzle_stats
        SET completed_today = completed_today + 1,
            total_solved = total_solved + CASE WHEN v_new_status = 'SOLVED' THEN 1 ELSE 0 END,
            total_failed = total_failed + CASE WHEN v_new_status != 'SOLVED' THEN 1 ELSE 0 END,
            current_streak = CASE WHEN v_new_status = 'SOLVED' THEN current_streak + 1 ELSE 0 END,
            longest_streak = GREATEST(longest_streak, CASE WHEN v_new_status = 'SOLVED' THEN current_streak + 1 ELSE 0 END),
            xp = xp + CASE WHEN v_new_status = 'SOLVED' THEN 10 ELSE 0 END
        WHERE user_id = v_user_id
        RETURNING * INTO v_stats;
    END IF;

    RETURN json_build_object(
        'progress', row_to_json(v_progress),
        'stats', row_to_json(v_stats)
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_puzzle_progress(TEXT, TEXT, INTEGER, TEXT, INTEGER, INTEGER, BOOLEAN, TEXT) TO authenticated;

-- Seed some test puzzles with the correct goal types for the daily structure
INSERT INTO public.puzzles (id, fen, moves, rating, themes, goal) VALUES
('puzzle_001', '4k3/R7/8/8/8/8/8/4K2R w - - 0 1', ARRAY['h1h8'], 1100, ARRAY['mateIn1'], 'Mate in 1'),
('puzzle_002', '3r2k1/5ppp/8/8/8/8/4Q3/4R1K1 w - - 0 1', ARRAY['e2e8', 'd8e8', 'e1e8'], 1200, ARRAY['mateIn2'], 'Mate in 2'),
('puzzle_003', '5rk1/p4ppp/8/3N3Q/8/3R4/8/3K4 w - - 0 1', ARRAY['d5e7', 'g8h8', 'h5h7', 'h8h7', 'd3h3'], 1300, ARRAY['mateIn3'], 'Mate in 3'),
('puzzle_004', '4r1k1/1p3ppp/p7/3p4/8/2P1b1P1/PP2RP1P/R5K1 w - - 0 23', ARRAY['a1e1', 'e3f2', 'g1f2'], 1600, ARRAY['pin', 'endgame'], 'Find the best move')
ON CONFLICT (id) DO UPDATE SET fen = EXCLUDED.fen, moves = EXCLUDED.moves, goal = EXCLUDED.goal, themes = EXCLUDED.themes;

-- Section 26: CLAN SYSTEM — REWRITE FIXES
-- Corrects bugs found in the original Section 25 (clan_leaderboard was a stale ...

-- Live member counts: a materialized view does not reflect joins/leaves until m...
DO $$
BEGIN
    DROP VIEW IF EXISTS public.clan_leaderboard CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    DROP MATERIALIZED VIEW IF EXISTS public.clan_leaderboard CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE VIEW public.clan_leaderboard AS
SELECT
  c.id, c.slug, c.name, c.tag, c.description, c.logo_url, c.country, c.language,
  c.privacy, c.clan_rating, c.clan_score, c.war_wins, c.war_losses, c.war_draws,
  c.total_wars, c.created_at,
  (SELECT COUNT(*) FROM public.clan_members cm WHERE cm.clan_id = c.id) AS member_count
FROM public.clans c
ORDER BY c.clan_score DESC, c.war_wins DESC, c.clan_rating DESC;

GRANT SELECT ON public.clan_leaderboard TO authenticated, anon;

-- Rename clan_messages.chat_id -> clan_id to match every client query and remov...
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clan_messages' AND column_name = 'chat_id'
  ) THEN
    ALTER TABLE public.clan_messages RENAME COLUMN chat_id TO clan_id;
  END IF;
END $$;

DROP POLICY IF EXISTS "Clan members can chat" ON public.clan_messages;
CREATE POLICY "Clan members can chat" ON public.clan_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = public.clan_messages.clan_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Clan members can send messages" ON public.clan_messages;
CREATE POLICY "Clan members can send messages" ON public.clan_messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = public.clan_messages.clan_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Clan members/mods can delete messages" ON public.clan_messages;
CREATE POLICY "Clan members/mods can delete messages" ON public.clan_messages FOR DELETE USING (
  auth.uid() = sender_id OR EXISTS (
    SELECT 1 FROM public.clan_members WHERE clan_id = public.clan_messages.clan_id AND user_id = auth.uid() AND role IN ('leader', 'co_leader')
  )
);

-- Clan Wars had SELECT-only RLS, so declaring/accepting a war always failed.
DROP POLICY IF EXISTS "Clan officers can declare war" ON public.clan_wars;
CREATE POLICY "Clan officers can declare war" ON public.clan_wars FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = challenger_clan_id AND user_id = auth.uid() AND role IN ('leader', 'co_leader'))
);

DROP POLICY IF EXISTS "Clan officers can update war status" ON public.clan_wars;
CREATE POLICY "Clan officers can update war status" ON public.clan_wars FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE user_id = auth.uid() AND role IN ('leader', 'co_leader')
      AND clan_id IN (challenger_clan_id, defender_clan_id)
  )
);

-- Clan awards, referenced by the clan detail page ("Show Awards").
CREATE TABLE IF NOT EXISTS public.clan_awards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id     UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon        TEXT DEFAULT 'trophy',
  awarded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clan_awards_clan_id ON public.clan_awards(clan_id);

ALTER TABLE public.clan_awards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clan awards viewable by everyone" ON public.clan_awards;
CREATE POLICY "Clan awards viewable by everyone" ON public.clan_awards FOR SELECT USING (true);
-- clan_awards was created after this file's blanket `GRANT ..
GRANT SELECT ON public.clan_awards TO anon, authenticated;
GRANT ALL ON public.clan_awards TO service_role;

-- Search/lookups.
CREATE INDEX IF NOT EXISTS idx_clans_name_lower ON public.clans (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_clans_country ON public.clans (country);
CREATE INDEX IF NOT EXISTS idx_clan_members_clan_id ON public.clan_members (clan_id);

-- Safe leave/transfer: if the leader leaves and members remain, leadership tran...
CREATE OR REPLACE FUNCTION public.clan_leave(p_clan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role public.clan_role;
  v_member_count INT;
  v_successor UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id;
  IF v_role IS NULL THEN RAISE EXCEPTION 'You are not a member of this clan'; END IF;

  SELECT COUNT(*) INTO v_member_count FROM public.clan_members WHERE clan_id = p_clan_id;

  IF v_role = 'leader' AND v_member_count > 1 THEN
    SELECT user_id INTO v_successor FROM public.clan_members
      WHERE clan_id = p_clan_id AND user_id != v_user_id
      ORDER BY (role = 'co_leader') DESC, joined_at ASC
      LIMIT 1;
    UPDATE public.clan_members SET role = 'leader' WHERE clan_id = p_clan_id AND user_id = v_successor;
  END IF;

  DELETE FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id;

  IF v_member_count <= 1 THEN
    DELETE FROM public.clans WHERE id = p_clan_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_leave(UUID) TO authenticated;

-- Section 27: CLAN SYSTEM V2 — EDIT & LEADERSHIP RPCs

-- Leader edits clan details. NULL params keep the current value.
CREATE OR REPLACE FUNCTION public.clan_update_details(
  p_clan_id UUID,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL,
  p_privacy TEXT DEFAULT NULL,
  p_logo_url TEXT DEFAULT NULL,
  p_banner_url TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role public.clan_role;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id;
  IF v_role IS NULL OR v_role NOT IN ('leader', 'co_leader') THEN
    RAISE EXCEPTION 'Only the leader or a co-leader can edit clan details';
  END IF;

  IF p_name IS NOT NULL AND (LENGTH(p_name) < 3 OR LENGTH(p_name) > 32) THEN
    RAISE EXCEPTION 'Clan name must be between 3 and 32 characters';
  END IF;

  UPDATE public.clans SET
    name        = COALESCE(NULLIF(p_name, ''), name),
    description = COALESCE(p_description, description),
    country     = COALESCE(NULLIF(p_country, ''), country),
    language    = COALESCE(NULLIF(p_language, ''), language),
    privacy     = COALESCE(NULLIF(p_privacy, '')::public.clan_privacy, privacy),
    logo_url    = COALESCE(NULLIF(p_logo_url, ''), logo_url),
    banner_url  = COALESCE(NULLIF(p_banner_url, ''), banner_url)
  WHERE id = p_clan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_update_details(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Leader hands the crown to another member atomically.
CREATE OR REPLACE FUNCTION public.clan_transfer_leadership(p_clan_id UUID, p_new_leader_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role public.clan_role;
  v_target_role public.clan_role;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_user_id = p_new_leader_id THEN RAISE EXCEPTION 'You are already the leader'; END IF;

  SELECT role INTO v_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id;
  IF v_role IS DISTINCT FROM 'leader' THEN RAISE EXCEPTION 'Only the leader can transfer leadership'; END IF;

  SELECT role INTO v_target_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = p_new_leader_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'Target user is not in this clan'; END IF;

  UPDATE public.clan_members SET role = 'co_leader' WHERE clan_id = p_clan_id AND user_id = v_user_id;
  UPDATE public.clan_members SET role = 'leader' WHERE clan_id = p_clan_id AND user_id = p_new_leader_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_transfer_leadership(UUID, UUID) TO authenticated;

-- Leader disbands the clan entirely (cascades to members, chat, wars, awards).
CREATE OR REPLACE FUNCTION public.clan_disband(p_clan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role public.clan_role;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id;
  IF v_role IS DISTINCT FROM 'leader' THEN RAISE EXCEPTION 'Only the leader can disband the clan'; END IF;

  DELETE FROM public.clans WHERE id = p_clan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_disband(UUID) TO authenticated;







-- MIGRATION 20260713000014: ABOUT / POLICIES / FEEDBACK CMS TABLES
-- Fixes AUDIT_REPORT.md MEDIUM finding #8

-- about_articles
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

-- policies + policy_versions
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

-- feedbacks
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
-- MIGRATION 20260713000013: COMMUNITY FOLLOW / MODERATION TABLES
-- Fixes AUDIT_REPORT.md MEDIUM finding #5
-- This migration only creates tables + RLS

-- community_follows
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

-- community_bookmarks (labelled collections; distinct from community_saved_posts)
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

-- community_hidden_posts ("hide this post for me")
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

-- community_mutes (mute another user's content without blocking)
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

-- community_blocks (block another user)
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

-- community_reports (post/comment/user reports within the community feature, di...
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

-- RPC: admin_resolve_report(p_report_id, p_status) — pairs with community_repor...
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
-- MIGRATION 20260713000012: PLATFORM REPORTS (bug / fair-play / abuse)
-- Fixes AUDIT_REPORT.md MEDIUM finding #9

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

-- RPC: admin_resolve_platform_report(p_report_id, p_status)
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
-- MIGRATION 20260713000011: USER_SETTINGS TABLE
-- Fixes AUDIT_REPORT.md MEDIUM finding #6

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Board
  board_theme TEXT NOT NULL DEFAULT 'royal',
  piece_theme TEXT NOT NULL DEFAULT 'classic',
  show_coordinates BOOLEAN NOT NULL DEFAULT true,
  board_animation BOOLEAN NOT NULL DEFAULT true,
  auto_flip BOOLEAN NOT NULL DEFAULT false,
  show_legal_moves BOOLEAN NOT NULL DEFAULT true,
  show_last_move BOOLEAN NOT NULL DEFAULT true,
  show_move_arrows BOOLEAN NOT NULL DEFAULT true,
  show_move_highlights BOOLEAN NOT NULL DEFAULT true,
  show_check_highlight BOOLEAN NOT NULL DEFAULT true,
  show_threat_squares BOOLEAN NOT NULL DEFAULT false,
  show_captured_pieces BOOLEAN NOT NULL DEFAULT true,
  show_material_difference BOOLEAN NOT NULL DEFAULT true,
  piece_drag_style TEXT NOT NULL DEFAULT 'smooth',
  move_method TEXT NOT NULL DEFAULT 'both',
  board_size TEXT NOT NULL DEFAULT 'medium',
  board_zoom INT NOT NULL DEFAULT 100,
  snap_to_square BOOLEAN NOT NULL DEFAULT true,

  -- Gameplay
  confirm_move BOOLEAN NOT NULL DEFAULT false,
  confirm_resign BOOLEAN NOT NULL DEFAULT true,
  confirm_draw_offer BOOLEAN NOT NULL DEFAULT true,
  auto_queen BOOLEAN NOT NULL DEFAULT false,
  premoves BOOLEAN NOT NULL DEFAULT true,
  multiple_premoves BOOLEAN NOT NULL DEFAULT false,
  enable_takebacks BOOLEAN NOT NULL DEFAULT false,
  auto_focus_board BOOLEAN NOT NULL DEFAULT true,
  auto_reconnect BOOLEAN NOT NULL DEFAULT true,

  -- Clock
  clock_sound BOOLEAN NOT NULL DEFAULT true,
  low_time_warning BOOLEAN NOT NULL DEFAULT true,
  countdown_beep BOOLEAN NOT NULL DEFAULT true,
  clock_position TEXT NOT NULL DEFAULT 'side',
  show_tenths BOOLEAN NOT NULL DEFAULT true,
  time_pressure_effects BOOLEAN NOT NULL DEFAULT true,

  -- Sound
  sound_master BOOLEAN NOT NULL DEFAULT true,
  move_sound BOOLEAN NOT NULL DEFAULT true,
  capture_sound BOOLEAN NOT NULL DEFAULT true,
  check_sound BOOLEAN NOT NULL DEFAULT true,
  checkmate_sound BOOLEAN NOT NULL DEFAULT true,
  draw_sound BOOLEAN NOT NULL DEFAULT true,
  victory_sound BOOLEAN NOT NULL DEFAULT true,
  defeat_sound BOOLEAN NOT NULL DEFAULT true,
  notify_sound BOOLEAN NOT NULL DEFAULT true,
  sound_volume INT NOT NULL DEFAULT 70,
  move_sound_theme TEXT NOT NULL DEFAULT 'classic_wood',

  -- Analysis
  engine_depth INT NOT NULL DEFAULT 15,
  show_best_move BOOLEAN NOT NULL DEFAULT true,
  show_eval_bar BOOLEAN NOT NULL DEFAULT true,
  show_engine_lines BOOLEAN NOT NULL DEFAULT true,
  multi_pv INT NOT NULL DEFAULT 1,
  auto_analysis BOOLEAN NOT NULL DEFAULT true,
  show_opening_name BOOLEAN NOT NULL DEFAULT true,
  show_accuracy BOOLEAN NOT NULL DEFAULT true,
  show_mistakes BOOLEAN NOT NULL DEFAULT true,
  show_blunders BOOLEAN NOT NULL DEFAULT true,
  show_brilliant BOOLEAN NOT NULL DEFAULT true,

  -- Multiplayer
  allow_spectators BOOLEAN NOT NULL DEFAULT true,
  show_spectator_count BOOLEAN NOT NULL DEFAULT true,
  allow_chat BOOLEAN NOT NULL DEFAULT true,
  friend_requests BOOLEAN NOT NULL DEFAULT true,
  match_requests BOOLEAN NOT NULL DEFAULT true,
  tournament_invites BOOLEAN NOT NULL DEFAULT true,
  auto_accept_friend_challenges BOOLEAN NOT NULL DEFAULT false,
  public_profile BOOLEAN NOT NULL DEFAULT true,

  -- Notifications
  notify_match_found BOOLEAN NOT NULL DEFAULT true,
  notify_tournament_starting BOOLEAN NOT NULL DEFAULT true,
  notify_friend_online BOOLEAN NOT NULL DEFAULT true,
  notify_challenge_received BOOLEAN NOT NULL DEFAULT true,
  notify_wallet BOOLEAN NOT NULL DEFAULT true,
  notify_withdrawal BOOLEAN NOT NULL DEFAULT true,
  notify_community BOOLEAN NOT NULL DEFAULT true,
  notify_admin BOOLEAN NOT NULL DEFAULT true,

  -- Accessibility
  high_contrast BOOLEAN NOT NULL DEFAULT false,
  large_pieces BOOLEAN NOT NULL DEFAULT false,
  large_coordinates BOOLEAN NOT NULL DEFAULT false,
  keyboard_navigation BOOLEAN NOT NULL DEFAULT true,
  screen_reader BOOLEAN NOT NULL DEFAULT true,
  reduced_motion BOOLEAN NOT NULL DEFAULT false,
  color_blind_mode TEXT NOT NULL DEFAULT 'none',

  -- Performance
  fps_mode TEXT NOT NULL DEFAULT 'auto',
  graphics_mode TEXT NOT NULL DEFAULT 'balanced',
  asset_preloading BOOLEAN NOT NULL DEFAULT true,
  realtime_optimization BOOLEAN NOT NULL DEFAULT true,

  -- Mobile
  vibration_feedback BOOLEAN NOT NULL DEFAULT true,
  touch_move_confirmation BOOLEAN NOT NULL DEFAULT false,
  mobile_board_scaling INT NOT NULL DEFAULT 100,
  mobile_piece_scaling INT NOT NULL DEFAULT 100,
  mobile_gestures BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own settings" ON public.user_settings;
CREATE POLICY "Users select own settings"
  ON public.user_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own settings" ON public.user_settings;
CREATE POLICY "Users insert own settings"
  ON public.user_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own settings" ON public.user_settings;
CREATE POLICY "Users update own settings"
  ON public.user_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- MIGRATION 20260713000010: WITHDRAWAL / BANK-DETAILS FLOW
-- Fixes AUDIT_REPORT.md HIGH finding #7

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- 1. bank_details table (one row per user; matches useBankDetails.ts shape)
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

-- 2. withdrawal_requests table
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

-- 3. RPC: submit_withdrawal_request(p_amount) — escrows funds immediately
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

-- 4. RPC: cancel_withdrawal_request(p_request_id) — user-initiated, refunds
DROP FUNCTION IF EXISTS public.cancel_withdrawal_request(UUID);
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

-- 5. RPC: admin_approve_withdrawal(p_request_id) — admin marks transferred
DROP FUNCTION IF EXISTS public.admin_approve_withdrawal(uuid);
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

-- 6. RPC: admin_reject_withdrawal(p_request_id, p_reason) — refunds user
DROP FUNCTION IF EXISTS public.admin_reject_withdrawal(uuid, text);
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

-- 7. RPC: admin_get_withdrawal_requests(p_status) — joined admin view
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
-- TOURNAMENT_MATCHES
-- Backs the bracket UI in src/routes/tournament.$id.tsx, which selects id,round...

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round          INT NOT NULL,
  slot           INT NOT NULL,
  player1_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  player2_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  game_id        UUID REFERENCES public.games(id) ON DELETE SET NULL,
  winner_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'finished', 'bye')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round, slot)
);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament
  ON public.tournament_matches(tournament_id, round);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_game
  ON public.tournament_matches(game_id);

GRANT SELECT ON public.tournament_matches TO anon, authenticated;
GRANT ALL ON public.tournament_matches TO service_role;

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- Public read, consistent with tournaments/tournament_entries being open to ano...
DROP POLICY IF EXISTS "Tournament matches public read" ON public.tournament_matches;
CREATE POLICY "Tournament matches public read"
  ON public.tournament_matches FOR SELECT USING (true);

-- Writes are restricted to admins (bracket generation/progression is a server-s...
DROP POLICY IF EXISTS "Admins insert tournament matches" ON public.tournament_matches;
CREATE POLICY "Admins insert tournament matches"
  ON public.tournament_matches FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update tournament matches" ON public.tournament_matches;
CREATE POLICY "Admins update tournament matches"
  ON public.tournament_matches FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at maintenance trigger, following the same style used elsewhere in sc...
CREATE OR REPLACE FUNCTION public._tournament_matches_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_tournament_matches_touch_updated_at ON public.tournament_matches;
CREATE TRIGGER trg_tournament_matches_touch_updated_at
  BEFORE UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public._tournament_matches_touch_updated_at();

-- Realtime: the route subscribes to postgres_changes on this table (channel `to...
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournament_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_matches;
  END IF;
END $$;
-- CHAT SUBSYSTEM
-- Backs src/lib/api/chatClient.ts (Global Chat + Custom Rooms + Direct Messages...

-- ── 1. Core tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL CHECK (type IN ('global', 'room', 'dm')),
  slug         TEXT UNIQUE,
  name         TEXT,
  description  TEXT DEFAULT '',
  is_private   BOOLEAN NOT NULL DEFAULT false,
  owner_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
-- For DM channels: canonical pair (least(user), greatest(user)) so a unique ind...
  dm_user_a    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  dm_user_b    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_channels_dm_pair
  ON public.chat_channels(dm_user_a, dm_user_b) WHERE type = 'dm';
CREATE INDEX IF NOT EXISTS idx_chat_channels_type ON public.chat_channels(type);

CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
  muted_until TIMESTAMPTZ,
  is_banned   BOOLEAN NOT NULL DEFAULT false,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_channel_members_channel ON public.chat_channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_channel_members_user ON public.chat_channel_members(user_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  reply_to_id  UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_deleted   BOOLEAN NOT NULL DEFAULT false,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created
  ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned
  ON public.chat_messages(channel_id) WHERE is_pinned = true;

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message
  ON public.chat_message_reactions(message_id);

CREATE TABLE IF NOT EXISTS public.chat_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'harassment', 'fake_information', 'other')),
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);