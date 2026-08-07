
  RETURN v_result;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.admin_ranking_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ranking_analytics() TO authenticated, service_role;

-- 102.14 Backfill existing rows onto the ladder
-- One-time (idempotent) sync so pre-102 rankings show a correct rung
WITH resolved AS (
  SELECT sr.id,
         (SELECT rung_id    FROM public.sp_rung(sr.season_iq)) AS rung_id,
         (SELECT rung_index FROM public.sp_rung(sr.season_iq)) AS rung_index,
         (SELECT tier_code  FROM public.sp_rung(sr.season_iq)) AS tier_code,
         sr.season_iq
  FROM public.season_rankings sr
  WHERE sr.rung_id = 'bronze_3' AND sr.season_iq > 0
)
UPDATE public.season_rankings sr
SET rung_id         = r.rung_id,
    rung_index      = r.rung_index,
    tier            = r.tier_code,
    peak_sp         = GREATEST(sr.peak_sp, r.season_iq),
    peak_rung_index = GREATEST(sr.peak_rung_index, r.rung_index)
FROM resolved r
WHERE sr.id = r.id;

-- 102.15 Season finalization — corrections
-- Three gaps between the SECTION 77 finalization path and the v2 ladder, fixed ...
-- 1

-- Ranking now skips banned players entirely: they keep their points for the aud...
CREATE OR REPLACE FUNCTION public._season_recompute_rankings(p_season_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  WITH ranked AS (
    SELECT user_id,
           ROW_NUMBER() OVER (
             ORDER BY season_iq DESC, wins DESC, games_played ASC, user_id ASC
           ) AS rnk
    FROM public.season_rankings
    WHERE season_id = p_season_id AND banned = false
  )
  UPDATE public.season_rankings sr SET
    prev_rank  = sr.rank,
    rank       = ranked.rnk,
    updated_at = now()
  FROM ranked
  WHERE sr.season_id = p_season_id AND sr.user_id = ranked.user_id;

  -- Banned entries hold no placement.
  UPDATE public.season_rankings
  SET prev_rank = rank, rank = NULL, updated_at = now()
  WHERE season_id = p_season_id AND banned = true AND rank IS NOT NULL;
END; $fn$;
REVOKE ALL ON FUNCTION public._season_recompute_rankings(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._season_recompute_rankings(UUID) TO service_role;

-- Enriches every frozen history row at write time, whichever function performed...
CREATE OR REPLACE FUNCTION public._season_history_enrich()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rung   RECORD;
  v_bundle TEXT[];
  v_peak   INT;
BEGIN
  SELECT * INTO v_rung FROM public.sp_rung(COALESCE(NEW.season_iq, 0));

  NEW.rung_id    := v_rung.rung_id;
  NEW.rung_index := v_rung.rung_index;
  -- Store the v2 tier code ('grandmaster'), not the legacy display name.
  NEW.tier       := v_rung.tier_code;

  SELECT peak_sp INTO v_peak FROM public.season_rankings
  WHERE season_id = NEW.season_id AND user_id = NEW.user_id;
  NEW.peak_sp := GREATEST(COALESCE(v_peak, 0), COALESCE(NEW.season_iq, 0));

  v_bundle := CASE v_rung.tier_code
    WHEN 'bronze'      THEN ARRAY['badge_bronze']
    WHEN 'silver'      THEN ARRAY['badge_silver','coins']
    WHEN 'gold'        THEN ARRAY['coins','avatar_premium']
    WHEN 'platinum'    THEN ARRAY['coins','frame_platinum','title_platinum']
    WHEN 'diamond'     THEN ARRAY['badge_animated_diamond']
    WHEN 'master'      THEN ARRAY['theme_master']
    WHEN 'grandmaster' THEN ARRAY['badge_crown','border_grandmaster',
                                  'hall_of_fame','trophy_season']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NEW.final_rank = 1 THEN
    v_bundle := v_bundle || ARRAY['top_1'];
  ELSIF NEW.final_rank <= 3 THEN
    v_bundle := v_bundle || ARRAY['top_3'];
  ELSIF NEW.final_rank <= 10 THEN
    v_bundle := v_bundle || ARRAY['top_10'];
  ELSIF NEW.final_rank <= 100 THEN
    v_bundle := v_bundle || ARRAY['top_100'];
  END IF;

  NEW.rewards := ARRAY(
    SELECT DISTINCT unnest(COALESCE(NEW.rewards, ARRAY[]::TEXT[]) || v_bundle)
  );

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_season_history_enrich ON public.season_history;
CREATE TRIGGER trg_season_history_enrich
  BEFORE INSERT OR UPDATE ON public.season_history
  FOR EACH ROW EXECUTE FUNCTION public._season_history_enrich();

-- Mirror the same bundles onto the LIVE board so the season's final standings s...

-- Section 103: EMAIL VERIFICATION LINK REGISTRATION (2026-07-29)
-- Replaces the SECTION 78 OTP flow with a verification-LINK flow in which the p...
-- register (username + email, no password) -> pending_registrations row, status...
-- WHY THE AUTH USER IS CREATED LAST Creating it up-front would mean a password-...
-- TOKENS ARE NEVER STORED IN PLAINTEXT

CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT NOT NULL UNIQUE,
  username           TEXT NOT NULL,

-- Account lifecycle
  status             TEXT NOT NULL DEFAULT 'pending_verification'
                       CHECK (status IN ('pending_verification','email_verified','completed')),
  email_verified     BOOLEAN NOT NULL DEFAULT false,

  -- Verification link: SHA-256 of the token that went out by email.
  token_hash         TEXT,
  token_expires_at   TIMESTAMPTZ,

-- Short-lived, single-use grant that authorises the create-password step
  setup_token_hash   TEXT,
  setup_expires_at   TIMESTAMPTZ,

  -- Abuse controls.
  send_count         INT NOT NULL DEFAULT 0,
  last_sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_registrations_token
  ON public.pending_registrations (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_registrations_setup
  ON public.pending_registrations (setup_token_hash) WHERE setup_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_registrations_expiry
  ON public.pending_registrations (token_expires_at);
CREATE INDEX IF NOT EXISTS idx_pending_registrations_username
  ON public.pending_registrations (lower(username));

-- RLS on with ZERO policies: anon and authenticated are denied outright
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_registrations FROM anon, authenticated;
GRANT ALL ON public.pending_registrations TO service_role;

-- 103.1 Housekeeping
-- Drops abandoned registrations
CREATE OR REPLACE FUNCTION public.purge_expired_registrations(p_grace_hours INT DEFAULT 72)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_deleted INT;
BEGIN
  DELETE FROM public.pending_registrations
  WHERE created_at < now() - make_interval(hours => GREATEST(COALESCE(p_grace_hours, 72), 1));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END; $fn$;
REVOKE ALL ON FUNCTION public.purge_expired_registrations(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_registrations(INT) TO service_role;

-- 103.2 Username availability
-- A name is taken if a profile holds it OR another in-flight registration has r...
CREATE OR REPLACE FUNCTION public.is_username_taken(
  p_username TEXT,
  p_except_email TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(p_username)
  ) OR EXISTS (
    SELECT 1 FROM public.pending_registrations
    WHERE lower(username) = lower(p_username)
      AND (p_except_email IS NULL OR lower(email) <> lower(p_except_email))
      AND created_at > now() - interval '72 hours'
  );
$fn$;
REVOKE ALL ON FUNCTION public.is_username_taken(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_username_taken(TEXT, TEXT) TO service_role;

-- 103.3 Deprecation note — SECTION 78 OTP
-- public.email_otp_verifications is no longer written or read by the applicatio...
-- section cannot destroy an in-flight OTP or require a coordinated rollout
--   DROP TABLE IF EXISTS public.email_otp_verifications;
-- public.is_email_registered() is still used by the new flow and stays.

-- 103.4 Repeat-click accuracy
-- The first cut cleared token_hash on consumption, which meant a second request...
-- The digest is now RETAINED and consumption is recorded separately, so a repea...
ALTER TABLE public.pending_registrations
  ADD COLUMN IF NOT EXISTS token_consumed_at TIMESTAMPTZ;

-- Completed registrations are kept (tokens cleared) rather than deleted, so a l...

-- Section 104: SPECTATOR MODE
-- Live spectating with a server-enforced broadcast delay.
-- Spectator RLS: apply game broadcast delay
-- Spectator RLS: apply game broadcast delay
-- Spectator RLS: apply game broadcast delay
-- Spectator RLS: apply game broadcast delay

-- 104.1 Visibility vocabulary and per-player preference
-- Each player controls their OWN side of the game
-- A preference resolves as: per-game override (this match only) → profile defau...
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'spectator_visibility') THEN
    EXECUTE 'CREATE TYPE public.spectator_visibility AS ENUM (''public'', ''friends'', ''private'')';
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS spectator_default public.spectator_visibility NOT NULL DEFAULT 'public';

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS white_spectator_pref public.spectator_visibility,
  ADD COLUMN IF NOT EXISTS black_spectator_pref public.spectator_visibility;

-- Restrictiveness rank — higher wins when combining two preferences.
CREATE OR REPLACE FUNCTION public.spectator_rank(v public.spectator_visibility)
RETURNS INT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE v WHEN 'private' THEN 2 WHEN 'friends' THEN 1 ELSE 0 END
$$;
GRANT EXECUTE ON FUNCTION public.spectator_rank(public.spectator_visibility)
  TO anon, authenticated, service_role;

-- 104.2 Tunable configuration (single row)
-- Spectator RLS: apply game broadcast delay
CREATE TABLE IF NOT EXISTS public.spectator_config (
  id                   BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  casual_delay_seconds INT NOT NULL DEFAULT 3  CHECK (casual_delay_seconds BETWEEN 0 AND 5),
  ranked_delay_seconds INT NOT NULL DEFAULT 25 CHECK (ranked_delay_seconds BETWEEN 20 AND 30),
  final_delay_seconds  INT NOT NULL DEFAULT 45 CHECK (final_delay_seconds BETWEEN 30 AND 60),
-- Spectator RLS: apply game broadcast delay
  session_ttl_seconds  INT NOT NULL DEFAULT 45 CHECK (session_ttl_seconds BETWEEN 15 AND 300),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.spectator_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.spectator_config TO anon, authenticated;
GRANT ALL ON public.spectator_config TO service_role;
ALTER TABLE public.spectator_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "spectator_config readable" ON public.spectator_config;
CREATE POLICY "spectator_config readable"
  ON public.spectator_config FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "spectator_config admin write" ON public.spectator_config;
CREATE POLICY "spectator_config admin write"
  ON public.spectator_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 104.3 RLS lockdown — live positions leave the public surface
-- Policies are OR'd, so these three together mean: everyone sees waiting and fi...
-- The admin branch is a separate `TO authenticated` policy on purpose — EXECUTE...
DROP POLICY IF EXISTS "Games are public" ON public.games;
DROP POLICY IF EXISTS "games public read settled" ON public.games;
CREATE POLICY "games public read settled"
  ON public.games FOR SELECT TO anon, authenticated
  USING (status <> 'active');
DROP POLICY IF EXISTS "games players read live" ON public.games;
CREATE POLICY "games players read live"
  ON public.games FOR SELECT TO authenticated
  USING (auth.uid() = white_id OR auth.uid() = black_id);
DROP POLICY IF EXISTS "games admin read live" ON public.games;
CREATE POLICY "games admin read live"
  ON public.games FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- game_moves inherits the same rule from its parent game: the move ledger of a ...
DROP POLICY IF EXISTS "moves readable" ON public.game_moves;
DROP POLICY IF EXISTS "moves public read settled" ON public.game_moves;
CREATE POLICY "moves public read settled"
  ON public.game_moves FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = game_moves.game_id AND g.status <> 'active'
  ));
DROP POLICY IF EXISTS "moves players read live" ON public.game_moves;
CREATE POLICY "moves players read live"
  ON public.game_moves FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = game_moves.game_id
      AND (auth.uid() = g.white_id OR auth.uid() = g.black_id)
  ));
DROP POLICY IF EXISTS "moves admin read live" ON public.game_moves;
CREATE POLICY "moves admin read live"
  ON public.game_moves FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 104.4 live_games — metadata for in-progress games, no position
-- Everything the lobby, the friends list and the live match card need, and noth...
DROP VIEW IF EXISTS public.live_games;
CREATE VIEW public.live_games
WITH (security_invoker = false) AS
  SELECT
    g.id,
    g.white_id,
    g.black_id,
    g.white_username,
    g.black_username,
    g.white_rating,
    g.black_rating,
    g.time_class,
    g.time_control,
    g.initial_seconds,
    g.increment_seconds,
    g.is_rated,
    g.vs_computer,
    g.moves_count,
    g.opening,
    g.created_at,
    g.last_move_at,
    GREATEST(
      public.spectator_rank(COALESCE(g.white_spectator_pref, wp.spectator_default, 'public')),
      public.spectator_rank(COALESCE(g.black_spectator_pref, bp.spectator_default, 'public'))
    ) AS visibility_rank
  FROM public.games g
  LEFT JOIN public.profiles wp ON wp.id = g.white_id
  LEFT JOIN public.profiles bp ON bp.id = g.black_id
  WHERE g.status = 'active'
    AND g.vs_computer = false
    AND g.white_id IS NOT NULL
    AND g.black_id IS NOT NULL;

GRANT SELECT ON public.live_games TO anon, authenticated, service_role;

-- 104.5 Delay and visibility helpers
-- Spectator RLS: apply game broadcast delay
CREATE OR REPLACE FUNCTION public.spectator_delay_seconds(p_game_id UUID)
RETURNS INT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg      public.spectator_config%ROWTYPE;
  v_is_rated BOOLEAN;
  v_is_final BOOLEAN := false;
BEGIN
  SELECT * INTO v_cfg FROM public.spectator_config WHERE id;
  SELECT is_rated INTO v_is_rated FROM public.games WHERE id = p_game_id;
  IF v_is_rated IS NULL THEN RETURN v_cfg.ranked_delay_seconds; END IF;

  SELECT tm.round = (
           SELECT max(tm2.round) FROM public.tournament_matches tm2
           WHERE tm2.tournament_id = tm.tournament_id
         )
    INTO v_is_final
  FROM public.tournament_matches tm
  WHERE tm.game_id = p_game_id
  LIMIT 1;

  IF COALESCE(v_is_final, false) THEN RETURN v_cfg.final_delay_seconds; END IF;
  IF v_is_rated THEN RETURN v_cfg.ranked_delay_seconds; END IF;
  RETURN v_cfg.casual_delay_seconds;
END; $$;
REVOKE EXECUTE ON FUNCTION public.spectator_delay_seconds(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spectator_delay_seconds(UUID)
  TO anon, authenticated, service_role;

-- May p_viewer watch p_game_id? Participants and admins always may
CREATE OR REPLACE FUNCTION public.can_spectate(p_game_id UUID, p_viewer UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_g    public.games%ROWTYPE;
  v_rank INT;
BEGIN
  SELECT * INTO v_g FROM public.games WHERE id = p_game_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Your own game is always yours to look at.
  IF p_viewer IS NOT NULL AND p_viewer IN (v_g.white_id, v_g.black_id) THEN RETURN true; END IF;
  IF p_viewer IS NOT NULL AND public.has_role(p_viewer, 'admin') THEN RETURN true; END IF;

-- Practice against the engine is nobody else's business
  IF v_g.vs_computer THEN RETURN false; END IF;

  SELECT GREATEST(
    public.spectator_rank(COALESCE(
      v_g.white_spectator_pref,
      (SELECT spectator_default FROM public.profiles WHERE id = v_g.white_id),
      'public')),
    public.spectator_rank(COALESCE(
      v_g.black_spectator_pref,
      (SELECT spectator_default FROM public.profiles WHERE id = v_g.black_id),
      'public'))
  ) INTO v_rank;

  IF v_rank = 2 THEN RETURN false; END IF;                 -- private
  IF v_rank = 0 THEN RETURN true;  END IF;                 -- public
  IF p_viewer IS NULL THEN RETURN false; END IF;           -- friends-only, signed out

  RETURN EXISTS (
    SELECT 1 FROM public.friends f
    WHERE f.status = 'accepted'
      AND (
        (f.requester_id = p_viewer AND f.addressee_id IN (v_g.white_id, v_g.black_id)) OR
        (f.addressee_id = p_viewer AND f.requester_id IN (v_g.white_id, v_g.black_id))
      )
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.can_spectate(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_spectate(UUID, UUID)
  TO anon, authenticated, service_role;

-- 104.6 Spectator sessions and viewer counts
-- Spectator RLS: apply game broadcast delay
CREATE TABLE IF NOT EXISTS public.spectator_sessions (
  game_id    UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_spectator_sessions_seen
  ON public.spectator_sessions(game_id, last_seen DESC);

GRANT SELECT ON public.spectator_sessions TO authenticated;
GRANT ALL ON public.spectator_sessions TO service_role;
ALTER TABLE public.spectator_sessions ENABLE ROW LEVEL SECURITY;
-- Writes go through spectator_heartbeat() only, so no INSERT/UPDATE policy.
DROP POLICY IF EXISTS "spectator_sessions own read" ON public.spectator_sessions;
CREATE POLICY "spectator_sessions own read"
  ON public.spectator_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Denormalised live count, so the browse page reads one row per game instead of...
CREATE TABLE IF NOT EXISTS public.spectator_counts (
  game_id    UUID PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  viewers    INT NOT NULL DEFAULT 0 CHECK (viewers >= 0),
  peak       INT NOT NULL DEFAULT 0 CHECK (peak >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spectator_counts_viewers
  ON public.spectator_counts(viewers DESC);

GRANT SELECT ON public.spectator_counts TO anon, authenticated;
GRANT ALL ON public.spectator_counts TO service_role;
ALTER TABLE public.spectator_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "spectator_counts readable" ON public.spectator_counts;
CREATE POLICY "spectator_counts readable"
  ON public.spectator_counts FOR SELECT TO anon, authenticated USING (true);

-- Refresh my presence in a game's audience and return the live count
CREATE OR REPLACE FUNCTION public.spectator_heartbeat(p_game_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_ttl   INT;
  v_count INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF NOT public.can_spectate(p_game_id, v_uid) THEN
    RAISE EXCEPTION 'Not allowed to spectate this game';
  END IF;

  SELECT session_ttl_seconds INTO v_ttl FROM public.spectator_config WHERE id;

  -- Players are watching their own board, not spectating it.
  IF NOT EXISTS (
    SELECT 1 FROM public.games
    WHERE id = p_game_id AND v_uid IN (white_id, black_id)
  ) THEN
    INSERT INTO public.spectator_sessions (game_id, user_id)
    VALUES (p_game_id, v_uid)
    ON CONFLICT (game_id, user_id) DO UPDATE SET last_seen = now();
  END IF;

  DELETE FROM public.spectator_sessions
  WHERE game_id = p_game_id AND last_seen < now() - make_interval(secs => v_ttl);

  SELECT count(*) INTO v_count
  FROM public.spectator_sessions WHERE game_id = p_game_id;

  INSERT INTO public.spectator_counts (game_id, viewers, peak, updated_at)
  VALUES (p_game_id, v_count, v_count, now())
  ON CONFLICT (game_id) DO UPDATE
    SET viewers = EXCLUDED.viewers,
        peak = GREATEST(public.spectator_counts.peak, EXCLUDED.viewers),
        updated_at = now();

  RETURN v_count;
END; $$;
REVOKE EXECUTE ON FUNCTION public.spectator_heartbeat(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spectator_heartbeat(UUID) TO authenticated, service_role;

-- Leave the audience immediately instead of waiting out the TTL.
CREATE OR REPLACE FUNCTION public.spectator_leave(p_game_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_count INT;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  DELETE FROM public.spectator_sessions WHERE game_id = p_game_id AND user_id = v_uid;
  SELECT count(*) INTO v_count FROM public.spectator_sessions WHERE game_id = p_game_id;
  UPDATE public.spectator_counts SET viewers = v_count, updated_at = now()
  WHERE game_id = p_game_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.spectator_leave(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spectator_leave(UUID) TO authenticated, service_role;

-- 104.7 get_spectator_game() — the delayed feed
-- The only way a non-participant obtains a live position.
-- Spectator RLS: apply game broadcast delay
-- Spectator RLS: apply game broadcast delay
-- Spectator RLS: apply game broadcast delay
CREATE OR REPLACE FUNCTION public.get_spectator_game(p_game_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_g            public.games%ROWTYPE;
  v_delay        INT;
  v_cutoff       TIMESTAMPTZ;
  v_is_player    BOOLEAN;
  v_visible_plies INT;
  v_total_plies  INT;
  v_fen          TEXT;
  v_last_at      TIMESTAMPTZ;
  v_white_ms     INT;
  v_black_ms     INT;
  v_status       TEXT;
  v_result       TEXT;
  v_winner       UUID;
  v_end_reason   TEXT;
  v_ended        BOOLEAN;
  v_moves        JSONB;
  v_viewers      INT;
  v_tour         JSONB := NULL;
-- Scalars rather than RECORDs: a vs-computer or half-joined game has a NULL pla...
  v_w_avatar TEXT; v_w_country TEXT; v_w_title TEXT;
  v_w_tier   public.premium_tier; v_w_sp INT; v_w_rung TEXT;
  v_b_avatar TEXT; v_b_country TEXT; v_b_title TEXT;
  v_b_tier   public.premium_tier; v_b_sp INT; v_b_rung TEXT;
BEGIN
  SELECT * INTO v_g FROM public.games WHERE id = p_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF NOT public.can_spectate(p_game_id, v_uid) THEN
    RAISE EXCEPTION 'This game is not open to spectators';
  END IF;

  v_is_player := v_uid IS NOT NULL AND v_uid IN (v_g.white_id, v_g.black_id);
  v_delay := public.spectator_delay_seconds(p_game_id);

-- Players see their own game live; so does everyone once it is over, since a fi...
  IF v_is_player OR v_g.status <> 'active' THEN
    v_delay := 0;
  END IF;
  v_cutoff := now() - make_interval(secs => v_delay);

  SELECT count(*) INTO v_total_plies FROM public.game_moves WHERE game_id = p_game_id;

  SELECT count(*) INTO v_visible_plies
  FROM public.game_moves WHERE game_id = p_game_id AND created_at <= v_cutoff;

  SELECT gm.fen_after, gm.created_at INTO v_fen, v_last_at
  FROM public.game_moves gm
  WHERE gm.game_id = p_game_id AND gm.created_at <= v_cutoff
  ORDER BY gm.ply DESC LIMIT 1;

  -- No ply has cleared the embargo yet → the starting position.
  IF v_fen IS NULL THEN
    v_fen := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  END IF;

-- Spectator RLS: apply game broadcast delay
  SELECT gm.time_left_ms INTO v_white_ms
  FROM public.game_moves gm
  WHERE gm.game_id = p_game_id AND gm.created_at <= v_cutoff AND gm.ply % 2 = 1
  ORDER BY gm.ply DESC LIMIT 1;

  SELECT gm.time_left_ms INTO v_black_ms
  FROM public.game_moves gm
  WHERE gm.game_id = p_game_id AND gm.created_at <= v_cutoff AND gm.ply % 2 = 0
  ORDER BY gm.ply DESC LIMIT 1;

  v_white_ms := COALESCE(v_white_ms, v_g.initial_seconds * 1000);
  v_black_ms := COALESCE(v_black_ms, v_g.initial_seconds * 1000);

  -- Withhold the ending until the delay has caught up with it.
  v_ended := v_g.ended_at IS NOT NULL AND v_g.ended_at <= v_cutoff;
  IF v_ended THEN
    v_status     := v_g.status;
    v_result     := v_g.result::TEXT;
    v_winner     := v_g.winner_id;
    v_end_reason := v_g.end_reason;
  ELSE
    v_status     := CASE WHEN v_g.status = 'waiting' THEN 'waiting' ELSE 'active' END;
    v_result     := 'ongoing';
    v_winner     := NULL;
    v_end_reason := NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(m ORDER BY (m->>'ply')::INT), '[]'::jsonb) INTO v_moves
  FROM (
    SELECT jsonb_build_object(
             'ply', gm.ply,
             'san', gm.san,
             'uci', gm.uci,
             'fen_after', gm.fen_after,
             'time_left_ms', gm.time_left_ms,
             'created_at', gm.created_at
           ) AS m
    FROM public.game_moves gm
    WHERE gm.game_id = p_game_id AND gm.created_at <= v_cutoff
  ) s;

  SELECT viewers INTO v_viewers FROM public.spectator_counts WHERE game_id = p_game_id;

  SELECT jsonb_build_object(
           'tournament_id', t.id,
           'name',          t.name,
           'slug',          t.slug,
           'round',         tm.round,
           'is_final',      tm.round = (
             SELECT max(tm2.round) FROM public.tournament_matches tm2
             WHERE tm2.tournament_id = tm.tournament_id
           )
         ) INTO v_tour
  FROM public.tournament_matches tm
  JOIN public.tournaments t ON t.id = tm.tournament_id
  WHERE tm.game_id = p_game_id
  LIMIT 1;

  SELECT p.avatar_url, p.country, p.title, p.premium_tier,
         (SELECT sr.season_iq FROM public.season_rankings sr
          JOIN public.seasons se ON se.id = sr.season_id AND se.status = 'live'
          WHERE sr.user_id = p.id LIMIT 1),
         (SELECT sr.rung_id FROM public.season_rankings sr
          JOIN public.seasons se ON se.id = sr.season_id AND se.status = 'live'
          WHERE sr.user_id = p.id LIMIT 1)
    INTO v_w_avatar, v_w_country, v_w_title, v_w_tier, v_w_sp, v_w_rung
  FROM public.profiles p WHERE p.id = v_g.white_id;

  SELECT p.avatar_url, p.country, p.title, p.premium_tier,
         (SELECT sr.season_iq FROM public.season_rankings sr
          JOIN public.seasons se ON se.id = sr.season_id AND se.status = 'live'
          WHERE sr.user_id = p.id LIMIT 1),
         (SELECT sr.rung_id FROM public.season_rankings sr
          JOIN public.seasons se ON se.id = sr.season_id AND se.status = 'live'
          WHERE sr.user_id = p.id LIMIT 1)
    INTO v_b_avatar, v_b_country, v_b_title, v_b_tier, v_b_sp, v_b_rung
  FROM public.profiles p WHERE p.id = v_g.black_id;

  RETURN jsonb_build_object(
    'id',                p_game_id,
    'is_player',         v_is_player,
    'delay_seconds',     v_delay,
    'moves_behind',      GREATEST(v_total_plies - v_visible_plies, 0),
    'server_time',       now(),

    'white', jsonb_build_object(
      'id', v_g.white_id, 'username', v_g.white_username, 'rating', v_g.white_rating,
      'avatar_url', v_w_avatar, 'country', v_w_country, 'title', v_w_title,
      'premium_tier', v_w_tier,
      'season_points', v_w_sp, 'rung_id', v_w_rung,
      'time_ms', v_white_ms
    ),
    'black', jsonb_build_object(
      'id', v_g.black_id, 'username', v_g.black_username, 'rating', v_g.black_rating,
      'avatar_url', v_b_avatar, 'country', v_b_country, 'title', v_b_title,
      'premium_tier', v_b_tier,
      'season_points', v_b_sp, 'rung_id', v_b_rung,
      'time_ms', v_black_ms
    ),

    'fen',               v_fen,
    'turn',              split_part(v_fen, ' ', 2),
    'moves_count',       v_visible_plies,
    'last_move_at',      v_last_at,
    'moves',             v_moves,

    'status',            v_status,
    'result',            v_result,
    'winner_id',         v_winner,
    'end_reason',        v_end_reason,

    'time_class',        v_g.time_class,
    'time_control',      v_g.time_control,
    'initial_seconds',   v_g.initial_seconds,
    'increment_seconds', v_g.increment_seconds,
    'is_rated',          v_g.is_rated,
    'opening',           v_g.opening,
    'started_at',        v_g.created_at,
    'viewers',           COALESCE(v_viewers, 0),
    'tournament',        v_tour
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_spectator_game(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_spectator_game(UUID)
  TO anon, authenticated, service_role;

-- 104.8 list_live_games() — the browse and featured feed
-- Position-free by construction: it reads public.live_games, which has no posit...
-- `featured` marks the matches the spec wants surfaced on the home page: top-ra...
CREATE OR REPLACE FUNCTION public.list_live_games(
  p_limit      INT  DEFAULT 24,
  p_offset     INT  DEFAULT 0,
  p_time_class public.time_class DEFAULT NULL,
  p_rated_only BOOLEAN DEFAULT false,
  p_sort       TEXT DEFAULT 'featured'
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_rows JSONB;
  v_lim  INT  := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60);
  v_off  INT  := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  SELECT COALESCE(jsonb_agg(card ORDER BY ord, started_at DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'id',            lg.id,
        'white', jsonb_build_object(
          'id', lg.white_id, 'username', lg.white_username, 'rating', lg.white_rating,
          'avatar_url', wp.avatar_url, 'country', wp.country, 'title', wp.title,
          'season_points', wsr.season_iq, 'rung_id', wsr.rung_id),
        'black', jsonb_build_object(
          'id', lg.black_id, 'username', lg.black_username, 'rating', lg.black_rating,
          'avatar_url', bp.avatar_url, 'country', bp.country, 'title', bp.title,
          'season_points', bsr.season_iq, 'rung_id', bsr.rung_id),
        'time_class',    lg.time_class,
        'time_control',  lg.time_control,
        'is_rated',      lg.is_rated,
        'moves_count',   lg.moves_count,
        'opening',       lg.opening,
        'started_at',    lg.created_at,
        'viewers',       COALESCE(sc.viewers, 0),
        'avg_rating',    (COALESCE(lg.white_rating, 0) + COALESCE(lg.black_rating, 0)) / 2,
        'tournament',    CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object(
                           'tournament_id', t.id, 'name', t.name, 'slug', t.slug,
                           'round', tm.round,
                           'is_final', tm.round = (
                             SELECT max(tm2.round) FROM public.tournament_matches tm2
                             WHERE tm2.tournament_id = tm.tournament_id)) END,
        'featured',      t.id IS NOT NULL
                           OR COALESCE(sc.viewers, 0) >= 25
                           OR (COALESCE(lg.white_rating, 0) + COALESCE(lg.black_rating, 0)) / 2 >= 2000
      ) AS row,
      lg.created_at AS started_at,
      CASE COALESCE(p_sort, 'featured')
        WHEN 'viewers' THEN -COALESCE(sc.viewers, 0)
        WHEN 'rating'  THEN -((COALESCE(lg.white_rating, 0) + COALESCE(lg.black_rating, 0)) / 2)
        WHEN 'recent'  THEN 0
        ELSE -- 'featured': tournament games first, then crowds, then strength
             (CASE WHEN t.id IS NOT NULL THEN -1000000 ELSE 0 END)
             - COALESCE(sc.viewers, 0) * 100
             - ((COALESCE(lg.white_rating, 0) + COALESCE(lg.black_rating, 0)) / 2)
      END AS ord
    FROM public.live_games lg
    LEFT JOIN public.profiles wp ON wp.id = lg.white_id
    LEFT JOIN public.profiles bp ON bp.id = lg.black_id
-- Season standing for the tier chip on each card
    LEFT JOIN LATERAL (
      SELECT sr.season_iq, sr.rung_id FROM public.season_rankings sr
      JOIN public.seasons se ON se.id = sr.season_id AND se.status = 'live'
      WHERE sr.user_id = lg.white_id LIMIT 1
    ) wsr ON true
    LEFT JOIN LATERAL (
      SELECT sr.season_iq, sr.rung_id FROM public.season_rankings sr
      JOIN public.seasons se ON se.id = sr.season_id AND se.status = 'live'
      WHERE sr.user_id = lg.black_id LIMIT 1
    ) bsr ON true
    LEFT JOIN public.spectator_counts sc ON sc.game_id = lg.id
    LEFT JOIN public.tournament_matches tm ON tm.game_id = lg.id
    LEFT JOIN public.tournaments t ON t.id = tm.tournament_id
    WHERE (p_time_class IS NULL OR lg.time_class = p_time_class)
      AND (NOT COALESCE(p_rated_only, false) OR lg.is_rated)
-- Public games are listed for everyone; anything more private is filtered per v...
      AND (lg.visibility_rank = 0 OR public.can_spectate(lg.id, v_uid))
    ORDER BY ord, lg.created_at DESC
    LIMIT v_lim OFFSET v_off
  ) s;

  RETURN v_rows;
END; $$;
REVOKE EXECUTE ON FUNCTION public.list_live_games(INT, INT, public.time_class, BOOLEAN, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_live_games(INT, INT, public.time_class, BOOLEAN, TEXT)
  TO anon, authenticated, service_role;

-- 104.9 set_spectator_visibility()
-- A participant sets the preference for THEIR OWN side of a match
CREATE OR REPLACE FUNCTION public.set_spectator_visibility(
  p_game_id    UUID,
  p_visibility public.spectator_visibility
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_g   public.games%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_g FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_uid = v_g.white_id THEN
    UPDATE public.games SET white_spectator_pref = p_visibility WHERE id = p_game_id;
  ELSIF v_uid = v_g.black_id THEN
    UPDATE public.games SET black_spectator_pref = p_visibility WHERE id = p_game_id;
  ELSE
    RAISE EXCEPTION 'Only the players can change spectator visibility';
  END IF;

  -- Turning spectators off empties the room immediately.
  IF p_visibility = 'private' THEN
    DELETE FROM public.spectator_sessions WHERE game_id = p_game_id;
    UPDATE public.spectator_counts SET viewers = 0, updated_at = now()
    WHERE game_id = p_game_id;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION
  public.set_spectator_visibility(UUID, public.spectator_visibility) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.set_spectator_visibility(UUID, public.spectator_visibility)
  TO authenticated, service_role;

-- Set the account-wide default used by every future match.
CREATE OR REPLACE FUNCTION public.set_spectator_default(
  p_visibility public.spectator_visibility
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.profiles SET spectator_default = p_visibility WHERE id = v_uid;
END; $$;
REVOKE EXECUTE ON FUNCTION
  public.set_spectator_default(public.spectator_visibility) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.set_spectator_default(public.spectator_visibility) TO authenticated, service_role;






-- Section 105: AUTH UNIFICATION  (2026-07-29)
-- Run this once against the project your app's SUPABASE_URL points at (Dashboar...
-- WHY THIS EXISTS Two things were wrong on the live database:
-- 1
-- Onboarding setup: assign default username & country
-- WHERE THE IDENTITY COLUMNS LIVE, AND WHY NOT ON `profiles` public.profiles is...


-- 105.1  SECTION 103 CATCH-UP — the registration staging table
-- Identical to schema.sql SECTION 103; reproduced here so this file can be appl...

CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT NOT NULL UNIQUE,
  username           TEXT NOT NULL,

  status             TEXT NOT NULL DEFAULT 'pending_verification'
                       CHECK (status IN ('pending_verification','email_verified','completed')),
  email_verified     BOOLEAN NOT NULL DEFAULT false,

-- SHA-256 of the token that went out by email
  token_hash         TEXT,
  token_expires_at   TIMESTAMPTZ,
  token_consumed_at  TIMESTAMPTZ,

  -- Short-lived, single-use grant authorising the create-password step.
  setup_token_hash   TEXT,
  setup_expires_at   TIMESTAMPTZ,

  send_count         INT NOT NULL DEFAULT 0,
  last_sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at        TIMESTAMPTZ
);

-- Present separately too: a database that got an early cut of SECTION 103 has t...
ALTER TABLE public.pending_registrations
  ADD COLUMN IF NOT EXISTS token_consumed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pending_registrations_token
  ON public.pending_registrations (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_registrations_setup
  ON public.pending_registrations (setup_token_hash) WHERE setup_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_registrations_expiry
  ON public.pending_registrations (token_expires_at);
CREATE INDEX IF NOT EXISTS idx_pending_registrations_username
  ON public.pending_registrations (lower(username));

-- RLS on with ZERO policies: anon and authenticated are denied outright
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_registrations FROM anon, authenticated;
GRANT ALL ON public.pending_registrations TO service_role;

-- Drops abandoned registrations
CREATE OR REPLACE FUNCTION public.purge_expired_registrations(p_grace_hours INT DEFAULT 72)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_deleted INT;
BEGIN
  DELETE FROM public.pending_registrations
  WHERE created_at < now() - make_interval(hours => GREATEST(COALESCE(p_grace_hours, 72), 1));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END; $fn$;
REVOKE ALL ON FUNCTION public.purge_expired_registrations(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_registrations(INT) TO service_role;

-- A name is taken if a profile holds it OR another in-flight registration has r...
CREATE OR REPLACE FUNCTION public.is_username_taken(
  p_username TEXT,
  p_except_email TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(p_username)
  ) OR EXISTS (
    SELECT 1 FROM public.pending_registrations
    WHERE lower(username) = lower(p_username)
      AND (p_except_email IS NULL OR lower(email) <> lower(p_except_email))
      AND created_at > now() - interval '72 hours'
  );
$fn$;
REVOKE ALL ON FUNCTION public.is_username_taken(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_username_taken(TEXT, TEXT) TO service_role;

-- auth.users is not exposed via PostgREST; this SECURITY DEFINER shim lets the ...
CREATE OR REPLACE FUNCTION public.is_email_registered(p_email TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email));
$fn$;
REVOKE ALL ON FUNCTION public.is_email_registered(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_registered(TEXT) TO service_role;


-- 105.2  ACCOUNT IDENTITY — one email, one account, one provider

CREATE TABLE IF NOT EXISTS public.user_accounts (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

-- Mirror of auth.users.email, kept in step by the triggers below so the app can...
  email              TEXT NOT NULL,

-- How the account was FIRST created
  provider           TEXT NOT NULL DEFAULT 'email'
                       CHECK (provider IN ('email','google')),

  email_verified     BOOLEAN NOT NULL DEFAULT false,
-- True once the account has a usable Supabase Auth password
  password_created   BOOLEAN NOT NULL DEFAULT false,
  -- The onboarding form is shown while this is false, and exactly once.
  profile_completed  BOOLEAN NOT NULL DEFAULT false,

  timezone           TEXT,
  preferred_language TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The hard guarantee behind "one email = one ChessOx account"
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_email_unique
  ON public.user_accounts (lower(email));

ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;

-- Readable by its owner only — never by anon, never by other players.
REVOKE ALL ON public.user_accounts FROM anon, authenticated;
GRANT SELECT ON public.user_accounts TO authenticated;
GRANT ALL ON public.user_accounts TO service_role;

DROP POLICY IF EXISTS "own account row is readable" ON public.user_accounts;
CREATE POLICY "own account row is readable"
  ON public.user_accounts FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Onboarding setup: assign default username & country

-- `city` is public profile data, so it belongs beside country/state.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';


-- 105.3  USERNAME GENERATION — exactly 11 chars: 8 letters + 1 of [_.] + 2 digits

-- One candidate
CREATE OR REPLACE FUNCTION public.chessox_username_candidate(p_seed TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SET search_path = public AS $fn$
DECLARE
  v_letters CONSTANT TEXT := 'abcdefghijklmnopqrstuvwxyz';
  v_base TEXT;
BEGIN
  v_base := lower(regexp_replace(COALESCE(p_seed, ''), '[^a-zA-Z]', '', 'g'));
  v_base := substr(v_base, 1, 8);
  WHILE length(v_base) < 8 LOOP
    v_base := v_base || substr(v_letters, 1 + floor(random() * 26)::int, 1);
  END LOOP;

  RETURN v_base
      || CASE WHEN random() < 0.5 THEN '_' ELSE '.' END
      || lpad(floor(random() * 100)::int::text, 2, '0');
END; $fn$;

-- Retries until the candidate is free, so uniqueness is guaranteed rather than ...
CREATE OR REPLACE FUNCTION public.generate_unique_username(p_seed TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_candidate TEXT;
  v_attempt   INT := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
-- After a few tries stop honouring the seed: if "chessfox" is congested, more "...
    v_candidate := public.chessox_username_candidate(
      CASE WHEN v_attempt <= 5 THEN p_seed ELSE NULL END
    );

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_candidate)
       AND NOT EXISTS (
         SELECT 1 FROM public.pending_registrations
         WHERE lower(username) = v_candidate
           AND created_at > now() - interval '72 hours'
       )
    THEN
      RETURN v_candidate;
    END IF;

    IF v_attempt >= 100 THEN
      RAISE EXCEPTION 'could not generate a unique username after % attempts', v_attempt;
    END IF;
  END LOOP;
END; $fn$;
REVOKE ALL ON FUNCTION public.generate_unique_username(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_unique_username(TEXT) TO service_role;


-- 105.4  PROVIDER LOOKUP — what does the app tell someone about this email?
-- Returns everything the "an account already exists with this email" decision n...
CREATE OR REPLACE FUNCTION public.account_for_email(p_email TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'exists',         true,
        'user_id',        u.id,
        'provider',       COALESCE(a.provider, 'email'),
        'has_password',   (u.encrypted_password IS NOT NULL AND u.encrypted_password <> ''),
        'email_verified', (u.email_confirmed_at IS NOT NULL),
        'identities',     COALESCE(
                            (SELECT array_agg(DISTINCT i.provider)
                               FROM auth.identities i WHERE i.user_id = u.id),
                            ARRAY[]::TEXT[]
                          )
      )
      FROM auth.users u
      LEFT JOIN public.user_accounts a ON a.id = u.id
      WHERE lower(u.email) = lower(p_email)
      LIMIT 1
    ),
    jsonb_build_object('exists', false)
  );
$fn$;
REVOKE ALL ON FUNCTION public.account_for_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_for_email(TEXT) TO service_role;


-- 105.5  SIGNUP TRIGGER — extend, don't replace
-- Everything SECTION 21 did (profile, role, ratings, subscription, wallet + wel...
-- The trigger runs inside the same transaction as the auth.users INSERT, so any...
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_username  TEXT;
  v_full_name TEXT;
  v_provider  TEXT;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );

-- 'email' for password signups (including the admin API used by the verificatio...
  v_provider := CASE
    WHEN COALESCE(NEW.raw_app_meta_data->>'provider', 'email') = 'google' THEN 'google'
    ELSE 'email'
  END;

  v_username := public.generate_unique_username(v_full_name);

  INSERT INTO public.profiles (id, username, full_name, avatar_url)
  VALUES (NEW.id, v_username, v_full_name, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_accounts (
    id, email, provider, email_verified, password_created, profile_completed
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_provider,
    NEW.email_confirmed_at IS NOT NULL,
    NEW.encrypted_password IS NOT NULL AND NEW.encrypted_password <> '',
    false
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.ratings (user_id, time_class) VALUES
    (NEW.id, 'bullet'), (NEW.id, 'blitz'), (NEW.id, 'rapid'), (NEW.id, 'classical')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'inactive')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.wallets (user_id, balance, total_earned)
  VALUES (NEW.id, 50, 50)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, description, idempotency_key)
  VALUES
    (NEW.id, 'welcome_bonus', 50, 50, 'Welcome to ChessOx! Here are 50 bonus coins.',
     'welcome_' || NEW.id::text)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 105.6  Keep the mirror honest
-- Supabase Auth owns email confirmation and password hashing
CREATE OR REPLACE FUNCTION public.sync_user_account_from_auth()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE public.user_accounts SET
    email            = NEW.email,
    email_verified   = NEW.email_confirmed_at IS NOT NULL,
    password_created = (NEW.encrypted_password IS NOT NULL AND NEW.encrypted_password <> ''),
    updated_at       = now()
  WHERE id = NEW.id;
  RETURN NEW;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.sync_user_account_from_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_identity_changed ON auth.users;
CREATE TRIGGER on_auth_user_identity_changed
  AFTER UPDATE OF email, email_confirmed_at, encrypted_password ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_account_from_auth();


-- 105.7  Identity columns are server-owned
-- There is no client UPDATE grant on user_accounts today, but a future policy a...
CREATE OR REPLACE FUNCTION public.user_accounts_protect_identity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;
  NEW.email             := OLD.email;
  NEW.provider          := OLD.provider;
  NEW.email_verified    := OLD.email_verified;
  NEW.password_created  := OLD.password_created;
  NEW.profile_completed := OLD.profile_completed;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_user_accounts_protect_identity ON public.user_accounts;
CREATE TRIGGER trg_user_accounts_protect_identity
  BEFORE UPDATE ON public.user_accounts
  FOR EACH ROW EXECUTE FUNCTION public.user_accounts_protect_identity();


-- 105.8  BACKFILL — existing accounts keep working
-- Onboarding setup: assign default username & country
INSERT INTO public.user_accounts (
  id, email, provider, email_verified, password_created, profile_completed, created_at
)
SELECT
  u.id,
  u.email,
  CASE
    WHEN EXISTS (SELECT 1 FROM auth.identities i
                  WHERE i.user_id = u.id AND i.provider = 'google')
     AND NOT EXISTS (SELECT 1 FROM auth.identities i
                  WHERE i.user_id = u.id AND i.provider = 'email')
    THEN 'google' ELSE 'email'
  END,
  u.email_confirmed_at IS NOT NULL,
  u.encrypted_password IS NOT NULL AND u.encrypted_password <> '',
  true,
  u.created_at
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;


-- 105.9  Verification — every row should read "ok"
SELECT
  CASE WHEN to_regclass('public.pending_registrations') IS NOT NULL
       THEN 'ok' ELSE 'MISSING' END                       AS pending_registrations,
  CASE WHEN to_regclass('public.user_accounts') IS NOT NULL
       THEN 'ok' ELSE 'MISSING' END                       AS user_accounts,
  CASE WHEN to_regproc('public.is_username_taken') IS NOT NULL
       THEN 'ok' ELSE 'MISSING' END                       AS is_username_taken,
  CASE WHEN to_regproc('public.is_email_registered') IS NOT NULL
       THEN 'ok' ELSE 'MISSING' END                       AS is_email_registered,
  CASE WHEN to_regproc('public.account_for_email') IS NOT NULL
       THEN 'ok' ELSE 'MISSING' END                       AS account_for_email,
  CASE WHEN to_regproc('public.generate_unique_username') IS NOT NULL
       THEN 'ok' ELSE 'MISSING' END                       AS generate_unique_username,
  (SELECT count(*) FROM auth.users)                       AS auth_users,
  (SELECT count(*) FROM public.user_accounts)             AS mirrored_accounts;


ALTER TABLE public.wallets 
ADD COLUMN IF NOT EXISTS locked_balance INT NOT NULL DEFAULT 0;


-- FIDE 6.9 — a flag fall is only a loss if the opponent can still mate
-- NOT YET APPLIED to the deployed database
-- Until it is applied the two paths disagree: a game that ends on the clock ins...
-- Idempotent: CREATE OR REPLACE only, no data changes.

-- Mirrors hasMatingMaterial() in src/lib/chess/rules.ts.
CREATE OR REPLACE FUNCTION public.has_mating_material(p_fen TEXT, p_color TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_board   TEXT := split_part(p_fen, ' ', 1);
  v_pawns   INT;
  v_knights INT;
  v_bishops INT;
  v_majors  INT;
BEGIN
  IF p_color = 'w' THEN
    v_pawns   := length(v_board) - length(replace(v_board, 'P', ''));
    v_knights := length(v_board) - length(replace(v_board, 'N', ''));
    v_bishops := length(v_board) - length(replace(v_board, 'B', ''));
    v_majors  := (length(v_board) - length(replace(v_board, 'R', '')))
               + (length(v_board) - length(replace(v_board, 'Q', '')));
  ELSE
    v_pawns   := length(v_board) - length(replace(v_board, 'p', ''));
    v_knights := length(v_board) - length(replace(v_board, 'n', ''));
    v_bishops := length(v_board) - length(replace(v_board, 'b', ''));
    v_majors  := (length(v_board) - length(replace(v_board, 'r', '')))
               + (length(v_board) - length(replace(v_board, 'q', '')));
  END IF;

  IF v_pawns > 0 OR v_majors > 0 THEN RETURN TRUE; END IF;
  RETURN (v_bishops + v_knights) >= 2;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_timeout(p_game_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_game       public.games%ROWTYPE;
  v_elapsed_ms BIGINT;
  v_to_move_ms INT;
  v_result     public.game_result;
  v_winner     UUID;
  v_opponent   TEXT;
  v_reason     TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.status <> 'active' THEN RETURN false; END IF;
  IF v_uid <> v_game.white_id AND v_uid <> v_game.black_id THEN
    RAISE EXCEPTION 'Not a player';
  END IF;

  v_elapsed_ms := EXTRACT(EPOCH FROM (
    now() - COALESCE(v_game.last_move_at, v_game.created_at)
  )) * 1000;
  v_to_move_ms := CASE WHEN v_game.turn = 'w'
                    THEN v_game.white_time_ms
                    ELSE v_game.black_time_ms
                  END;

  IF v_elapsed_ms < v_to_move_ms THEN RETURN false; END IF;

  v_opponent := CASE WHEN v_game.turn = 'w' THEN 'b' ELSE 'w' END;

  IF public.has_mating_material(v_game.fen, v_opponent) THEN
    v_reason := 'timeout';
    IF v_game.turn = 'w' THEN
      v_result := 'black'; v_winner := v_game.black_id;
    ELSE
      v_result := 'white'; v_winner := v_game.white_id;
    END IF;
  ELSE
    v_result := 'draw'; v_winner := NULL; v_reason := 'timeout_vs_insufficient';
  END IF;

  UPDATE public.games SET
    status       = 'finished',
    result       = v_result,
    winner_id    = v_winner,
    end_reason   = v_reason,
    ended_at     = now(),
    white_time_ms = CASE WHEN v_game.turn = 'w' THEN 0 ELSE v_game.white_time_ms END,
    black_time_ms = CASE WHEN v_game.turn = 'b' THEN 0 ELSE v_game.black_time_ms END
  WHERE id = p_game_id;

  PERFORM public.apply_elo_change(p_game_id);
  RETURN true;
END; $$;

REVOKE EXECUTE ON FUNCTION public.claim_timeout(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_timeout(UUID) TO authenticated, service_role;

-- Sanity checks (expect: f, f, f, t, t, t) SELECT public.has_mating_material('8...

-- Section 200: HOT-PATH INDEXES
-- Indexes for the read patterns the live game surfaces issue on every board load

-- game.$id.tsx loads the whole chat for a board with SELECT ..
CREATE INDEX IF NOT EXISTS idx_game_chat_game_created
  ON public.game_chat (game_id, created_at);

-- The lobby / matchmaking surfaces filter open games by status, and the clock s...
CREATE INDEX IF NOT EXISTS idx_games_status_created
  ON public.games (status, created_at DESC);

-- Spectator + live-game feeds read active boards by time class.
CREATE INDEX IF NOT EXISTS idx_games_active_time_class
  ON public.games (time_class, last_move_at DESC)
  WHERE status = 'active';

-- Section 201: REMOVE STANDALONE LEADERBOARD FEATURE
-- Compute seasonal SP rung and division
-- Other objects that happen to share the word "leaderboard" — clan_leaderboard ...
DROP FUNCTION IF EXISTS public.get_dynamic_leaderboard(text, text, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_dynamic_leaderboard(text, text, text, text, text, text, boolean, integer, integer);
DROP VIEW IF EXISTS public.leaderboard_view CASCADE;

-- Section 202: STORAGE BUCKETS & PUBLIC POLICIES (Avatars & Banners)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true),
       ('banners', 'banners', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public SELECT policies on storage.objects so avatars & banners are readable by all users
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Public Access to Avatars" ON storage.objects';
    EXECUTE 'CREATE POLICY "Public Access to Avatars" ON storage.objects FOR SELECT USING (bucket_id = ''avatars'')';

    EXECUTE 'DROP POLICY IF EXISTS "Authenticated User Avatar Upload" ON storage.objects';
    EXECUTE 'CREATE POLICY "Authenticated User Avatar Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''avatars'' AND auth.uid() IS NOT NULL)';

    EXECUTE 'DROP POLICY IF EXISTS "Public Access to Banners" ON storage.objects';
    EXECUTE 'CREATE POLICY "Public Access to Banners" ON storage.objects FOR SELECT USING (bucket_id = ''banners'')';

    EXECUTE 'DROP POLICY IF EXISTS "Authenticated User Banner Upload" ON storage.objects';
    EXECUTE 'CREATE POLICY "Authenticated User Banner Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''banners'' AND auth.uid() IS NOT NULL)';
  END IF;
END $$;



ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_profiles_country_code
  ON public.profiles (country_code) WHERE country_code <> '';


CREATE OR REPLACE FUNCTION public.complete_onboarding(
  p_timezone TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.user_accounts SET
    profile_completed  = true,
    timezone           = COALESCE(NULLIF(p_timezone, ''), timezone),
    preferred_language = COALESCE(NULLIF(p_language, ''), preferred_language),
    updated_at         = now()
  WHERE id = v_uid;

  IF FOUND THEN
    RETURN true;
  END IF;

 SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_accounts (
    id, email, provider, email_verified, password_created,
    profile_completed, timezone, preferred_language
  )
  SELECT
    u.id,
    u.email,
    CASE
      WHEN EXISTS (SELECT 1 FROM auth.identities i
                    WHERE i.user_id = u.id AND i.provider = 'google')
       AND NOT EXISTS (SELECT 1 FROM auth.identities i
                    WHERE i.user_id = u.id AND i.provider = 'email')
      THEN 'google' ELSE 'email'
    END,
    u.email_confirmed_at IS NOT NULL,
    u.encrypted_password IS NOT NULL AND u.encrypted_password <> '',
    true,
    NULLIF(p_timezone, ''),
    NULLIF(p_language, '')
  FROM auth.users u
  WHERE u.id = v_uid
  ON CONFLICT (id) DO UPDATE SET
    profile_completed  = true,
    timezone           = COALESCE(EXCLUDED.timezone, user_accounts.timezone),
    preferred_language = COALESCE(EXCLUDED.preferred_language, user_accounts.preferred_language),
    updated_at         = now();

  RETURN true;
END; $fn$;

REVOKE ALL ON FUNCTION public.complete_onboarding(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(TEXT, TEXT) TO authenticated, service_role;

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'country_code'
  ) THEN 'ok' ELSE 'MISSING' END                          AS profiles_country_code,
  CASE WHEN to_regproc('public.complete_onboarding') IS NOT NULL
       THEN 'ok' ELSE 'MISSING' END                       AS complete_onboarding;
