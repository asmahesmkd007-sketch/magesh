
  SELECT username INTO v_wname FROM public.profiles WHERE id = v_winner;
  SELECT username INTO v_lname FROM public.profiles WHERE id = v_loser;

  PERFORM public._tournament_log(
    v_t.id, 'match_finished',
    COALESCE(v_wname, 'Winner')
      || CASE WHEN v_is_draw THEN ' advances on tiebreak vs ' ELSE ' defeats ' END
      || COALESCE(v_lname, 'opponent')
      || ' (' || COALESCE(NEW.end_reason, 'finished') || ')',
    v_winner,
    jsonb_build_object(
      'round', v_match.round, 'winner', v_wname, 'loser', v_lname,
      'reason', NEW.end_reason, 'moves', NEW.moves_count,
      'draw', v_is_draw, 'game_id', NEW.id,
      'winner_id', v_winner, 'loser_id', v_loser));

  INSERT INTO public.notifications (user_id, kind, title, body, link) VALUES
    (v_winner, 'tournament_result', 'You advanced!',
     'You won your Round ' || v_match.round || ' match in ' || v_t.name || '.',
     '/tournament/' || v_t.id::text),
    (v_loser, 'tournament_result', 'Eliminated',
     'You were knocked out in Round ' || v_match.round || ' of ' || v_t.name || '.',
     '/tournament/' || v_t.id::text);

  SELECT count(*) FILTER (WHERE status IN ('pending', 'active')), count(*)
  INTO v_pending, v_in_round
  FROM public.tournament_matches
  WHERE tournament_id = v_t.id AND round = v_t.current_round;

  IF v_pending = 0 THEN
    IF v_in_round = 1 THEN
      -- The final: no intermission, crown the champion right away.
      PERFORM public._tournament_log(
        v_t.id, 'round_finished', 'Round ' || v_t.current_round || ' complete',
        NULL, jsonb_build_object('round', v_t.current_round, 'final', true));
      PERFORM public._tournament_complete(v_t.id);
    ELSE
-- Round-by-round rule: stamp the intermission instead of pairing now
      v_next_at := now() + interval '10 seconds';
      UPDATE public.tournaments SET next_round_at = v_next_at WHERE id = v_t.id;
      PERFORM public._tournament_log(
        v_t.id, 'round_finished',
        'Round ' || v_t.current_round || ' complete — next round starts in 10 seconds',
        NULL, jsonb_build_object('round', v_t.current_round, 'next_round_at', v_next_at));
    END IF;
  END IF;

  RETURN NEW;
END; $$;

-- 76.7 advance_pending_rounds — fires the pairing once the 10s are up
-- Idempotent and race-safe: SKIP LOCKED + the next_round_at <= now() guard mean...
CREATE OR REPLACE FUNCTION public.advance_pending_rounds()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tourn RECORD;
BEGIN
  FOR v_tourn IN
    SELECT id FROM public.tournaments
    WHERE status = 'live' AND next_round_at IS NOT NULL AND next_round_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.tournaments SET next_round_at = NULL WHERE id = v_tourn.id;
    PERFORM public._tournament_start_round(v_tourn.id);
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.advance_pending_rounds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_pending_rounds() TO authenticated, service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('advance_pending_rounds');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.schedule('advance_pending_rounds', '* * * * *', 'SELECT public.advance_pending_rounds();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — schedule advance_pending_rounds manually';
END $$;

-- 76.8 _tournament_start_round v4 — clears the intermission stamp
-- Identical to 76.1 (random re-pairing every round) plus next_round_at is reset...
CREATE OR REPLACE FUNCTION public._tournament_start_round(p_tournament_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t       public.tournaments%ROWTYPE;
  v_round   INT;
  v_players UUID[];
  v_n       INT;
  v_slot    INT := 0;
  v_i       INT := 1;
  v_p1      UUID;
  v_p2      UUID;
  v_game    UUID;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND OR v_t.status <> 'live' THEN RETURN; END IF;

  v_round := COALESCE(v_t.current_round, 0) + 1;

  IF v_round = 1 THEN
    SELECT array_agg(user_id ORDER BY random()) INTO v_players
    FROM public.tournament_entries
    WHERE tournament_id = p_tournament_id AND status = 'active';
  ELSE
-- Fresh random pairings every round: shuffle the survivors instead of walking t...
    SELECT array_agg(winner_id ORDER BY random()) INTO v_players
    FROM public.tournament_matches
    WHERE tournament_id = p_tournament_id
      AND round = v_t.current_round
      AND winner_id IS NOT NULL;
  END IF;

  v_n := COALESCE(array_length(v_players, 1), 0);
  IF v_n < 2 THEN RETURN; END IF;

  WHILE v_i <= v_n LOOP
    v_slot := v_slot + 1;
    v_p1 := v_players[v_i];
    v_p2 := CASE WHEN v_i + 1 <= v_n THEN v_players[v_i + 1] ELSE NULL END;

    IF v_p2 IS NULL THEN
      INSERT INTO public.tournament_matches
        (tournament_id, round, slot, player1_id, player2_id, winner_id, status)
      VALUES (p_tournament_id, v_round, v_slot, v_p1, NULL, v_p1, 'bye');
      PERFORM public._tournament_log(
        p_tournament_id, 'bye',
        COALESCE((SELECT username FROM public.profiles WHERE id = v_p1), 'A player') || ' advances on a bye',
        v_p1, jsonb_build_object('round', v_round));
    ELSE
      v_game := public._tournament_create_game(v_t, v_p1, v_p2);
      INSERT INTO public.tournament_matches
        (tournament_id, round, slot, player1_id, player2_id, game_id, status)
      VALUES (p_tournament_id, v_round, v_slot, v_p1, v_p2, v_game, 'active');

      INSERT INTO public.notifications (user_id, kind, title, body, link)
      SELECT u, 'tournament_round',
             'Round ' || v_round || ' — your match is live',
             'Your ' || v_t.name || ' match has started. Good luck!',
             '/game/' || v_game::text
      FROM unnest(ARRAY[v_p1, v_p2]) AS u;
    END IF;

    v_i := v_i + 2;
  END LOOP;

  UPDATE public.tournaments SET
    current_round    = v_round,
    round_started_at = now(),
    next_round_at    = NULL,
    total_rounds     = CASE WHEN v_round = 1
                            THEN GREATEST(1, CEIL(LOG(2, GREATEST(v_n, 2)::NUMERIC))::INT)
                            ELSE total_rounds END
  WHERE id = p_tournament_id;

  PERFORM public._tournament_log(
    p_tournament_id, 'round_started',
    'Round ' || v_round || ' started — ' || v_slot || ' pairing' || CASE WHEN v_slot = 1 THEN '' ELSE 's' END,
    NULL, jsonb_build_object('round', v_round, 'matches', v_slot));
END; $$;
REVOKE ALL ON FUNCTION public._tournament_start_round(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._tournament_start_round(UUID) TO service_role;






-- Section 77: SEASON IQ ENGINE — PUBG-STYLE MONTHLY SEASONS (2026-07-20)
-- Compute seasonal SP rung and division

-- 77.1 Columns + ledger table
ALTER TABLE public.season_rankings
  ADD COLUMN IF NOT EXISTS season_iq        INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prev_rank        INT,
  ADD COLUMN IF NOT EXISTS games_played     INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wins             INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS losses           INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS draws            INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS puzzles_solved   INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cur_win_streak   INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_win_streak  INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_bonus_date DATE;

ALTER TABLE public.season_history
  ADD COLUMN IF NOT EXISTS season_iq       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS games_played    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wins            INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS losses          INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS draws           INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_win_streak INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier            TEXT;

-- Permanent career records — written only when a season is finalized, and only ...
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS career_highest_iq        INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS career_highest_iq_season INT,
  ADD COLUMN IF NOT EXISTS career_best_rank         INT,
  ADD COLUMN IF NOT EXISTS career_best_rank_season  INT,
  ADD COLUMN IF NOT EXISTS season_badges            JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Every point ever earned, one row per award
CREATE TABLE IF NOT EXISTS public.season_iq_events (
  id         BIGSERIAL PRIMARY KEY,
  season_id  UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  ref        TEXT NOT NULL,
  points     INT  NOT NULL,
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS idx_season_iq_events_user
  ON public.season_iq_events(season_id, user_id, created_at DESC);
GRANT SELECT ON public.season_iq_events TO authenticated;
GRANT ALL ON public.season_iq_events TO service_role;
ALTER TABLE public.season_iq_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Season IQ events own read" ON public.season_iq_events;
CREATE POLICY "Season IQ events own read"
  ON public.season_iq_events FOR SELECT USING (auth.uid() = user_id);
-- Writes only via the SECURITY DEFINER award function below.

-- 77.2 Tier ladder
CREATE OR REPLACE FUNCTION public.season_tier(p_iq INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_iq >= 8000 THEN 'Chessox Legend'
    WHEN p_iq >= 5500 THEN 'Elite'
    WHEN p_iq >= 3500 THEN 'Grandmaster'
    WHEN p_iq >= 2000 THEN 'Master'
    WHEN p_iq >= 1000 THEN 'Expert'
    WHEN p_iq >=  500 THEN 'Skilled'
    WHEN p_iq >=  200 THEN 'Learner'
    ELSE 'Beginner'
  END;
$$;
GRANT EXECUTE ON FUNCTION public.season_tier(INT) TO anon, authenticated, service_role;

-- 77.3 The award primitive
-- Books points into the CURRENT LIVE season only
CREATE OR REPLACE FUNCTION public._season_award_iq(
  p_user   UUID,
  p_kind   TEXT,
  p_points INT,
  p_ref    TEXT,
  p_meta   JSONB DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season UUID;
BEGIN
  IF p_user IS NULL OR COALESCE(p_points, 0) = 0 THEN RETURN; END IF;

  SELECT id INTO v_season FROM public.seasons
  WHERE status = 'live' ORDER BY season_number DESC LIMIT 1;
  IF v_season IS NULL THEN RETURN; END IF;

  INSERT INTO public.season_rankings (season_id, user_id)
  VALUES (v_season, p_user)
  ON CONFLICT (season_id, user_id) DO NOTHING;

  INSERT INTO public.season_iq_events (season_id, user_id, kind, ref, points, meta)
  VALUES (v_season, p_user, p_kind, COALESCE(p_ref, 'x'), p_points, COALESCE(p_meta, '{}'::jsonb))
  ON CONFLICT (season_id, user_id, kind, ref) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;  -- already awarded

  UPDATE public.season_rankings SET
    season_iq  = GREATEST(0, season_iq + p_points),
    iq_level   = GREATEST(0, season_iq + p_points),  -- legacy mirror
    updated_at = now()
  WHERE season_id = v_season AND user_id = p_user;
END; $$;
REVOKE ALL ON FUNCTION public._season_award_iq(UUID, TEXT, INT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._season_award_iq(UUID, TEXT, INT, TEXT, JSONB) TO service_role;

-- 77.4 Earning: finished games
-- Anti-farming and fair play checks
CREATE OR REPLACE FUNCTION public.handle_season_game_finished()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season   UUID;
  v_winner   UUID;
  v_loser    UUID;
  v_w_rating INT;
  v_l_rating INT;
  v_pts      INT;
  v_streak   INT;
  v_u        UUID;
BEGIN
  IF NEW.white_id IS NULL OR NEW.black_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.result NOT IN ('white', 'black', 'draw') THEN RETURN NEW; END IF;
  IF COALESCE(NEW.moves_count, 0) < 2 THEN RETURN NEW; END IF;
  IF COALESCE(NEW.end_reason, '') IN ('aborted', 'no_show', 'tournament_cancelled') THEN RETURN NEW; END IF;

  SELECT id INTO v_season FROM public.seasons
  WHERE status = 'live' ORDER BY season_number DESC LIMIT 1;
  IF v_season IS NULL THEN RETURN NEW; END IF;

  -- Ensure both ranking rows exist, then book the per-game stats.
  INSERT INTO public.season_rankings (season_id, user_id)
  SELECT v_season, u FROM unnest(ARRAY[NEW.white_id, NEW.black_id]) AS u
  ON CONFLICT (season_id, user_id) DO NOTHING;

  IF NEW.result = 'draw' THEN
    UPDATE public.season_rankings SET
      games_played = games_played + 1,
      draws        = draws + 1,
      cur_win_streak = 0,
      updated_at   = now()
    WHERE season_id = v_season AND user_id IN (NEW.white_id, NEW.black_id);
    PERFORM public._season_award_iq(NEW.white_id, 'game_draw', 5, NEW.id::text);
    PERFORM public._season_award_iq(NEW.black_id, 'game_draw', 5, NEW.id::text);
  ELSE
    v_winner   := CASE WHEN NEW.result = 'white' THEN NEW.white_id ELSE NEW.black_id END;
    v_loser    := CASE WHEN NEW.result = 'white' THEN NEW.black_id ELSE NEW.white_id END;
    v_w_rating := CASE WHEN NEW.result = 'white' THEN NEW.white_rating ELSE NEW.black_rating END;
    v_l_rating := CASE WHEN NEW.result = 'white' THEN NEW.black_rating ELSE NEW.white_rating END;

    UPDATE public.season_rankings SET
      games_played    = games_played + 1,
      wins            = wins + 1,
      cur_win_streak  = cur_win_streak + 1,
      best_win_streak = GREATEST(best_win_streak, cur_win_streak + 1),
      updated_at      = now()
    WHERE season_id = v_season AND user_id = v_winner
    RETURNING cur_win_streak INTO v_streak;

    UPDATE public.season_rankings SET
      games_played   = games_played + 1,
      losses         = losses + 1,
      cur_win_streak = 0,
      updated_at     = now()
    WHERE season_id = v_season AND user_id = v_loser;

    v_pts := 20;
    IF COALESCE(v_l_rating, 0) > COALESCE(v_w_rating, 0) + 50 THEN
      v_pts := v_pts + LEAST(40, (v_l_rating - v_w_rating) / 10);  -- upset bonus
    END IF;
    IF NEW.end_reason = 'checkmate' THEN v_pts := v_pts + 5; END IF;
    IF COALESCE(v_streak, 0) >= 3 THEN v_pts := v_pts + 5; END IF;  -- streak bonus

    PERFORM public._season_award_iq(
      v_winner, 'game_win', v_pts, NEW.id::text,
      jsonb_build_object('streak', v_streak, 'reason', NEW.end_reason));
    PERFORM public._season_award_iq(v_loser, 'game_loss', 2, NEW.id::text);
  END IF;

  -- Daily-activity bonus: first finished game of the UTC day.
  FOR v_u IN SELECT unnest(ARRAY[NEW.white_id, NEW.black_id]) LOOP
    UPDATE public.season_rankings
    SET daily_bonus_date = current_date
    WHERE season_id = v_season AND user_id = v_u
      AND (daily_bonus_date IS NULL OR daily_bonus_date < current_date);
    IF FOUND THEN
      PERFORM public._season_award_iq(v_u, 'daily', 10, current_date::text);
    END IF;
  END LOOP;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_season_game_finished ON public.games;
CREATE TRIGGER trg_season_game_finished
  AFTER UPDATE ON public.games
  FOR EACH ROW
  WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_season_game_finished();

-- 77.5 Earning: puzzles
-- +3 per puzzle solved (+3 extra for 1800+ rated puzzles)
CREATE OR REPLACE FUNCTION public.handle_season_puzzle_attempt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season UUID;
BEGIN
  IF NOT NEW.solved THEN RETURN NEW; END IF;

  SELECT id INTO v_season FROM public.seasons
  WHERE status = 'live' ORDER BY season_number DESC LIMIT 1;
  IF v_season IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.season_rankings (season_id, user_id)
  VALUES (v_season, NEW.user_id)
  ON CONFLICT (season_id, user_id) DO NOTHING;

  -- Count the solve only when it is this season's first for that puzzle.
  IF NOT EXISTS (
    SELECT 1 FROM public.season_iq_events
    WHERE season_id = v_season AND user_id = NEW.user_id
      AND kind = 'puzzle' AND ref = NEW.puzzle_id
  ) THEN
    UPDATE public.season_rankings
    SET puzzles_solved = puzzles_solved + 1, updated_at = now()
    WHERE season_id = v_season AND user_id = NEW.user_id;
  END IF;

  PERFORM public._season_award_iq(
    NEW.user_id, 'puzzle',
    3 + CASE WHEN COALESCE(NEW.puzzle_rating, 0) >= 1800 THEN 3 ELSE 0 END,
    NEW.puzzle_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_season_puzzle_attempt ON public.puzzle_attempts;
CREATE TRIGGER trg_season_puzzle_attempt
  AFTER INSERT ON public.puzzle_attempts
  FOR EACH ROW EXECUTE FUNCTION public.handle_season_puzzle_attempt();

-- 77.6 Earning: analysis accuracy
-- A completed engine analysis with 90%+ accuracy pays +10 to that side.
CREATE OR REPLACE FUNCTION public.handle_season_analysis_done()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_g RECORD;
BEGIN
  IF NEW.analysis_status <> 'done' THEN RETURN NEW; END IF;

  SELECT white_id, black_id INTO v_g FROM public.games WHERE id = NEW.game_id;
  IF v_g.white_id IS NULL OR v_g.black_id IS NULL THEN RETURN NEW; END IF;

  IF COALESCE(NEW.accuracy_white, 0) >= 90 THEN
    PERFORM public._season_award_iq(
      v_g.white_id, 'accuracy', 10, NEW.game_id::text || ':w',
      jsonb_build_object('accuracy', NEW.accuracy_white));
  END IF;
  IF COALESCE(NEW.accuracy_black, 0) >= 90 THEN
    PERFORM public._season_award_iq(
      v_g.black_id, 'accuracy', 10, NEW.game_id::text || ':b',
      jsonb_build_object('accuracy', NEW.accuracy_black));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_season_analysis_done ON public.game_analysis;
CREATE TRIGGER trg_season_analysis_done
  AFTER INSERT OR UPDATE ON public.game_analysis
  FOR EACH ROW EXECUTE FUNCTION public.handle_season_analysis_done();

-- 77.7 Earning: tournament podium
-- Champion +250, runner-up +150, third +100 when a tournament completes (the in...
CREATE OR REPLACE FUNCTION public.handle_season_tournament_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_e RECORD;
BEGIN
  FOR v_e IN
    SELECT user_id, rank FROM public.tournament_entries
    WHERE tournament_id = NEW.id AND rank BETWEEN 1 AND 3
  LOOP
    PERFORM public._season_award_iq(
      v_e.user_id,
      CASE v_e.rank WHEN 1 THEN 'tournament_champion'
                    WHEN 2 THEN 'tournament_runner_up'
                    ELSE 'tournament_third' END,
      CASE v_e.rank WHEN 1 THEN 250 WHEN 2 THEN 150 ELSE 100 END,
      NEW.id::text);
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_season_tournament_completed ON public.tournaments;
CREATE TRIGGER trg_season_tournament_completed
  AFTER UPDATE OF status ON public.tournaments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed')
  EXECUTE FUNCTION public.handle_season_tournament_completed();

-- 77.8 Rank recompute v2 — season_iq only, participants only
-- Replaces the v1 body that ranked EVERY profile by lifetime iq_level
CREATE OR REPLACE FUNCTION public._season_recompute_rankings(p_season_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH ranked AS (
    SELECT user_id,
           ROW_NUMBER() OVER (
             ORDER BY season_iq DESC, wins DESC, games_played ASC, user_id ASC
           ) AS rnk
    FROM public.season_rankings
    WHERE season_id = p_season_id
  )
  UPDATE public.season_rankings sr SET
    prev_rank  = sr.rank,
    rank       = ranked.rnk,
    updated_at = now()
  FROM ranked
  WHERE sr.season_id = p_season_id AND sr.user_id = ranked.user_id;
END; $$;
REVOKE ALL ON FUNCTION public._season_recompute_rankings(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._season_recompute_rankings(UUID) TO service_role;

-- 77.9 season_leaderboard v2 — live ranks, tiers, trend, win rate
DROP FUNCTION IF EXISTS public.season_leaderboard(UUID, TEXT, TEXT, TEXT, TEXT, INT, INT);
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
  rank               BIGINT,
  prev_rank          INT,
  user_id            UUID,
  season_iq          INT,
  tier               TEXT,
  games_played       INT,
  wins               INT,
  losses             INT,
  draws              INT,
  win_rate           INT,
  puzzles_solved     INT,
  best_win_streak    INT,
  iq_level           INT,
  rating_points      INT,
  country            TEXT,
  state              TEXT,
  district           TEXT,
  rewards            TEXT[],
  username           TEXT,
  full_name          TEXT,
  avatar_url         TEXT,
  premium_active     BOOLEAN,
  premium_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH scoped AS (
    SELECT sr.*, p.country AS p_country2, p.state AS p_state2, p.district AS p_district2,
           p.username AS p_username, COALESCE(p.display_name, p.full_name, p.username) AS p_name,
           p.avatar_url AS p_avatar, p.premium_active AS p_prem, p.premium_expires_at AS p_prem_at
    FROM public.season_rankings sr
    JOIN public.profiles p ON p.id = sr.user_id
    WHERE sr.season_id = p_season_id
      AND (p_country  IS NULL OR p.country  = p_country)
      AND (p_state    IS NULL OR p.state    = p_state)
      AND (p_district IS NULL OR p.district = p_district)
  ),
  ranked AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
             ORDER BY s.season_iq DESC, s.wins DESC, s.games_played ASC, s.user_id ASC
           ) AS live_rank
    FROM scoped s
  )
  SELECT
    r.live_rank,
    r.prev_rank,
    r.user_id,
    r.season_iq,
    public.season_tier(r.season_iq),
    r.games_played,
    r.wins,
    r.losses,
    r.draws,
    CASE WHEN r.games_played > 0 THEN ROUND(r.wins * 100.0 / r.games_played)::INT ELSE 0 END,
    r.puzzles_solved,
    r.best_win_streak,
    r.iq_level,
    r.rating_points,
    r.p_country2,
    r.p_state2,
    r.p_district2,
    r.rewards,
    r.p_username,
    r.p_name,
    r.p_avatar,
    r.p_prem,
    r.p_prem_at
  FROM ranked r
  WHERE (p_search IS NULL OR p_search = ''
         OR r.p_username ILIKE '%' || p_search || '%'
         OR r.p_name ILIKE '%' || p_search || '%')
  ORDER BY r.live_rank ASC
  LIMIT p_limit OFFSET p_offset;
END; $$;
REVOKE EXECUTE ON FUNCTION public.season_leaderboard(UUID, TEXT, TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.season_leaderboard(UUID, TEXT, TEXT, TEXT, TEXT, INT, INT) TO anon, authenticated, service_role;

-- 77.10 Finalize: freeze, award, record careers, keep history forever
CREATE OR REPLACE FUNCTION public._season_finalize(p_season_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_num    INT;
  v_count  INT;
  v_uid    UUID;
BEGIN
  SELECT season_number INTO v_num FROM public.seasons WHERE id = p_season_id;

  PERFORM public._season_recompute_rankings(p_season_id);

  -- Rank-based reward tags.
  UPDATE public.season_rankings
  SET rewards = CASE
    WHEN rank = 1 THEN ARRAY['season_champion', 'champion_badge', 'top_1']
    WHEN rank <= 3 THEN ARRAY['podium_badge', 'top_3']
    WHEN rank <= 10 THEN ARRAY['top_10']
    WHEN rank <= 100 THEN ARRAY['top_100']
    ELSE '{}'::text[]
  END
  WHERE season_id = p_season_id;

-- Special achievements (each goes to a single best-qualifying player, except re...
  SELECT sr.user_id INTO v_uid
  FROM public.season_rankings sr
  LEFT JOIN LATERAL (
    SELECT MAX(sh.season_iq) AS prev_best FROM public.season_history sh
    WHERE sh.user_id = sr.user_id
  ) h ON true
  WHERE sr.season_id = p_season_id AND h.prev_best IS NOT NULL AND sr.season_iq > h.prev_best
  ORDER BY sr.season_iq - h.prev_best DESC, sr.rank ASC LIMIT 1;
  IF v_uid IS NOT NULL THEN
    UPDATE public.season_rankings SET rewards = rewards || ARRAY['most_improved']
    WHERE season_id = p_season_id AND user_id = v_uid;
  END IF;

  SELECT user_id INTO v_uid FROM public.season_rankings
  WHERE season_id = p_season_id AND puzzles_solved > 0
  ORDER BY puzzles_solved DESC, rank ASC LIMIT 1;
  IF v_uid IS NOT NULL THEN
    UPDATE public.season_rankings SET rewards = rewards || ARRAY['puzzle_master']
    WHERE season_id = p_season_id AND user_id = v_uid;
  END IF;

  SELECT user_id INTO v_uid FROM public.season_rankings
  WHERE season_id = p_season_id AND best_win_streak >= 3
  ORDER BY best_win_streak DESC, rank ASC LIMIT 1;
  IF v_uid IS NOT NULL THEN
    UPDATE public.season_rankings SET rewards = rewards || ARRAY['highest_win_streak']
    WHERE season_id = p_season_id AND user_id = v_uid;
  END IF;

  SELECT sr.user_id INTO v_uid FROM public.season_rankings sr
  WHERE sr.season_id = p_season_id AND sr.season_iq > 0
    AND NOT EXISTS (SELECT 1 FROM public.season_history sh WHERE sh.user_id = sr.user_id)
  ORDER BY sr.season_iq DESC, sr.rank ASC LIMIT 1;
  IF v_uid IS NOT NULL THEN
    UPDATE public.season_rankings SET rewards = rewards || ARRAY['best_new_player']
    WHERE season_id = p_season_id AND user_id = v_uid;
  END IF;

  -- Regional champion: the top-ranked player of each country.
  UPDATE public.season_rankings sr
  SET rewards = sr.rewards || ARRAY['regional_champion']
  FROM (
    SELECT DISTINCT ON (p.country) sr2.user_id
    FROM public.season_rankings sr2
    JOIN public.profiles p ON p.id = sr2.user_id
    WHERE sr2.season_id = p_season_id AND p.country IS NOT NULL AND sr2.season_iq > 0
    ORDER BY p.country, sr2.rank ASC
  ) rc
  WHERE sr.season_id = p_season_id AND sr.user_id = rc.user_id;

  -- Freeze into permanent history (with the new season columns + tier).
  INSERT INTO public.season_history
    (season_id, user_id, final_rank, iq_level, rating_points, rewards, ended_at,
     season_iq, games_played, wins, losses, draws, best_win_streak, tier)
  SELECT season_id, user_id, rank, iq_level, rating_points, rewards, now(),
         season_iq, games_played, wins, losses, draws, best_win_streak,
         public.season_tier(season_iq)
  FROM public.season_rankings
  WHERE season_id = p_season_id AND rank IS NOT NULL
  ON CONFLICT (season_id, user_id) DO UPDATE SET
    final_rank = EXCLUDED.final_rank,
    iq_level = EXCLUDED.iq_level,
    rating_points = EXCLUDED.rating_points,
    rewards = EXCLUDED.rewards,
    season_iq = EXCLUDED.season_iq,
    games_played = EXCLUDED.games_played,
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    draws = EXCLUDED.draws,
    best_win_streak = EXCLUDED.best_win_streak,
    tier = EXCLUDED.tier,
    ended_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Permanent career records: only ever improved, never reset.
  UPDATE public.profiles p SET
    career_highest_iq        = sr.season_iq,
    career_highest_iq_season = v_num
  FROM public.season_rankings sr
  WHERE sr.season_id = p_season_id AND p.id = sr.user_id
    AND sr.season_iq > p.career_highest_iq;

  UPDATE public.profiles p SET
    career_best_rank        = sr.rank,
    career_best_rank_season = v_num
  FROM public.season_rankings sr
  WHERE sr.season_id = p_season_id AND p.id = sr.user_id AND sr.rank IS NOT NULL
    AND sr.season_iq > 0
    AND (p.career_best_rank IS NULL OR sr.rank < p.career_best_rank);

  -- Permanent badge wallet on the profile.
  UPDATE public.profiles p
  SET season_badges = p.season_badges || b.badges
  FROM (
    SELECT user_id,
           jsonb_agg(jsonb_build_object('season', v_num, 'code', code)) AS badges
    FROM (
      SELECT user_id, unnest(rewards) AS code
      FROM public.season_rankings
      WHERE season_id = p_season_id AND rewards <> '{}'::text[]
    ) x
    GROUP BY user_id
  ) b
  WHERE p.id = b.user_id;

  UPDATE public.seasons SET status = 'ended', updated_at = now() WHERE id = p_season_id;

  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public._season_finalize(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._season_finalize(UUID) TO service_role;

-- admin_end_season v2: same contract, now built on _season_finalize.
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

  v_ranked_players := public._season_finalize(p_season_id);

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

-- 77.11 Monthly automation: season_rollover()
-- One idempotent tick, safe from any caller: 1
CREATE OR REPLACE FUNCTION public.season_rollover()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_live   public.seasons%ROWTYPE;
  v_next   UUID;
  v_number INT;
  v_start  TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('season_rollover'));

  IF NOT EXISTS (SELECT 1 FROM public.seasons) THEN
    INSERT INTO public.seasons (season_number, name, start_date, end_date, status)
    VALUES (1, 'Season 1', date_trunc('month', now()),
            date_trunc('month', now()) + interval '1 month', 'live');
    RETURN;
  END IF;

  SELECT * INTO v_live FROM public.seasons
  WHERE status IN ('live', 'paused') ORDER BY season_number DESC LIMIT 1;

  IF v_live.id IS NOT NULL AND v_live.end_date <= now() THEN
    PERFORM public._season_finalize(v_live.id);

-- Prefer a pre-created upcoming season; otherwise mint the next one-month seaso...
    SELECT id INTO v_next FROM public.seasons
    WHERE status = 'upcoming' ORDER BY season_number ASC LIMIT 1;

    IF v_next IS NULL THEN
      SELECT COALESCE(MAX(season_number), 0) + 1 INTO v_number FROM public.seasons;
      v_start := GREATEST(v_live.end_date, date_trunc('month', now()));
      INSERT INTO public.seasons (season_number, name, start_date, end_date, status)
      VALUES (v_number, 'Season ' || v_number, v_start, v_start + interval '1 month', 'live');
    ELSE
      UPDATE public.seasons SET status = 'live', updated_at = now() WHERE id = v_next;
    END IF;
    RETURN;
  END IF;

  -- Nothing live: start an upcoming season whose time has come.
  IF v_live.id IS NULL THEN
    SELECT id INTO v_next FROM public.seasons
    WHERE status = 'upcoming' AND start_date <= now()
    ORDER BY season_number ASC LIMIT 1;
    IF v_next IS NOT NULL THEN
      UPDATE public.seasons SET status = 'live', updated_at = now() WHERE id = v_next;
    END IF;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.season_rollover() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.season_rollover() TO authenticated, service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('season_rollover');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.schedule('season_rollover', '*/10 * * * *', 'SELECT public.season_rollover();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — schedule season_rollover manually';
END $$;

-- Keep the live season's stored ranks (and trend arrows) fresh.
DO $$
BEGIN
  PERFORM cron.unschedule('season_rank_refresh');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.schedule('season_rank_refresh', '*/5 * * * *',
    $sql$SELECT public._season_recompute_rankings(id) FROM public.seasons WHERE status = 'live';$sql$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — schedule season_rank_refresh manually';
END $$;

-- 77.12 season_history_for_user v2 — career block + current season card
DROP FUNCTION IF EXISTS public.season_history_for_user(UUID);
CREATE OR REPLACE FUNCTION public.season_history_for_user(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result JSON;
  v_current_season_id UUID;
  v_current RECORD;
BEGIN
  SELECT id INTO v_current_season_id FROM public.seasons
    WHERE status IN ('live', 'paused') ORDER BY season_number DESC LIMIT 1;

  IF v_current_season_id IS NOT NULL THEN
    SELECT sr.rank, sr.season_iq, sr.games_played, sr.wins, sr.losses, sr.draws,
           sr.puzzles_solved, sr.best_win_streak
    INTO v_current
    FROM public.season_rankings sr
    WHERE sr.season_id = v_current_season_id AND sr.user_id = p_user_id;
  END IF;

  SELECT json_build_object(
    'seasons', COALESCE((
      SELECT json_agg(json_build_object(
        'season_id', sh.season_id,
        'season_number', s.season_number,
        'season_name', s.name,
        'final_rank', sh.final_rank,
        'iq_level', sh.iq_level,
        'season_iq', sh.season_iq,
        'tier', COALESCE(sh.tier, public.season_tier(sh.season_iq)),
        'games_played', sh.games_played,
        'wins', sh.wins,
        'losses', sh.losses,
        'draws', sh.draws,
        'best_win_streak', sh.best_win_streak,
        'rating_points', sh.rating_points,
        'rewards', sh.rewards,
        'ended_at', sh.ended_at
      ) ORDER BY s.season_number DESC)
      FROM public.season_history sh
      JOIN public.seasons s ON s.id = sh.season_id
      WHERE sh.user_id = p_user_id
    ), '[]'::json),
    'current_season_rank', v_current.rank,
    'current_season_iq', COALESCE(v_current.season_iq, 0),
    'current_tier', public.season_tier(COALESCE(v_current.season_iq, 0)),
    'current_games_played', COALESCE(v_current.games_played, 0),
    'current_wins', COALESCE(v_current.wins, 0),
    'current_losses', COALESCE(v_current.losses, 0),
    'current_draws', COALESCE(v_current.draws, 0),
    'current_puzzles_solved', COALESCE(v_current.puzzles_solved, 0),
    'current_best_win_streak', COALESCE(v_current.best_win_streak, 0),
    'seasons_played', (SELECT COUNT(*) FROM public.season_history WHERE user_id = p_user_id),
    'seasons_won', (SELECT COUNT(*) FROM public.season_history WHERE user_id = p_user_id AND final_rank = 1),
    'top_10_finishes', (SELECT COUNT(*) FROM public.season_history WHERE user_id = p_user_id AND final_rank <= 10),
    'top_100_finishes', (SELECT COUNT(*) FROM public.season_history WHERE user_id = p_user_id AND final_rank <= 100),
    'best_rank_ever', (SELECT MIN(final_rank) FROM public.season_history WHERE user_id = p_user_id AND season_iq > 0),
    'best_iq_level', COALESCE((SELECT MAX(iq_level) FROM public.season_history WHERE user_id = p_user_id), 0),
    'best_rating', COALESCE((SELECT MAX(rating_points) FROM public.season_history WHERE user_id = p_user_id), 0),
    'career_highest_iq', COALESCE((SELECT career_highest_iq FROM public.profiles WHERE id = p_user_id), 0),
    'career_highest_iq_season', (SELECT career_highest_iq_season FROM public.profiles WHERE id = p_user_id),
    'career_best_rank', (SELECT career_best_rank FROM public.profiles WHERE id = p_user_id),
    'career_best_rank_season', (SELECT career_best_rank_season FROM public.profiles WHERE id = p_user_id),
    'best_season_number', (
      SELECT s.season_number FROM public.season_history sh
      JOIN public.seasons s ON s.id = sh.season_id
      WHERE sh.user_id = p_user_id
      ORDER BY sh.season_iq DESC, sh.final_rank ASC LIMIT 1
    ),
    'season_badges', COALESCE((SELECT season_badges FROM public.profiles WHERE id = p_user_id), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END; $$;
REVOKE EXECUTE ON FUNCTION public.season_history_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.season_history_for_user(UUID) TO anon, authenticated, service_role;

-- 77.13 career_summaries — batch career info for search results
CREATE OR REPLACE FUNCTION public.career_summaries(p_user_ids UUID[])
RETURNS TABLE (
  user_id                  UUID,
  career_highest_iq        INT,
  career_highest_iq_season INT,
  career_best_rank         INT,
  career_best_rank_season  INT,
  best_season_number       INT,
  current_season_iq        INT,
  current_tier             TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current_season_id UUID;
BEGIN
  SELECT id INTO v_current_season_id FROM public.seasons
  WHERE status IN ('live', 'paused') ORDER BY season_number DESC LIMIT 1;

  RETURN QUERY
  SELECT
    p.id,
    p.career_highest_iq,
    p.career_highest_iq_season,
    p.career_best_rank,
    p.career_best_rank_season,
    (SELECT s.season_number FROM public.season_history sh
     JOIN public.seasons s ON s.id = sh.season_id
     WHERE sh.user_id = p.id
     ORDER BY sh.season_iq DESC, sh.final_rank ASC LIMIT 1),
    COALESCE(sr.season_iq, 0),
    public.season_tier(COALESCE(sr.season_iq, 0))
  FROM public.profiles p
  LEFT JOIN public.season_rankings sr
    ON sr.user_id = p.id AND sr.season_id = v_current_season_id
  WHERE p.id = ANY(p_user_ids);
END; $$;
REVOKE EXECUTE ON FUNCTION public.career_summaries(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.career_summaries(UUID[]) TO anon, authenticated, service_role;

-- Section 78: EMAIL OTP VERIFICATION (registration email verification, 2026-07-22)
-- Backs the "Verify" button on the signup form: a 6-digit OTP is generated serv...
CREATE TABLE IF NOT EXISTS public.email_otp_verifications (
  email        TEXT PRIMARY KEY,
  username     TEXT NOT NULL,
  otp_hash     TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otp_verifications_expires_at
  ON public.email_otp_verifications (expires_at);

ALTER TABLE public.email_otp_verifications ENABLE ROW LEVEL SECURITY;
-- No policies defined on purpose: RLS with zero policies denies anon and authen...

CREATE OR REPLACE FUNCTION public.is_email_registered(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_registered(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_registered(TEXT) TO service_role;


-- EMAIL OTP VERIFICATION (registration email verification)
-- Backs the "Verify" button on the signup form: a 6-digit OTP is generated serv...
-- Apply this against whichever Supabase project your app's SUPABASE_URL / SUPAB...

CREATE TABLE IF NOT EXISTS public.email_otp_verifications (
  email        TEXT PRIMARY KEY,
  username     TEXT NOT NULL,
  otp_hash     TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otp_verifications_expires_at
  ON public.email_otp_verifications (expires_at);

ALTER TABLE public.email_otp_verifications ENABLE ROW LEVEL SECURITY;
-- No policies defined on purpose: RLS with zero policies denies anon and authen...

-- Helper RPC: is a given email already a registered auth user? auth.users is no...
CREATE OR REPLACE FUNCTION public.is_email_registered(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_registered(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_registered(TEXT) TO service_role;

-- FRIENDS REDESIGN - challenges + cross-user notification RPCs
-- Apply this against whichever Supabase project your app's SUPABASE_URL / SUPAB...

CREATE TABLE IF NOT EXISTS public.game_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  to_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending',
  timer INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.game_challenges
  ADD COLUMN IF NOT EXISTS time_class        public.time_class NOT NULL DEFAULT 'blitz',
  ADD COLUMN IF NOT EXISTS time_control      TEXT NOT NULL DEFAULT '5+0',
  ADD COLUMN IF NOT EXISTS increment_seconds INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_rated          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS game_id           UUID REFERENCES public.games(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responded_at      TIMESTAMPTZ;

-- `status` on the live table is a nullable free-form TEXT (no CHECK constraint ...
ALTER TABLE public.game_challenges ALTER COLUMN status SET DEFAULT 'pending';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'game_challenges_status_check'
  ) THEN
    ALTER TABLE public.game_challenges
      ADD CONSTRAINT game_challenges_status_check
      CHECK (status IN ('pending','accepted','declined','cancelled','expired'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_game_challenges_from ON public.game_challenges(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_challenges_to ON public.game_challenges(to_user_id, created_at DESC);

GRANT SELECT ON public.game_challenges TO authenticated;
GRANT ALL ON public.game_challenges TO service_role;
ALTER TABLE public.game_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own challenges" ON public.game_challenges;
CREATE POLICY "Users view own challenges"
  ON public.game_challenges FOR SELECT
  USING (auth.uid() IN (from_user_id, to_user_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'game_challenges'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_challenges;
  END IF;
END $$;

-- RPC - send a challenge to another player, notifying them
CREATE OR REPLACE FUNCTION public.send_challenge(
  p_opponent_id       UUID,
  p_time_class        public.time_class,
  p_time_control      TEXT,
  p_initial_seconds   INT,
  p_increment_seconds INT,
  p_is_rated          BOOLEAN
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_challenge_id UUID;
  v_username     TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_opponent_id = v_uid THEN RAISE EXCEPTION 'Cannot challenge yourself'; END IF;
  IF p_initial_seconds < 10 OR p_initial_seconds > 86400 THEN RAISE EXCEPTION 'Invalid time control'; END IF;
  IF p_increment_seconds < 0 OR p_increment_seconds > 180 THEN RAISE EXCEPTION 'Invalid increment'; END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.game_challenges (
    from_user_id, to_user_id, timer, time_class, time_control,
    increment_seconds, is_rated, status
  ) VALUES (
    v_uid, p_opponent_id, p_initial_seconds, p_time_class, p_time_control,
    p_increment_seconds, p_is_rated, 'pending'
  ) RETURNING id INTO v_challenge_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (
    p_opponent_id, 'challenge', 'New challenge',
    coalesce(v_username, 'A friend') || ' challenged you to ' || p_time_control ||
      ' (' || (CASE WHEN p_is_rated THEN 'rated' ELSE 'casual' END) || ')',
    '/friends'
  );

  RETURN v_challenge_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.send_challenge(UUID, public.time_class, TEXT, INT, INT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_challenge(UUID, public.time_class, TEXT, INT, INT, BOOLEAN) TO authenticated, service_role;

-- RPC - accept/decline a challenge
CREATE OR REPLACE FUNCTION public.respond_challenge(
  p_challenge_id UUID,
  p_accept       BOOLEAN
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_c          public.game_challenges%ROWTYPE;
  v_game_id    UUID;
  v_host_white BOOLEAN := (random() < 0.5);
  v_challenger_username TEXT;
  v_opponent_username   TEXT;
  v_challenger_rating   INT;
  v_opponent_rating     INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_c FROM public.game_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Challenge not found'; END IF;
  IF v_c.to_user_id <> v_uid THEN RAISE EXCEPTION 'Not your challenge to answer'; END IF;
  IF v_c.status <> 'pending' THEN RAISE EXCEPTION 'Challenge already resolved'; END IF;

  IF NOT p_accept THEN
    UPDATE public.game_challenges SET status = 'declined', responded_at = now() WHERE id = p_challenge_id;
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT v_c.from_user_id, 'challenge', 'Challenge declined',
           coalesce(username, 'Your friend') || ' declined your challenge.', '/friends'
    FROM public.profiles WHERE id = v_uid;
    RETURN NULL;
  END IF;

  SELECT username INTO v_challenger_username FROM public.profiles WHERE id = v_c.from_user_id;
  SELECT username INTO v_opponent_username FROM public.profiles WHERE id = v_c.to_user_id;
  v_challenger_rating := public.current_rating(v_c.from_user_id, v_c.time_class);
  v_opponent_rating   := public.current_rating(v_c.to_user_id, v_c.time_class);

  INSERT INTO public.games (
    host_id,
    white_id, black_id, white_username, black_username, white_rating, black_rating,
    status, result, time_class, time_control,
    initial_seconds, increment_seconds, white_time_ms, black_time_ms,
    is_rated, fen, turn
  ) VALUES (
    v_c.from_user_id,
    CASE WHEN v_host_white THEN v_c.from_user_id ELSE v_c.to_user_id END,
    CASE WHEN v_host_white THEN v_c.to_user_id ELSE v_c.from_user_id END,
    CASE WHEN v_host_white THEN v_challenger_username ELSE v_opponent_username END,
    CASE WHEN v_host_white THEN v_opponent_username ELSE v_challenger_username END,
    CASE WHEN v_host_white THEN v_challenger_rating ELSE v_opponent_rating END,
    CASE WHEN v_host_white THEN v_opponent_rating ELSE v_challenger_rating END,
    'active', 'ongoing', v_c.time_class, v_c.time_control,
    v_c.timer, v_c.increment_seconds,
    v_c.timer * 1000, v_c.timer * 1000,
    v_c.is_rated,
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w'
  ) RETURNING id INTO v_game_id;

  UPDATE public.game_challenges
  SET status = 'accepted', responded_at = now(), game_id = v_game_id
  WHERE id = p_challenge_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (
    v_c.from_user_id, 'challenge', 'Challenge accepted',
    coalesce(v_opponent_username, 'Your friend') || ' accepted - the game has begun!',
    '/game/' || v_game_id
  );

  RETURN v_game_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.respond_challenge(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_challenge(UUID, BOOLEAN) TO authenticated, service_role;

-- RPC - cancel an outgoing challenge that hasn't been answered yet
CREATE OR REPLACE FUNCTION public.cancel_challenge(p_challenge_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_c   public.game_challenges%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_c FROM public.game_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Challenge not found'; END IF;
  IF v_c.from_user_id <> v_uid THEN RAISE EXCEPTION 'Not your challenge to cancel'; END IF;
  IF v_c.status <> 'pending' THEN RAISE EXCEPTION 'Challenge already resolved'; END IF;

  UPDATE public.game_challenges SET status = 'cancelled', responded_at = now() WHERE id = p_challenge_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.cancel_challenge(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_challenge(UUID) TO authenticated, service_role;

-- RPC - send a friend request, notifying the addressee (the existing friends ta...
CREATE OR REPLACE FUNCTION public.send_friend_request(p_addressee_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_friend_id UUID;
  v_username  TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_addressee_id = v_uid THEN RAISE EXCEPTION 'Cannot friend yourself'; END IF;

  INSERT INTO public.friends (requester_id, addressee_id)
  VALUES (v_uid, p_addressee_id)
  RETURNING id INTO v_friend_id;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (
    p_addressee_id, 'friend_request', 'New friend request',
    coalesce(v_username, 'Someone') || ' sent you a friend request.', '/friends'
  );

  RETURN v_friend_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.send_friend_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID) TO authenticated, service_role;

-- RPC - accept a friend request, notifying the original requester
CREATE OR REPLACE FUNCTION public.accept_friend_request(p_friend_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_f   public.friends%ROWTYPE;
  v_username TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_f FROM public.friends WHERE id = p_friend_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Friend request not found'; END IF;
  IF v_f.addressee_id <> v_uid THEN RAISE EXCEPTION 'Not your request to accept'; END IF;
  IF v_f.status <> 'pending' THEN RAISE EXCEPTION 'Request already resolved'; END IF;

  UPDATE public.friends SET status = 'accepted' WHERE id = p_friend_id;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (
    v_f.requester_id, 'friend_accept', 'Friend request accepted',
    coalesce(v_username, 'Your friend') || ' accepted your friend request.', '/friends'
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.accept_friend_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID) TO authenticated, service_role;

-- RPC - accept/reject a clan invite
CREATE OR REPLACE FUNCTION public.respond_clan_invite(
  p_invite_id UUID,
  p_accept    BOOLEAN
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_inv public.clan_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_inv FROM public.clan_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  IF v_inv.invitee_id <> v_uid THEN RAISE EXCEPTION 'Not your invite to answer'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'Invite already resolved'; END IF;

  IF NOT p_accept THEN
    UPDATE public.clan_invites SET status = 'rejected' WHERE id = p_invite_id;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'You are already in a clan';
  END IF;

  INSERT INTO public.clan_members (clan_id, user_id, role)
  VALUES (v_inv.clan_id, v_uid, 'member');

  UPDATE public.clan_invites SET status = 'accepted' WHERE id = p_invite_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.respond_clan_invite(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_clan_invite(UUID, BOOLEAN) TO authenticated, service_role;

-- Realtime for clan_invites (used by the new Friends -> Clan Invites tab)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'clan_invites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clan_invites;
  END IF;
END $$;

-- Realtime for profiles (used by the Friend Activity page's online/offline feed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;



BEGIN;

-- public.policies
DROP POLICY IF EXISTS "Published policies are public, admins see all" ON public.policies;

CREATE POLICY "Published policies are public"
  ON public.policies FOR SELECT
  TO anon, authenticated
  USING (is_published);

CREATE POLICY "Admins read all policies"
  ON public.policies FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- public.news_articles
DROP POLICY IF EXISTS "Published news public" ON public.news_articles;

CREATE POLICY "Published news public"
  ON public.news_articles FOR SELECT
  TO anon, authenticated
  USING (published);

CREATE POLICY "Admins read all news"
  ON public.news_articles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- public.about_articles
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





BEGIN;

-- Bugfix: community_reports missing columns (see note above)
ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Bugfix: keep community_posts.bookmarks_count in sync
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

-- 1
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

-- 2
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
CREATE OR REPLACE FUNCTION public.community_get_comments(p_post_id UUID)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
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
            'my_reaction', (SELECT reaction_type FROM public.community_comment_reactions ccr WHERE ccr.comment_id = c.id AND ccr.user_id = v_uid LIMIT 1)
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

-- 3
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

-- 4
CREATE OR REPLACE FUNCTION public.community_share_post(p_post_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    UPDATE public.community_posts SET shares_count = shares_count + 1 WHERE id = p_post_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_share_post(UUID) TO authenticated;

-- 5
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

-- 6. community_follow_list
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

-- 7. community_leaderboard
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

-- 8
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

-- 9. community_search_users
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

-- 10
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

-- 11. admin_community_stats
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

-- Section 100: PUBLIC ROOM LIFECYCLE HARDENING

-- 100.1 Shared internal helpers (SECURITY DEFINER, not client-callable)
CREATE OR REPLACE FUNCTION public._room_close(p_room_id TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.room_queue WHERE room_id = p_room_id;
  DELETE FROM public.room_presence WHERE room_id = p_room_id;
  UPDATE public.public_rooms
  SET status = 'closed', finished_at = now()
  WHERE id = p_room_id AND status NOT IN ('closed', 'playing');
END; $$;
REVOKE ALL ON FUNCTION public._room_close(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._room_close(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public._room_promote_guest(p_room_id TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next_uid UUID;
BEGIN
  SELECT user_id INTO v_next_uid
  FROM public.room_queue WHERE room_id = p_room_id ORDER BY position ASC LIMIT 1;

  IF FOUND THEN
    DELETE FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_next_uid;
    UPDATE public.room_queue SET position = position - 1 WHERE room_id = p_room_id;
    UPDATE public.public_rooms SET guest_id = v_next_uid, status = 'guest_joined' WHERE id = p_room_id;
  ELSE
    UPDATE public.public_rooms SET guest_id = NULL, status = 'waiting' WHERE id = p_room_id;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public._room_promote_guest(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._room_promote_guest(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public._room_finish_and_promote(p_room_id TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next_uid   UUID;
  v_room       public.public_rooms;
BEGIN
  SELECT * INTO v_room FROM public.public_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT user_id INTO v_next_uid
  FROM public.room_queue WHERE room_id = p_room_id ORDER BY position ASC LIMIT 1;

  IF NOT FOUND THEN
    -- Queue is empty. Keep the host, remove the guest, set to waiting.
    UPDATE public.public_rooms SET
      guest_id = NULL,
      status = 'waiting',
      game_id = NULL, started_at = NULL, finished_at = now()
    WHERE id = p_room_id;
    RETURN;
  END IF;

-- Queue has at least one player
  DELETE FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_next_uid;
  UPDATE public.room_queue SET position = position - 1 WHERE room_id = p_room_id;

  -- 2. Update the room: keep the same host, new player becomes guest
  UPDATE public.public_rooms SET
    guest_id = v_next_uid, 
    status = 'guest_joined',
    game_id = NULL, started_at = NULL, finished_at = now()
  WHERE id = p_room_id;

END; $$;
REVOKE ALL ON FUNCTION public._room_finish_and_promote(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._room_finish_and_promote(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public._room_remove_participant(p_room_id TEXT, p_target UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room public.public_rooms;
  v_pos  INT;
BEGIN
  SELECT * INTO v_room FROM public.public_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.room_presence WHERE room_id = p_room_id AND user_id = p_target;

  IF v_room.host_id = p_target THEN
    IF v_room.status IN ('waiting', 'guest_joined') THEN
      PERFORM public._room_close(p_room_id);
    END IF;
  ELSIF v_room.guest_id = p_target THEN
    IF v_room.status IN ('waiting', 'guest_joined') THEN
      PERFORM public._room_promote_guest(p_room_id);
    END IF;
  ELSE
    SELECT position INTO v_pos FROM public.room_queue WHERE room_id = p_room_id AND user_id = p_target;
    IF FOUND THEN
      DELETE FROM public.room_queue WHERE room_id = p_room_id AND user_id = p_target;
      UPDATE public.room_queue SET position = position - 1 WHERE room_id = p_room_id AND position > v_pos;
    END IF;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public._room_remove_participant(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._room_remove_participant(TEXT, UUID) TO service_role;

-- 100.2 leave_public_room v2
CREATE OR REPLACE FUNCTION public.leave_public_room(
  p_room_id TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  PERFORM public._room_remove_participant(p_room_id, v_uid);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.leave_public_room(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.leave_public_room(TEXT) TO authenticated, service_role;

-- 100.3 join_room_queue / leave_room_queue
CREATE OR REPLACE FUNCTION public.join_room_queue(p_room_id TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_room     public.public_rooms;
  v_position INT;
  v_queue_count INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_room FROM public.public_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status NOT IN ('waiting', 'guest_joined', 'playing', 'finished') THEN
    RAISE EXCEPTION 'Room is not accepting queued players';
  END IF;
  IF v_room.host_id = v_uid THEN RAISE EXCEPTION 'Host cannot join the queue'; END IF;
  IF v_room.guest_id = v_uid THEN RAISE EXCEPTION 'You are already in the room as guest'; END IF;

  SELECT position INTO v_position
  FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_uid;
  IF FOUND THEN RETURN v_position; END IF;

  SELECT COUNT(*) INTO v_queue_count FROM public.room_queue WHERE room_id = p_room_id;
  IF (CASE WHEN v_room.guest_id IS NOT NULL THEN 2 ELSE 1 END) + v_queue_count >= 10 THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
  FROM public.room_queue WHERE room_id = p_room_id;

  INSERT INTO public.room_queue (room_id, user_id, position)
  VALUES (p_room_id, v_uid, v_position);

  RETURN v_position;
END;
$$;
REVOKE ALL ON FUNCTION public.join_room_queue(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_room_queue(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_room_queue(p_room_id TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pos INT;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  PERFORM 1 FROM public.public_rooms WHERE id = p_room_id FOR UPDATE;

  SELECT position INTO v_pos
  FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_uid;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_uid;
  UPDATE public.room_queue SET position = position - 1
  WHERE room_id = p_room_id AND position > v_pos;

  DELETE FROM public.room_presence WHERE room_id = p_room_id AND user_id = v_uid;
END; $$;
REVOKE ALL ON FUNCTION public.leave_room_queue(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_room_queue(TEXT) TO authenticated;

-- 100.4 THE CORE FIX
CREATE OR REPLACE FUNCTION public.handle_public_room_game_finished()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room_id TEXT;
BEGIN
  SELECT id INTO v_room_id
  FROM public.public_rooms
  WHERE game_id = NEW.id AND status = 'playing'
  FOR UPDATE;

  IF FOUND THEN
    PERFORM public._room_finish_and_promote(v_room_id);
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_public_room_game_finished ON public.games;
CREATE TRIGGER trg_public_room_game_finished
  AFTER UPDATE ON public.games
  FOR EACH ROW
  WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_public_room_game_finished();

-- 100.5 Presence / heartbeat
CREATE TABLE IF NOT EXISTS public.room_presence (
  room_id      TEXT NOT NULL REFERENCES public.public_rooms(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_room_presence_last_seen ON public.room_presence(last_seen_at);

ALTER TABLE public.room_presence ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.room_presence TO service_role;

CREATE OR REPLACE FUNCTION public.room_heartbeat(p_room_id TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.public_rooms
    WHERE id = p_room_id AND (host_id = v_uid OR guest_id = v_uid)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_uid
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.room_presence (room_id, user_id, last_seen_at)
  VALUES (p_room_id, v_uid, now())
  ON CONFLICT (room_id, user_id) DO UPDATE SET last_seen_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.room_heartbeat(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_heartbeat(TEXT) TO authenticated;

-- 100.6 room_lifecycle_sweep
CREATE OR REPLACE FUNCTION public.room_lifecycle_sweep()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stale_before TIMESTAMPTZ := now() - interval '75 seconds';
  v_min_age      TIMESTAMPTZ := now() - interval '60 seconds';
  r RECORD;
BEGIN
  FOR r IN
    SELECT pr.id FROM public.public_rooms pr
    WHERE pr.status = 'waiting' AND pr.guest_id IS NULL
      AND EXISTS (SELECT 1 FROM public.room_queue WHERE room_id = pr.id)
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public._room_promote_guest(r.id);
  END LOOP;

  FOR r IN
    SELECT id FROM public.public_rooms
    WHERE status IN ('waiting', 'guest_joined', 'starting') AND expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public._room_close(r.id);
  END LOOP;

  FOR r IN
    SELECT pr.id, pr.host_id, pr.guest_id
    FROM public.public_rooms pr
    WHERE pr.status IN ('waiting', 'guest_joined') AND pr.created_at < v_min_age
    FOR UPDATE SKIP LOCKED
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.room_presence
      WHERE room_id = r.id AND user_id = r.host_id AND last_seen_at >= v_stale_before
    ) THEN
      PERFORM public._room_remove_participant(r.id, r.host_id);
      CONTINUE; 
    END IF;

    IF r.guest_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.room_presence
      WHERE room_id = r.id AND user_id = r.guest_id AND last_seen_at >= v_stale_before
    ) THEN
      PERFORM public._room_remove_participant(r.id, r.guest_id);
    END IF;
  END LOOP;

  FOR r IN
    SELECT rq.room_id, rq.user_id
    FROM public.room_queue rq
    JOIN public.public_rooms pr ON pr.id = rq.room_id
    WHERE pr.status IN ('waiting', 'guest_joined', 'playing')
      AND rq.joined_at < v_min_age
      AND NOT EXISTS (
        SELECT 1 FROM public.room_presence p
        WHERE p.room_id = rq.room_id AND p.user_id = rq.user_id AND p.last_seen_at >= v_stale_before
      )
    FOR UPDATE OF rq SKIP LOCKED
  LOOP
    PERFORM public._room_remove_participant(r.room_id, r.user_id);
  END LOOP;

  DELETE FROM public.public_rooms
  WHERE status = 'closed' AND finished_at < now() - interval '24 hours';
END; $$;
REVOKE ALL ON FUNCTION public.room_lifecycle_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_lifecycle_sweep() TO authenticated, service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('room_lifecycle_sweep');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.schedule('room_lifecycle_sweep', '* * * * *', 'SELECT public.room_lifecycle_sweep();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available';
END $$;




-- 1. Ensure global chat function creates/upserts global channel properly
CREATE OR REPLACE FUNCTION public._chat_ensure_global(p_user UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.chat_channels WHERE slug = 'global' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.chat_channels (type, slug, name, description, is_private, is_permanent, icon, sort_order)
    VALUES ('global', 'global', 'Global Chat', 'Every ChessOx player, one room', false, true, '🌍', 1)
    ON CONFLICT (slug) DO UPDATE SET type = 'global', is_private = false, is_permanent = true
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

-- 2. Update chat_get_channel to auto-create and auto-join caller
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


-- Ensure pgcrypto extension is active
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 3. Create room RPC matching client signature (7 parameters including p_slug)
DROP FUNCTION IF EXISTS public.chat_create_room(TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.chat_create_room(TEXT, TEXT, BOOLEAN, TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS public.chat_create_room(TEXT, TEXT, BOOLEAN, TEXT, INT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.chat_create_room(
  p_name TEXT,
  p_description TEXT,
  p_is_private BOOLEAN,
  p_icon TEXT DEFAULT '💬',
  p_max_members INT DEFAULT NULL,
  p_password TEXT DEFAULT NULL,
  p_slug TEXT DEFAULT NULL
)
RETURNS public.chat_channel_row
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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

  IF p_slug IS NOT NULL AND trim(p_slug) != '' THEN
    v_slug := lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9_-]+', '', 'g'));
  ELSE
    v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::TEXT, 1, 6);
  END IF;

  v_code := public._chat_gen_room_code();

  INSERT INTO public.chat_channels (
    type, slug, name, description, is_private, owner_id,
    room_code, icon, max_members, password_hash
  )
  VALUES (
    'room', v_slug, p_name, COALESCE(p_description, ''), COALESCE(p_is_private, false), auth.uid(),
    v_code, COALESCE(NULLIF(trim(p_icon), ''), '💬'), p_max_members,
    CASE WHEN p_is_private AND p_password IS NOT NULL AND trim(p_password) != ''
         THEN extensions.crypt(p_password, extensions.gen_salt('bf'))
         ELSE NULL END
  )
  RETURNING id INTO v_id;

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (v_id, auth.uid(), 'owner');

  SELECT * INTO v_row FROM public._chat_channel_row(v_id, auth.uid());
  RETURN v_row;
END; $$;

REVOKE EXECUTE ON FUNCTION public.chat_create_room(TEXT, TEXT, BOOLEAN, TEXT, INT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_create_room(TEXT, TEXT, BOOLEAN, TEXT, INT, TEXT, TEXT) TO authenticated, service_role;

-- 4. Join private room RPC with extensions search path
DROP FUNCTION IF EXISTS public.chat_join_private_room(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.chat_join_private_room(p_room_code TEXT, p_password TEXT)
RETURNS public.chat_channel_row
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
  IF v_hash IS NULL OR p_password IS NULL OR extensions.crypt(p_password, v_hash) != v_hash THEN
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

-- 5. RLS policy allowing room discovery for global and public/private rooms
DROP POLICY IF EXISTS "chat_channels_select" ON public.chat_channels;
CREATE POLICY "chat_channels_select" ON public.chat_channels
  FOR SELECT USING (
    type IN ('global', 'room')
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = chat_channels.id AND m.user_id = auth.uid()
    )
  );

-- 6. Discover private rooms RPC
DROP FUNCTION IF EXISTS public.chat_discover_private_rooms(TEXT, INT);
CREATE OR REPLACE FUNCTION public.chat_discover_private_rooms(p_search TEXT DEFAULT NULL, p_limit INT DEFAULT 30)
RETURNS SETOF public.chat_channel_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT r.* FROM public.chat_channels c
  CROSS JOIN LATERAL public._chat_channel_row(c.id, auth.uid()) r
  WHERE c.type = 'room' AND c.is_private = true AND (c.is_permanent IS NULL OR c.is_permanent = false)
    AND (p_search IS NULL OR p_search = '' OR c.name ILIKE '%' || p_search || '%' OR c.slug ILIKE '%' || p_search || '%' OR c.room_code ILIKE '%' || p_search || '%')
  ORDER BY c.created_at DESC
  LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_discover_private_rooms(TEXT, INT) FROM PUBLIC;
-- 7
-- SECTION 30's 'timeout'







-- SECTION: ANTI-CHEAT SYSTEM
-- Evidence-first fair-play infrastructure

-- Profiles gain an account_status column (game.functions.ts already checks it d...
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_status_check'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('active','restricted','suspended','banned'));
  END IF;
END $$;

-- ── anti_cheat_events — the canonical evidence log ────────────────────
CREATE TABLE IF NOT EXISTS public.anti_cheat_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID,
  game_id     UUID,
  event_type  TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','low','medium','high','critical')),
  source      TEXT NOT NULL DEFAULT 'client'
    CHECK (source IN ('client','server','analysis','realtime')),
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_ts   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ace_user    ON public.anti_cheat_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ace_game    ON public.anti_cheat_events(game_id);
CREATE INDEX IF NOT EXISTS idx_ace_type    ON public.anti_cheat_events(event_type, created_at DESC);
-- One analysis run per game (concurrency guard for the post-game pipeline).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ace_analysis_once
  ON public.anti_cheat_events(game_id, event_type)
  WHERE event_type = 'analysis_started';
GRANT SELECT ON public.anti_cheat_events TO authenticated;
GRANT ALL ON public.anti_cheat_events TO service_role;
ALTER TABLE public.anti_cheat_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ac events admin read" ON public.anti_cheat_events;
CREATE POLICY "ac events admin read"
  ON public.anti_cheat_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── browser_events — high-volume client telemetry (batched) ───────────
CREATE TABLE IF NOT EXISTS public.browser_events (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            UUID NOT NULL,
  game_id            UUID,
  event_type         TEXT NOT NULL,
  count              INT NOT NULL DEFAULT 1 CHECK (count > 0),
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  window_started_at  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_be_user ON public.browser_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_be_game ON public.browser_events(game_id);
GRANT SELECT ON public.browser_events TO authenticated;
GRANT ALL ON public.browser_events TO service_role;
ALTER TABLE public.browser_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "browser events admin read" ON public.browser_events;
CREATE POLICY "browser events admin read"
  ON public.browser_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── player_risk_scores — one row per user, updated by the server ────── raw_* ...
CREATE TABLE IF NOT EXISTS public.player_risk_scores (
  user_id           UUID PRIMARY KEY,
  total_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_level        TEXT NOT NULL DEFAULT 'safe'
    CHECK (risk_level IN ('safe','monitor','warning','review','high_risk')),
  engine_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  timing_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  behavior_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
  connection_score  NUMERIC(5,2) NOT NULL DEFAULT 0,
  account_score     NUMERIC(5,2) NOT NULL DEFAULT 0,
  raw_engine        NUMERIC(10,4) NOT NULL DEFAULT 0,
  raw_timing        NUMERIC(10,4) NOT NULL DEFAULT 0,
  raw_behavior      NUMERIC(10,4) NOT NULL DEFAULT 0,
  raw_connection    NUMERIC(10,4) NOT NULL DEFAULT 0,
  raw_account       NUMERIC(10,4) NOT NULL DEFAULT 0,
  flagged_games     INT NOT NULL DEFAULT 0,
  last_event_at     TIMESTAMPTZ,
  decayed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prs_score ON public.player_risk_scores(total_score DESC);
GRANT SELECT ON public.player_risk_scores TO authenticated;
GRANT ALL ON public.player_risk_scores TO service_role;
ALTER TABLE public.player_risk_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "risk scores admin read" ON public.player_risk_scores;
CREATE POLICY "risk scores admin read"
  ON public.player_risk_scores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS trg_prs_updated_at ON public.player_risk_scores;
CREATE TRIGGER trg_prs_updated_at
  BEFORE UPDATE ON public.player_risk_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── anti_cheat_flags — reviewable findings (a flag ≠ a ban) ───────────
CREATE TABLE IF NOT EXISTS public.anti_cheat_flags (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL,
  game_id            UUID,
  flag_type          TEXT NOT NULL,
  severity           TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  status             TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','confirmed','dismissed')),
  risk_contribution  NUMERIC(6,2) NOT NULL DEFAULT 0,
  summary            TEXT NOT NULL DEFAULT '',
  details            JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by        UUID,
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acf_user   ON public.anti_cheat_flags(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acf_status ON public.anti_cheat_flags(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acf_game   ON public.anti_cheat_flags(game_id);
GRANT SELECT ON public.anti_cheat_flags TO authenticated;
GRANT ALL ON public.anti_cheat_flags TO service_role;
ALTER TABLE public.anti_cheat_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ac flags admin read" ON public.anti_cheat_flags;
CREATE POLICY "ac flags admin read"
  ON public.anti_cheat_flags FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS trg_acf_updated_at ON public.anti_cheat_flags;
CREATE TRIGGER trg_acf_updated_at
  BEFORE UPDATE ON public.anti_cheat_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── device_fingerprints — multi-account signals (flag, never auto-ban) ─
CREATE TABLE IF NOT EXISTS public.device_fingerprints (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  fingerprint_hash  TEXT NOT NULL,
  components        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash           TEXT,
  user_agent        TEXT,
  times_seen        INT NOT NULL DEFAULT 1,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint_hash)
);
CREATE INDEX IF NOT EXISTS idx_df_hash ON public.device_fingerprints(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_df_ip   ON public.device_fingerprints(ip_hash);
GRANT SELECT ON public.device_fingerprints TO authenticated;
GRANT ALL ON public.device_fingerprints TO service_role;
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fingerprints admin read" ON public.device_fingerprints;
CREATE POLICY "fingerprints admin read"
  ON public.device_fingerprints FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── admin_reviews — every human decision, permanently recorded ────────
CREATE TABLE IF NOT EXISTS public.admin_reviews (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id    UUID,
  user_id    UUID NOT NULL,
  admin_id   UUID NOT NULL,
  decision   TEXT NOT NULL
    CHECK (decision IN ('confirm','dismiss','reset_risk','enforce','note')),
  notes      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ar_user ON public.admin_reviews(user_id, created_at DESC);
GRANT SELECT ON public.admin_reviews TO authenticated;
GRANT ALL ON public.admin_reviews TO service_role;
ALTER TABLE public.admin_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin reviews admin read" ON public.admin_reviews;
CREATE POLICY "admin reviews admin read"
  ON public.admin_reviews FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── enforcement_actions — the only place bans/suspensions come from ───
CREATE TABLE IF NOT EXISTS public.enforcement_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL,
  action         TEXT NOT NULL
    CHECK (action IN ('warning','restriction','suspension','ban','unban','risk_reset')),
  reason         TEXT NOT NULL,
  duration_hours INT,
  expires_at     TIMESTAMPTZ,
  created_by     UUID NOT NULL,
  revoked_at     TIMESTAMPTZ,
  revoked_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ea_user ON public.enforcement_actions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ea_expiry
  ON public.enforcement_actions(expires_at)
  WHERE expires_at IS NOT NULL AND revoked_at IS NULL;
GRANT SELECT ON public.enforcement_actions TO authenticated;
GRANT ALL ON public.enforcement_actions TO service_role;
ALTER TABLE public.enforcement_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "enforcement admin read" ON public.enforcement_actions;
CREATE POLICY "enforcement admin read"
  ON public.enforcement_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── Admin read RPCs (SECURITY DEFINER, admin-gated) ─────────────────── Reads ...

CREATE OR REPLACE FUNCTION public.anticheat_overview()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT jsonb_build_object(
    'open_flags',        (SELECT count(*) FROM anti_cheat_flags WHERE status = 'open'),
    'under_review',      (SELECT count(*) FROM anti_cheat_flags WHERE status = 'under_review'),
    'confirmed_flags',   (SELECT count(*) FROM anti_cheat_flags WHERE status = 'confirmed'),
    'high_risk_players', (SELECT count(*) FROM player_risk_scores WHERE risk_level = 'high_risk'),
    'review_players',    (SELECT count(*) FROM player_risk_scores WHERE risk_level = 'review'),
    'events_24h',        (SELECT count(*) FROM anti_cheat_events WHERE created_at > now() - interval '24 hours'),
    'browser_events_24h',(SELECT coalesce(sum(count),0) FROM browser_events WHERE created_at > now() - interval '24 hours'),
    'actions_30d',       (SELECT count(*) FROM enforcement_actions WHERE created_at > now() - interval '30 days'),
    'live_flagged_games',(
      SELECT coalesce(jsonb_agg(fg), '[]'::jsonb) FROM (
        SELECT DISTINCT ON (f.game_id)
          f.game_id, f.flag_type, f.severity, f.created_at,
          g.white_username, g.black_username, g.status AS game_status,
          p.username
        FROM anti_cheat_flags f
        LEFT JOIN games g ON g.id = f.game_id
        LEFT JOIN profiles p ON p.id = f.user_id
        WHERE f.status IN ('open','under_review') AND f.game_id IS NOT NULL
        ORDER BY f.game_id, f.created_at DESC
        LIMIT 25
      ) fg
    )
  ) INTO v;
  RETURN v;
END; $$;
REVOKE EXECUTE ON FUNCTION public.anticheat_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anticheat_overview() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.anticheat_list_players(
  p_min_score NUMERIC DEFAULT 0, p_limit INT DEFAULT 50
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT r.user_id, r.total_score, r.risk_level,
             r.engine_score, r.timing_score, r.behavior_score,
             r.connection_score, r.account_score,
             r.flagged_games, r.last_event_at, r.updated_at,
             p.username, p.avatar_url, p.account_status,
             (SELECT count(*) FROM anti_cheat_flags f
               WHERE f.user_id = r.user_id AND f.status IN ('open','under_review')) AS open_flags
      FROM player_risk_scores r
      LEFT JOIN profiles p ON p.id = r.user_id
      WHERE r.total_score >= p_min_score
      ORDER BY r.total_score DESC
      LIMIT least(greatest(p_limit, 1), 200)
    ) t
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.anticheat_list_players(NUMERIC, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anticheat_list_players(NUMERIC, INT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.anticheat_list_flags(
  p_status TEXT DEFAULT NULL, p_limit INT DEFAULT 100
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT f.id, f.user_id, f.game_id, f.flag_type, f.severity, f.status,
             f.risk_contribution, f.summary, f.details, f.created_at,
             f.reviewed_by, f.reviewed_at,
             p.username, p.avatar_url,
             g.white_username, g.black_username, g.time_control, g.status AS game_status
      FROM anti_cheat_flags f
      LEFT JOIN profiles p ON p.id = f.user_id
      LEFT JOIN games g ON g.id = f.game_id
      WHERE (p_status IS NULL OR f.status = p_status)
      ORDER BY f.created_at DESC
      LIMIT least(greatest(p_limit, 1), 500)
    ) t
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.anticheat_list_flags(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anticheat_list_flags(TEXT, INT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.anticheat_player_detail(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN jsonb_build_object(
    'profile', (
      SELECT row_to_json(t) FROM (
        SELECT id, username, avatar_url, account_status, created_at
        FROM profiles WHERE id = p_user_id
      ) t
    ),
    'risk', (
      SELECT row_to_json(t) FROM (
        SELECT * FROM player_risk_scores WHERE user_id = p_user_id
      ) t
    ),
    'flags', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT f.*, g.white_username, g.black_username, g.time_control
        FROM anti_cheat_flags f LEFT JOIN games g ON g.id = f.game_id
        WHERE f.user_id = p_user_id ORDER BY f.created_at DESC LIMIT 100
      ) t
    ),
    'events', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT id, game_id, event_type, severity, source, metadata, created_at
        FROM anti_cheat_events WHERE user_id = p_user_id
        ORDER BY created_at DESC LIMIT 300
      ) t
    ),
    'browser_events', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT id, game_id, event_type, count, metadata, window_started_at, created_at
        FROM browser_events WHERE user_id = p_user_id
        ORDER BY created_at DESC LIMIT 300
      ) t
    ),
    'fingerprints', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT * FROM device_fingerprints WHERE user_id = p_user_id
        ORDER BY last_seen_at DESC LIMIT 50
      ) t
    ),
    'shared_devices', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT d2.user_id, p2.username, d2.fingerprint_hash, d2.last_seen_at,
               (d1.ip_hash IS NOT NULL AND d1.ip_hash = d2.ip_hash) AS same_ip
        FROM device_fingerprints d1
        JOIN device_fingerprints d2
          ON (d2.fingerprint_hash = d1.fingerprint_hash
              OR (d1.ip_hash IS NOT NULL AND d2.ip_hash = d1.ip_hash))
         AND d2.user_id <> d1.user_id
        LEFT JOIN profiles p2 ON p2.id = d2.user_id
        WHERE d1.user_id = p_user_id
        ORDER BY d2.last_seen_at DESC LIMIT 50
      ) t
    ),
    'reviews', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT r.*, p.username AS admin_username
        FROM admin_reviews r LEFT JOIN profiles p ON p.id = r.admin_id
        WHERE r.user_id = p_user_id ORDER BY r.created_at DESC LIMIT 100
      ) t
    ),
    'actions', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT a.*, p.username AS admin_username
        FROM enforcement_actions a LEFT JOIN profiles p ON p.id = a.created_by
        WHERE a.user_id = p_user_id ORDER BY a.created_at DESC LIMIT 100
      ) t
    ),
    'reports', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT id, reporter_id, reason, description, status, created_at
        FROM reports WHERE reported_user = p_user_id
        ORDER BY created_at DESC LIMIT 50
      ) t
    )
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.anticheat_player_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anticheat_player_detail(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.anticheat_game_evidence(p_game_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN jsonb_build_object(
    'game', (
      SELECT row_to_json(t) FROM (
        SELECT id, white_id, black_id, white_username, black_username,
               time_control, time_class, is_rated, status, result, end_reason,
               moves_count, created_at, ended_at
        FROM games WHERE id = p_game_id
      ) t
    ),
    'moves', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT ply, san, uci, by_user, time_left_ms, created_at
        FROM game_moves WHERE game_id = p_game_id ORDER BY ply LIMIT 500
      ) t
    ),
    'flags', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT f.*, p.username FROM anti_cheat_flags f
        LEFT JOIN profiles p ON p.id = f.user_id
        WHERE f.game_id = p_game_id ORDER BY f.created_at DESC
      ) t
    ),
    'events', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT id, user_id, event_type, severity, source, metadata, created_at
        FROM anti_cheat_events WHERE game_id = p_game_id
        ORDER BY created_at DESC LIMIT 300
      ) t
    ),
    'browser_events', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT user_id, event_type, count, metadata, created_at
        FROM browser_events WHERE game_id = p_game_id
        ORDER BY created_at DESC LIMIT 300
      ) t
    )
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.anticheat_game_evidence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anticheat_game_evidence(UUID) TO authenticated, service_role;

-- ── Service helpers (service_role only) ───────────────────────────────

-- Fan a fair-play alert out to every admin's notification feed.
CREATE OR REPLACE FUNCTION public.anticheat_notify_admins(
  p_title TEXT, p_body TEXT, p_link TEXT DEFAULT NULL
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT; v_has_legacy BOOLEAN;
BEGIN
-- Some deployments carry legacy NOT NULL type/message columns on notifications;...
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications'
      AND column_name = 'message'
  ) INTO v_has_legacy;
  IF v_has_legacy THEN
    EXECUTE 'INSERT INTO public.notifications (user_id, type, message, kind, title, body, link)
             SELECT ur.user_id, ''anticheat'', $2, ''anticheat'', $1, $2, $3
             FROM public.user_roles ur WHERE ur.role = ''admin'''
      USING p_title, p_body, p_link;
  ELSE
    INSERT INTO notifications (user_id, kind, title, body, link)
    SELECT ur.user_id, 'anticheat', p_title, p_body, p_link
    FROM user_roles ur WHERE ur.role = 'admin';
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
REVOKE EXECUTE ON FUNCTION public.anticheat_notify_admins(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anticheat_notify_admins(TEXT, TEXT, TEXT) TO service_role;

-- Lift expired temporary restrictions/suspensions
CREATE OR REPLACE FUNCTION public.anticheat_expire_enforcements()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row RECORD; v_count INT := 0;
BEGIN
  FOR v_row IN
    SELECT DISTINCT ON (user_id) id, user_id
    FROM enforcement_actions
    WHERE expires_at IS NOT NULL AND expires_at < now() AND revoked_at IS NULL
      AND action IN ('restriction','suspension')
    ORDER BY user_id, created_at DESC
  LOOP
    -- Only clear status if no later, still-active enforcement exists.
    IF NOT EXISTS (
      SELECT 1 FROM enforcement_actions e
      WHERE e.user_id = v_row.user_id AND e.revoked_at IS NULL
        AND e.action IN ('restriction','suspension','ban')
        AND (e.expires_at IS NULL OR e.expires_at > now())
    ) THEN
      UPDATE profiles SET account_status = 'active'
      WHERE id = v_row.user_id AND account_status IN ('restricted','suspended');
      v_count := v_count + 1;
    END IF;
    UPDATE enforcement_actions SET revoked_at = now() WHERE id = v_row.id;
  END LOOP;
  RETURN v_count;
END; $$;
REVOKE EXECUTE ON FUNCTION public.anticheat_expire_enforcements() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anticheat_expire_enforcements() TO service_role;

-- Section 101: ANALYSIS MODULE — ENGINE ROOM V2 (2026-07-28)
-- 1

-- 1. Full classification vocabulary ----------------------------------
ALTER TABLE public.game_moves DROP CONSTRAINT IF EXISTS game_moves_classification_check;
ALTER TABLE public.game_moves ADD CONSTRAINT game_moves_classification_check
  CHECK (classification IS NULL OR classification IN (
    'brilliant','great','best','excellent','good','book','forced',
    'interesting','dubious','inaccuracy','mistake','blunder','miss',
    'missedWin','missedDraw','missedTactic','missedMate'));

-- 2. Saved analyses ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_analyses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  pgn            TEXT NOT NULL DEFAULT '' CHECK (char_length(pgn) <= 200000),
  root_fen       TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  game_id        UUID REFERENCES public.games(id) ON DELETE SET NULL,
  opening_name   TEXT,
  opening_eco    TEXT,
  accuracy_white NUMERIC(5,1),
  accuracy_black NUMERIC(5,1),
  review         JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_analyses_user_idx
  ON public.saved_analyses (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_saved_analyses_updated ON public.saved_analyses;
CREATE TRIGGER trg_saved_analyses_updated
  BEFORE UPDATE ON public.saved_analyses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.saved_analyses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_analyses TO authenticated;
GRANT ALL ON public.saved_analyses TO service_role;

DROP POLICY IF EXISTS "own saved analyses: select" ON public.saved_analyses;
CREATE POLICY "own saved analyses: select" ON public.saved_analyses
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own saved analyses: insert" ON public.saved_analyses;
CREATE POLICY "own saved analyses: insert" ON public.saved_analyses
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own saved analyses: update" ON public.saved_analyses;
CREATE POLICY "own saved analyses: update" ON public.saved_analyses
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own saved analyses: delete" ON public.saved_analyses;
CREATE POLICY "own saved analyses: delete" ON public.saved_analyses
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 3. Opening explorer -------------------------------------------------
CREATE INDEX IF NOT EXISTS game_moves_epd_idx ON public.game_moves ((
  split_part(fen_before, ' ', 1) || ' ' || split_part(fen_before, ' ', 2) || ' ' ||
  split_part(fen_before, ' ', 3) || ' ' || split_part(fen_before, ' ', 4)
)) WHERE fen_before IS NOT NULL;

CREATE OR REPLACE FUNCTION public.opening_explorer(
  p_epd        TEXT,
  p_user       UUID DEFAULT NULL,
  p_color      TEXT DEFAULT NULL,
  p_time_class public.time_class DEFAULT NULL,
  p_min_rating INT  DEFAULT NULL,
  p_since      TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  san        TEXT,
  games      BIGINT,
  white_wins BIGINT,
  draws      BIGINT,
  black_wins BIGINT,
  avg_rating INT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT
    gm.san,
    count(*)                                   AS games,
    count(*) FILTER (WHERE g.result = 'white') AS white_wins,
    count(*) FILTER (WHERE g.result = 'draw')  AS draws,
    count(*) FILTER (WHERE g.result = 'black') AS black_wins,
    CAST(avg((coalesce(g.white_rating, 0) + coalesce(g.black_rating, 0)) / 2.0)
         FILTER (WHERE g.white_rating IS NOT NULL AND g.black_rating IS NOT NULL) AS INT)
      AS avg_rating
  FROM public.game_moves gm
  JOIN public.games g ON g.id = gm.game_id
  WHERE (split_part(gm.fen_before, ' ', 1) || ' ' || split_part(gm.fen_before, ' ', 2) || ' ' ||
         split_part(gm.fen_before, ' ', 3) || ' ' || split_part(gm.fen_before, ' ', 4)) = p_epd
    AND g.result IN ('white', 'black', 'draw')
    AND (p_user IS NULL OR g.white_id = p_user OR g.black_id = p_user)
    AND (p_user IS NULL OR p_color IS NULL
         OR (p_color = 'w' AND g.white_id = p_user)
         OR (p_color = 'b' AND g.black_id = p_user))
    AND (p_time_class IS NULL OR g.time_class = p_time_class)
    AND (p_min_rating IS NULL
         OR ((coalesce(g.white_rating, 0) + coalesce(g.black_rating, 0)) / 2) >= p_min_rating)
    AND (p_since IS NULL OR g.created_at >= p_since)
  GROUP BY gm.san
  ORDER BY count(*) DESC
  LIMIT 12;
$fn$;

GRANT EXECUTE ON FUNCTION
  public.opening_explorer(TEXT, UUID, TEXT, public.time_class, INT, TIMESTAMPTZ)
  TO anon, authenticated;

-- Section 102: RANKING SYSTEM V2 — PERMANENT ELO + SEASON POINTS (2026-07-29)
-- Replaces the SECTION 77 "Season IQ" earn model with a two-system competitive ...
-- 1
-- Compute seasonal SP rung and division
-- Compute seasonal SP rung and division
-- Everything configurable lives in public.season_config (a singleton row of JSO...

-- 102.1 Configuration singleton
CREATE TABLE IF NOT EXISTS public.season_config (
  id          BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  -- Per-tier SP rates: { "bronze": {"win":30,"draw":10,"loss":-8}, ... }
  sp_rates    JSONB NOT NULL,
  -- Upset bonus by tier gap: { "1":3, "2":5, "3":8 }
  upset_bonus JSONB NOT NULL,
  -- Conduct penalties: { "disconnect":-20, "timeout":-15, ... }
  penalties   JSONB NOT NULL,
  -- Ladder thresholds, ascending: [{"id":"bronze_3","min":0}, ...]
  ladder      JSONB NOT NULL,
  -- Anti-abuse knobs.
  demotion_grace_sp     INT NOT NULL DEFAULT 50,
  min_moves_for_sp      INT NOT NULL DEFAULT 6,
  daily_sp_cap          INT NOT NULL DEFAULT 600,
-- Anti-farming and fair play checks
  repeat_opponent_limit INT NOT NULL DEFAULT 5,
  repeat_opponent_pct   INT NOT NULL DEFAULT 25,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.season_config (id, sp_rates, upset_bonus, penalties, ladder)
VALUES (
  true,
  '{"bronze":{"win":30,"draw":10,"loss":-8},
    "silver":{"win":28,"draw":9,"loss":-10},
    "gold":{"win":26,"draw":8,"loss":-12},
    "platinum":{"win":24,"draw":7,"loss":-14},
    "diamond":{"win":22,"draw":6,"loss":-16},
    "master":{"win":20,"draw":5,"loss":-18},
    "grandmaster":{"win":18,"draw":4,"loss":-20}}'::jsonb,
  '{"1":3,"2":5,"3":8}'::jsonb,
  '{"disconnect":-20,"timeout":-15,"afk":-20,"cheating":-100}'::jsonb,
  '[{"id":"bronze_3","min":0},{"id":"bronze_2","min":150},{"id":"bronze_1","min":300},
    {"id":"silver_3","min":500},{"id":"silver_2","min":700},{"id":"silver_1","min":900},
    {"id":"gold_3","min":1150},{"id":"gold_2","min":1400},{"id":"gold_1","min":1650},
    {"id":"platinum_3","min":1950},{"id":"platinum_2","min":2250},{"id":"platinum_1","min":2550},
    {"id":"diamond_3","min":2900},{"id":"diamond_2","min":3250},{"id":"diamond_1","min":3600},
    {"id":"master_3","min":4000},{"id":"master_2","min":4400},{"id":"master_1","min":4800},
    {"id":"grandmaster_3","min":5300},{"id":"grandmaster_2","min":5800},{"id":"grandmaster_1","min":6300}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.season_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.season_config TO anon, authenticated;
GRANT ALL ON public.season_config TO service_role;
DROP POLICY IF EXISTS "season config public read" ON public.season_config;
CREATE POLICY "season config public read"
  ON public.season_config FOR SELECT TO anon, authenticated USING (true);
-- Writes only through admin_update_season_config (SECURITY DEFINER).

-- 102.2 Ladder columns + farming-guard ledger
ALTER TABLE public.season_rankings
-- `tier` exists on season_history from SECTION 77 but never on season_rankings ...
  ADD COLUMN IF NOT EXISTS tier             TEXT NOT NULL DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS rung_id          TEXT NOT NULL DEFAULT 'bronze_3',
  ADD COLUMN IF NOT EXISTS rung_index       INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_sp          INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_rung_index  INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_rank        INT,
  ADD COLUMN IF NOT EXISTS sp_penalty_total INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS banned           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason       TEXT,
  ADD COLUMN IF NOT EXISTS daily_sp_date    DATE,
  ADD COLUMN IF NOT EXISTS daily_sp_total   INT  NOT NULL DEFAULT 0;

ALTER TABLE public.season_history
  ADD COLUMN IF NOT EXISTS rung_id    TEXT,
  ADD COLUMN IF NOT EXISTS rung_index INT,
  ADD COLUMN IF NOT EXISTS peak_sp    INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_season_rankings_sp
  ON public.season_rankings(season_id, season_iq DESC)
  WHERE banned = false;

-- Per-season head-to-head counter powering the farming guard.
CREATE TABLE IF NOT EXISTS public.season_opponent_counts (
  season_id   UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  games       INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, user_id, opponent_id)
);
GRANT SELECT ON public.season_opponent_counts TO authenticated;
GRANT ALL ON public.season_opponent_counts TO service_role;
ALTER TABLE public.season_opponent_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own opponent counts" ON public.season_opponent_counts;
CREATE POLICY "own opponent counts"
  ON public.season_opponent_counts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 102.3 Ladder helpers
-- The rung a raw SP total sits on: configured id plus ladder index
CREATE OR REPLACE FUNCTION public.sp_rung(p_sp INT)
RETURNS TABLE (rung_id TEXT, rung_index INT, tier_code TEXT, division INT)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH rungs AS (
    SELECT e.value->>'id'          AS id,
           (e.value->>'min')::INT  AS min_sp,
           (e.ordinality - 1)::INT AS idx
    FROM public.season_config c,
         jsonb_array_elements(c.ladder) WITH ORDINALITY AS e(value, ordinality)
    WHERE c.id
  )
  SELECT r.id,
         r.idx,
         split_part(r.id, '_', 1),
         split_part(r.id, '_', 2)::INT
  FROM rungs r
  WHERE GREATEST(COALESCE(p_sp, 0), 0) >= r.min_sp
  ORDER BY r.min_sp DESC
  LIMIT 1;
$fn$;
GRANT EXECUTE ON FUNCTION public.sp_rung(INT) TO anon, authenticated, service_role;

-- Tier code only — the common case.
CREATE OR REPLACE FUNCTION public.sp_tier_code(p_sp INT)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT tier_code FROM public.sp_rung(p_sp);
$fn$;
GRANT EXECUTE ON FUNCTION public.sp_tier_code(INT) TO anon, authenticated, service_role;

-- Minimum SP required to stand on a rung index (for demotion checks).
CREATE OR REPLACE FUNCTION public.sp_rung_min(p_index INT)
RETURNS INT LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT COALESCE((
    SELECT (e.value->>'min')::INT
    FROM public.season_config c,
         jsonb_array_elements(c.ladder) WITH ORDINALITY AS e(value, ordinality)
    WHERE c.id AND (e.ordinality - 1) = p_index
  ), 0);
$fn$;
GRANT EXECUTE ON FUNCTION public.sp_rung_min(INT) TO anon, authenticated, service_role;

-- 102.4 The SP award primitive
-- Compute seasonal SP rung and division
-- Grace SP threshold before demotion to prevent rank yo-yoing
CREATE OR REPLACE FUNCTION public._season_award_sp(
  p_user   UUID,
  p_kind   TEXT,
  p_points INT,
  p_ref    TEXT,
  p_meta   JSONB DEFAULT '{}'::jsonb
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_season   UUID;
  v_cfg      RECORD;
  v_row      RECORD;
  v_points   INT := COALESCE(p_points, 0);
  v_today    DATE := (now() AT TIME ZONE 'UTC')::date;
  v_headroom INT;
  v_new_sp   INT;
  v_old_idx  INT;
  v_new_idx  INT;
  v_new_rung RECORD;
  v_username TEXT;
BEGIN
  IF p_user IS NULL OR v_points = 0 THEN RETURN 0; END IF;

  SELECT id INTO v_season FROM public.seasons
  WHERE status = 'live' ORDER BY season_number DESC LIMIT 1;
  IF v_season IS NULL THEN RETURN 0; END IF;

  SELECT * INTO v_cfg FROM public.season_config WHERE id;

  INSERT INTO public.season_rankings (season_id, user_id)
  VALUES (v_season, p_user)
  ON CONFLICT (season_id, user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.season_rankings
  WHERE season_id = v_season AND user_id = p_user FOR UPDATE;

  -- Season-banned players stop earning entirely.
  IF v_row.banned THEN RETURN 0; END IF;

  -- Daily cap applies to gains only; penalties must always be felt.
  IF v_points > 0 AND COALESCE(v_cfg.daily_sp_cap, 0) > 0 THEN
    IF v_row.daily_sp_date IS DISTINCT FROM v_today THEN
      UPDATE public.season_rankings
      SET daily_sp_date = v_today, daily_sp_total = 0
      WHERE season_id = v_season AND user_id = p_user;
      v_row.daily_sp_total := 0;
    END IF;
    v_headroom := GREATEST(0, v_cfg.daily_sp_cap - v_row.daily_sp_total);
    v_points := LEAST(v_points, v_headroom);
    IF v_points = 0 THEN RETURN 0; END IF;
  END IF;

  -- Idempotency guard: the same (season, user, kind, ref) pays once.
  INSERT INTO public.season_iq_events (season_id, user_id, kind, ref, points, meta)
  VALUES (v_season, p_user, p_kind, COALESCE(p_ref, 'x'), v_points, COALESCE(p_meta, '{}'::jsonb))
  ON CONFLICT (season_id, user_id, kind, ref) DO NOTHING;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_old_idx := v_row.rung_index;
  v_new_sp  := GREATEST(0, v_row.season_iq + v_points);

-- Resolve the rung the new total belongs on, with demotion grace: a player only...
  SELECT * INTO v_new_rung FROM public.sp_rung(v_new_sp);
  v_new_idx := v_new_rung.rung_index;

  IF v_new_idx < v_old_idx
     AND v_new_sp > public.sp_rung_min(v_old_idx) - COALESCE(v_cfg.demotion_grace_sp, 0) THEN
    -- Inside the grace band: hold the current rung.
    v_new_idx := v_old_idx;
    SELECT * INTO v_new_rung FROM public.sp_rung(public.sp_rung_min(v_old_idx));
  END IF;

  UPDATE public.season_rankings SET
    season_iq        = v_new_sp,
    iq_level         = v_new_sp,                       -- legacy mirror
    rung_id          = v_new_rung.rung_id,
    rung_index       = v_new_idx,
    tier             = v_new_rung.tier_code,
    peak_sp          = GREATEST(peak_sp, v_new_sp),
    peak_rung_index  = GREATEST(peak_rung_index, v_new_idx),
    sp_penalty_total = sp_penalty_total + CASE WHEN v_points < 0 THEN -v_points ELSE 0 END,
    daily_sp_total   = daily_sp_total + CASE WHEN v_points > 0 THEN v_points ELSE 0 END,
    daily_sp_date    = CASE WHEN v_points > 0 THEN v_today ELSE daily_sp_date END,
    updated_at       = now()
  WHERE season_id = v_season AND user_id = p_user;

  -- Promotion / demotion notifications.
  IF v_new_idx <> v_old_idx THEN
    SELECT username INTO v_username FROM public.profiles WHERE id = p_user;
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (
      p_user,
      CASE WHEN v_new_idx > v_old_idx THEN 'rank_promotion' ELSE 'rank_demotion' END,
      CASE WHEN v_new_idx > v_old_idx
        THEN 'Promoted to ' || initcap(v_new_rung.tier_code) || ' ' || v_new_rung.division
        ELSE 'Demoted to ' || initcap(v_new_rung.tier_code) || ' ' || v_new_rung.division END,
      CASE WHEN v_new_idx > v_old_idx
        THEN 'You climbed the season ladder. Keep the run going!'
        ELSE 'You have been demoted. Improve your performance to climb again.' END,
      '/seasons'
    );
  END IF;

  RETURN v_points;
END; $fn$;
REVOKE ALL ON FUNCTION public._season_award_sp(UUID, TEXT, INT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._season_award_sp(UUID, TEXT, INT, TEXT, JSONB) TO service_role;

-- Legacy shim: SECTION 77 callers (puzzles, tournaments, accuracy bonuses) keep...
CREATE OR REPLACE FUNCTION public._season_award_iq(
  p_user UUID, p_kind TEXT, p_points INT, p_ref TEXT, p_meta JSONB DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public._season_award_sp(p_user, p_kind, p_points, p_ref, p_meta);
END; $fn$;
REVOKE ALL ON FUNCTION public._season_award_iq(UUID, TEXT, INT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._season_award_iq(UUID, TEXT, INT, TEXT, JSONB) TO service_role;

-- 102.5 SP for finished games (replaces the SECTION 77 earn model)
-- Upset bonus calculation for defeating higher tier opponents
CREATE OR REPLACE FUNCTION public.handle_season_game_finished()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_season   UUID;
  v_cfg      RECORD;
  v_winner   UUID;
  v_loser    UUID;
  v_u        UUID;
  v_opp      UUID;
  v_sp       INT;
  v_opp_sp   INT;
  v_tier     TEXT;
  v_opp_tier TEXT;
  v_gap      INT;
  v_base     INT;
  v_bonus    INT;
  v_pts      INT;
  v_reps     INT;
  v_outcome  TEXT;
  v_penalty  INT;
BEGIN
  IF NEW.white_id IS NULL OR NEW.black_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.result NOT IN ('white', 'black', 'draw') THEN RETURN NEW; END IF;
  IF COALESCE(NEW.vs_computer, false) THEN RETURN NEW; END IF;
  IF NOT COALESCE(NEW.is_rated, true) THEN RETURN NEW; END IF;
  IF COALESCE(NEW.end_reason, '') IN ('aborted', 'no_show', 'tournament_cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_season FROM public.seasons
  WHERE status = 'live' ORDER BY season_number DESC LIMIT 1;
  IF v_season IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_cfg FROM public.season_config WHERE id;
  IF COALESCE(NEW.moves_count, 0) < COALESCE(v_cfg.min_moves_for_sp, 6) THEN
    RETURN NEW;  -- too short to be a real game; no SP, no stats
  END IF;

  INSERT INTO public.season_rankings (season_id, user_id)
  SELECT v_season, u FROM unnest(ARRAY[NEW.white_id, NEW.black_id]) AS u
  ON CONFLICT (season_id, user_id) DO NOTHING;

  -- Head-to-head counters (both directions) drive the farming guard.
  INSERT INTO public.season_opponent_counts (season_id, user_id, opponent_id, games)
  VALUES (v_season, NEW.white_id, NEW.black_id, 1),
         (v_season, NEW.black_id, NEW.white_id, 1)
  ON CONFLICT (season_id, user_id, opponent_id)
  DO UPDATE SET games = public.season_opponent_counts.games + 1;

  FOR v_u, v_opp IN
    SELECT NEW.white_id, NEW.black_id
    UNION ALL
    SELECT NEW.black_id, NEW.white_id
  LOOP
    v_outcome := CASE
      WHEN NEW.result = 'draw' THEN 'draw'
      WHEN (NEW.result = 'white' AND v_u = NEW.white_id)
        OR (NEW.result = 'black' AND v_u = NEW.black_id) THEN 'win'
      ELSE 'loss' END;

    SELECT season_iq INTO v_sp     FROM public.season_rankings
      WHERE season_id = v_season AND user_id = v_u;
    SELECT season_iq INTO v_opp_sp FROM public.season_rankings
      WHERE season_id = v_season AND user_id = v_opp;

    v_tier     := public.sp_tier_code(COALESCE(v_sp, 0));
    v_opp_tier := public.sp_tier_code(COALESCE(v_opp_sp, 0));
    v_base     := COALESCE((v_cfg.sp_rates -> v_tier ->> v_outcome)::INT, 0);

    -- Upset bonus: only for wins, only against a higher tier.
    v_bonus := 0;
    IF v_outcome = 'win' THEN
      SELECT (SELECT rung_index FROM public.sp_rung(GREATEST(COALESCE(v_opp_sp, 0), 0))) / 3
           - (SELECT rung_index FROM public.sp_rung(GREATEST(COALESCE(v_sp, 0), 0))) / 3
        INTO v_gap;
      IF COALESCE(v_gap, 0) > 0 THEN
        v_bonus := COALESCE((v_cfg.upset_bonus ->> LEAST(v_gap, 3)::text)::INT, 0);
      END IF;
    END IF;

    v_pts := v_base + v_bonus;

    -- Farming guard: repeated wins over the same opponent pay a fraction.
    IF v_pts > 0 AND COALESCE(v_cfg.repeat_opponent_limit, 0) > 0 THEN
      SELECT games INTO v_reps FROM public.season_opponent_counts
      WHERE season_id = v_season AND user_id = v_u AND opponent_id = v_opp;
      IF COALESCE(v_reps, 0) > v_cfg.repeat_opponent_limit THEN
        v_pts := GREATEST(1, (v_pts * COALESCE(v_cfg.repeat_opponent_pct, 25)) / 100);
      END IF;
    END IF;

    -- Conduct penalties stack on top of the result.
    v_penalty := 0;
    IF v_outcome = 'loss' THEN
      IF NEW.end_reason = 'timeout' THEN
        v_penalty := COALESCE((v_cfg.penalties ->> 'timeout')::INT, 0);
      ELSIF NEW.end_reason IN ('disconnect', 'abandoned') THEN
        v_penalty := COALESCE((v_cfg.penalties ->> 'disconnect')::INT, 0);
      END IF;
    END IF;

    -- Per-game stats.
    IF v_outcome = 'win' THEN
      UPDATE public.season_rankings SET
        games_played    = games_played + 1,
        wins            = wins + 1,
        cur_win_streak  = cur_win_streak + 1,
        best_win_streak = GREATEST(best_win_streak, cur_win_streak + 1),
        updated_at      = now()
      WHERE season_id = v_season AND user_id = v_u;
    ELSIF v_outcome = 'draw' THEN
      UPDATE public.season_rankings SET
        games_played   = games_played + 1,
        draws          = draws + 1,
        cur_win_streak = 0,
        updated_at     = now()
      WHERE season_id = v_season AND user_id = v_u;
    ELSE
      UPDATE public.season_rankings SET
        games_played   = games_played + 1,
        losses         = losses + 1,
        cur_win_streak = 0,
        updated_at     = now()
      WHERE season_id = v_season AND user_id = v_u;
    END IF;

    PERFORM public._season_award_sp(
      v_u, 'game_' || v_outcome, v_pts, NEW.id::text,
      jsonb_build_object('base', v_base, 'bonus', v_bonus, 'tier', v_tier,
                         'opponent_tier', v_opp_tier, 'opponent', v_opp)
    );

    IF v_penalty <> 0 THEN
      PERFORM public._season_award_sp(
        v_u, 'penalty_' || COALESCE(NEW.end_reason, 'conduct'), v_penalty, NEW.id::text,
        jsonb_build_object('reason', NEW.end_reason)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_season_game_finished ON public.games;
CREATE TRIGGER trg_season_game_finished
  AFTER UPDATE ON public.games
  FOR EACH ROW
  WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_season_game_finished();

-- 102.6 Conduct penalties applied outside the game trigger
-- Used by the anti-cheat pipeline and admin moderation
CREATE OR REPLACE FUNCTION public.apply_season_penalty(
  p_user   UUID,
  p_kind   TEXT,      -- disconnect | timeout | afk | cheating
  p_ref    TEXT,
  p_ban    BOOLEAN DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_cfg    RECORD;
  v_points INT;
  v_season UUID;
  v_ban    BOOLEAN;
BEGIN
  SELECT * INTO v_cfg FROM public.season_config WHERE id;
  v_points := COALESCE((v_cfg.penalties ->> p_kind)::INT, 0);
  IF v_points = 0 THEN RETURN 0; END IF;

  v_points := public._season_award_sp(p_user, 'penalty_' || p_kind, v_points, p_ref,
                                      jsonb_build_object('reason', p_reason));

  v_ban := COALESCE(p_ban, p_kind = 'cheating');
  IF v_ban THEN
    SELECT id INTO v_season FROM public.seasons
    WHERE status = 'live' ORDER BY season_number DESC LIMIT 1;
    IF v_season IS NOT NULL THEN
      UPDATE public.season_rankings
      SET banned = true,
          ban_reason = COALESCE(p_reason, p_kind),
          updated_at = now()
      WHERE season_id = v_season AND user_id = p_user;

      INSERT INTO public.notifications (user_id, kind, title, body, link)
      VALUES (p_user, 'season_ban', 'Removed from the season ranking',
              'Your account is under fair-play review and has been removed from this season''s leaderboard.',
              '/seasons');
    END IF;
  END IF;

  RETURN v_points;
END; $fn$;
REVOKE ALL ON FUNCTION public.apply_season_penalty(UUID, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_season_penalty(UUID, TEXT, TEXT, BOOLEAN, TEXT) TO service_role;

-- 102.7 Permanent ELO — K-factor schedule
-- Provisional players (< 15 games) move fast so they find their level quickly; ...
CREATE OR REPLACE FUNCTION public.elo_k_factor(p_rating INT, p_games INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN COALESCE(p_games, 0) < 15 THEN 40
    WHEN COALESCE(p_rating, 0) >= 2400 THEN 12
    WHEN COALESCE(p_rating, 0) >= 1800 THEN 20
    ELSE 24
  END;
$fn$;
GRANT EXECUTE ON FUNCTION public.elo_k_factor(INT, INT) TO anon, authenticated, service_role;

-- Recreated from SECTION 23 with the K-factor schedule
CREATE OR REPLACE FUNCTION public.apply_elo_change(p_game_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_game    RECORD;
  v_w       RECORD;
  v_b       RECORD;
  v_k_w     INT;
  v_k_b     INT;
  v_exp_w   NUMERIC;
  v_exp_b   NUMERIC;
  v_score_w NUMERIC;
  v_new_w   INT;
  v_new_b   INT;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
  IF NOT FOUND
     OR NOT v_game.is_rated
     OR v_game.white_id IS NULL
     OR v_game.black_id IS NULL THEN RETURN; END IF;
  IF v_game.result NOT IN ('white','black','draw') THEN RETURN; END IF;
  IF v_game.elo_applied THEN RETURN; END IF;

  INSERT INTO public.ratings
    (user_id, time_class, rating, peak_rating, games_played, wins, losses, draws)
  VALUES
    (v_game.white_id, v_game.time_class, 100, 100, 0, 0, 0, 0),
    (v_game.black_id, v_game.time_class, 100, 100, 0, 0, 0, 0)
  ON CONFLICT (user_id, time_class) DO NOTHING;

  SELECT * INTO v_w FROM public.ratings
    WHERE user_id = v_game.white_id AND time_class = v_game.time_class;
  SELECT * INTO v_b FROM public.ratings
    WHERE user_id = v_game.black_id AND time_class = v_game.time_class;
  IF v_w IS NULL OR v_b IS NULL THEN RETURN; END IF;

  v_k_w     := public.elo_k_factor(v_w.rating, v_w.games_played);
  v_k_b     := public.elo_k_factor(v_b.rating, v_b.games_played);
  v_exp_w   := 1.0 / (1 + power(10, (v_b.rating - v_w.rating) / 400.0));
  v_exp_b   := 1.0 - v_exp_w;
  v_score_w := CASE v_game.result WHEN 'white' THEN 1 WHEN 'draw' THEN 0.5 ELSE 0 END;

  -- Ratings never fall below zero (the ladder starts at 100).
  v_new_w := GREATEST(0, ROUND(v_w.rating + v_k_w * (v_score_w - v_exp_w)));
  v_new_b := GREATEST(0, ROUND(v_b.rating + v_k_b * ((1 - v_score_w) - v_exp_b)));

  UPDATE public.ratings SET
    rating       = v_new_w,
    peak_rating  = GREATEST(peak_rating, v_new_w),
    games_played = games_played + 1,
    wins         = wins   + CASE WHEN v_game.result = 'white' THEN 1 ELSE 0 END,
    losses       = losses + CASE WHEN v_game.result = 'black' THEN 1 ELSE 0 END,
    draws        = draws  + CASE WHEN v_game.result = 'draw'  THEN 1 ELSE 0 END
  WHERE user_id = v_game.white_id AND time_class = v_game.time_class;

  UPDATE public.ratings SET
    rating       = v_new_b,
    peak_rating  = GREATEST(peak_rating, v_new_b),
    games_played = games_played + 1,
    wins         = wins   + CASE WHEN v_game.result = 'black' THEN 1 ELSE 0 END,
    losses       = losses + CASE WHEN v_game.result = 'white' THEN 1 ELSE 0 END,
    draws        = draws  + CASE WHEN v_game.result = 'draw'  THEN 1 ELSE 0 END
  WHERE user_id = v_game.black_id AND time_class = v_game.time_class;

  INSERT INTO public.rating_history
    (user_id, game_id, time_class, old_rating, new_rating, delta)
  VALUES
    (v_game.white_id, p_game_id, v_game.time_class, v_w.rating, v_new_w, v_new_w - v_w.rating),
    (v_game.black_id, p_game_id, v_game.time_class, v_b.rating, v_new_b, v_new_b - v_b.rating);

  UPDATE public.games SET elo_applied = true WHERE id = p_game_id;

  PERFORM public.apply_iq_change(p_game_id);
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.apply_elo_change(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_elo_change(UUID) TO authenticated, service_role;

-- 102.8 ELO leaderboard — global / country / state / district / friends
-- One RPC serves every scope
CREATE OR REPLACE FUNCTION public.elo_leaderboard(
  p_time_class public.time_class DEFAULT 'rapid',
  p_scope      TEXT DEFAULT 'global',
  p_country    TEXT DEFAULT NULL,
  p_state      TEXT DEFAULT NULL,
  p_district   TEXT DEFAULT NULL,
  p_viewer     UUID DEFAULT NULL,
  p_search     TEXT DEFAULT NULL,
  p_min_games  INT  DEFAULT 5,
  p_limit      INT  DEFAULT 50,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  rank          BIGINT,
  user_id       UUID,
  username      TEXT,
  full_name     TEXT,
  avatar_url    TEXT,
  country       TEXT,
  state         TEXT,
  district      TEXT,
  rating        INT,
  peak_rating   INT,
  games_played  INT,
  wins          INT,
  losses        INT,
  draws         INT,
  win_rate      NUMERIC,
  premium_active BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH scoped AS (
    SELECT r.user_id, r.rating, r.peak_rating, r.games_played,
           r.wins, r.losses, r.draws,
           p.username, p.full_name, p.avatar_url,
           p.country, p.state, p.district,
           COALESCE(p.premium_active, false) AS premium_active
    FROM public.ratings r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.time_class = p_time_class
      AND r.games_played >= GREATEST(COALESCE(p_min_games, 0), 0)
      AND (
        p_scope <> 'friends' OR p_viewer IS NULL OR r.user_id = p_viewer OR EXISTS (
          SELECT 1 FROM public.friends f
          WHERE f.status = 'accepted'
            AND ((f.requester_id = p_viewer AND f.addressee_id = r.user_id)
              OR (f.addressee_id = p_viewer AND f.requester_id = r.user_id))
        )
      )
      AND (p_scope NOT IN ('country','state','district') OR p.country IS NOT DISTINCT FROM p_country)
      AND (p_scope NOT IN ('state','district')          OR p.state   IS NOT DISTINCT FROM p_state)
      AND (p_scope <> 'district'                        OR p.district IS NOT DISTINCT FROM p_district)
      AND (p_search IS NULL OR p.username ILIKE '%' || p_search || '%'
                            OR p.full_name ILIKE '%' || p_search || '%')
  )
  SELECT
    RANK() OVER (ORDER BY s.rating DESC, s.games_played DESC, s.user_id)::BIGINT,
    s.user_id, s.username, s.full_name, s.avatar_url,
    s.country, s.state, s.district,
    s.rating, s.peak_rating, s.games_played, s.wins, s.losses, s.draws,
    CASE WHEN (s.wins + s.losses + s.draws) = 0 THEN NULL
         ELSE ROUND(((s.wins + s.draws / 2.0) / (s.wins + s.losses + s.draws)) * 100, 1)
    END,
    s.premium_active
  FROM scoped s
  ORDER BY s.rating DESC, s.games_played DESC, s.user_id
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$fn$;
GRANT EXECUTE ON FUNCTION public.elo_leaderboard(
  public.time_class, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INT, INT, INT
) TO anon, authenticated;

-- 102.9 Season Points leaderboard — same five scopes
-- Season-banned players are excluded from every scope.
CREATE OR REPLACE FUNCTION public.sp_leaderboard(
  p_season_id UUID DEFAULT NULL,
  p_scope     TEXT DEFAULT 'global',
  p_country   TEXT DEFAULT NULL,
  p_state     TEXT DEFAULT NULL,
  p_district  TEXT DEFAULT NULL,
  p_viewer    UUID DEFAULT NULL,
  p_search    TEXT DEFAULT NULL,
  p_limit     INT  DEFAULT 50,
  p_offset    INT  DEFAULT 0
)
RETURNS TABLE (
  rank           BIGINT,
  prev_rank      INT,
  user_id        UUID,
  username       TEXT,
  full_name      TEXT,
  avatar_url     TEXT,
  country        TEXT,
  state          TEXT,
  district       TEXT,
  season_points  INT,
  rung_id        TEXT,
  rung_index     INT,
  tier_code      TEXT,
  games_played   INT,
  wins           INT,
  losses         INT,
  draws          INT,
  win_rate       NUMERIC,
  best_win_streak INT,
  premium_active BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH season AS (
    SELECT COALESCE(
      p_season_id,
      (SELECT id FROM public.seasons WHERE status = 'live'
        ORDER BY season_number DESC LIMIT 1)
    ) AS id
  ), scoped AS (
    SELECT sr.user_id, sr.prev_rank, sr.season_iq, sr.rung_id, sr.rung_index,
           sr.games_played, sr.wins, sr.losses, sr.draws, sr.best_win_streak,
           p.username, p.full_name, p.avatar_url,
           p.country, p.state, p.district,
           COALESCE(p.premium_active, false) AS premium_active
    FROM public.season_rankings sr
    JOIN season sn ON sn.id = sr.season_id
    JOIN public.profiles p ON p.id = sr.user_id
    WHERE sr.banned = false
      AND (
        p_scope <> 'friends' OR p_viewer IS NULL OR sr.user_id = p_viewer OR EXISTS (
          SELECT 1 FROM public.friends f
          WHERE f.status = 'accepted'
            AND ((f.requester_id = p_viewer AND f.addressee_id = sr.user_id)
              OR (f.addressee_id = p_viewer AND f.requester_id = sr.user_id))
        )
      )
      AND (p_scope NOT IN ('country','state','district') OR p.country IS NOT DISTINCT FROM p_country)
      AND (p_scope NOT IN ('state','district')          OR p.state   IS NOT DISTINCT FROM p_state)
      AND (p_scope <> 'district'                        OR p.district IS NOT DISTINCT FROM p_district)
      AND (p_search IS NULL OR p.username ILIKE '%' || p_search || '%'
                            OR p.full_name ILIKE '%' || p_search || '%')
  )
  SELECT
    RANK() OVER (ORDER BY s.season_iq DESC, s.wins DESC, s.user_id)::BIGINT,
    s.prev_rank,
    s.user_id, s.username, s.full_name, s.avatar_url,
    s.country, s.state, s.district,
    s.season_iq, s.rung_id, s.rung_index, split_part(s.rung_id, '_', 1),
    s.games_played, s.wins, s.losses, s.draws,
    CASE WHEN (s.wins + s.losses + s.draws) = 0 THEN NULL
         ELSE ROUND(((s.wins + s.draws / 2.0) / (s.wins + s.losses + s.draws)) * 100, 1)
    END,
    s.best_win_streak,
    s.premium_active
  FROM scoped s
  ORDER BY s.season_iq DESC, s.wins DESC, s.user_id
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$fn$;
GRANT EXECUTE ON FUNCTION public.sp_leaderboard(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INT, INT
) TO anon, authenticated;

-- 102.10 Player ranking card
-- Everything the profile's ranking section needs in one round trip: permanent E...
CREATE OR REPLACE FUNCTION public.player_ranking_card(
  p_user_id    UUID,
  p_time_class public.time_class DEFAULT 'rapid'
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_p       RECORD;
  v_r       RECORD;
  v_sr      RECORD;
  v_has_elo BOOLEAN := false;
  v_has_sp  BOOLEAN := false;
  v_season  UUID;
  v_result  JSONB;
  v_global  BIGINT;
  v_country BIGINT;
  v_state   BIGINT;
  v_district BIGINT;
  v_sp_rank BIGINT;
BEGIN
  SELECT id, username, full_name, avatar_url, country, state, district,
         career_highest_iq, career_best_rank, career_best_rank_season
    INTO v_p
  FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_r FROM public.ratings
  WHERE user_id = p_user_id AND time_class = p_time_class;
  v_has_elo := FOUND;

  SELECT id INTO v_season FROM public.seasons
  WHERE status = 'live' ORDER BY season_number DESC LIMIT 1;

  SELECT * INTO v_sr FROM public.season_rankings
  WHERE season_id = v_season AND user_id = p_user_id;
  v_has_sp := FOUND;

  -- Scoped ELO placements (NULL when the player has no rating row).
  IF v_has_elo THEN
    SELECT count(*) + 1 INTO v_global FROM public.ratings r2
      JOIN public.profiles p2 ON p2.id = r2.user_id
      WHERE r2.time_class = p_time_class AND r2.rating > v_r.rating;

    SELECT count(*) + 1 INTO v_country FROM public.ratings r2
      JOIN public.profiles p2 ON p2.id = r2.user_id
      WHERE r2.time_class = p_time_class AND r2.rating > v_r.rating
        AND p2.country IS NOT DISTINCT FROM v_p.country;

    SELECT count(*) + 1 INTO v_state FROM public.ratings r2
      JOIN public.profiles p2 ON p2.id = r2.user_id
      WHERE r2.time_class = p_time_class AND r2.rating > v_r.rating
        AND p2.country IS NOT DISTINCT FROM v_p.country
        AND p2.state   IS NOT DISTINCT FROM v_p.state;

    SELECT count(*) + 1 INTO v_district FROM public.ratings r2
      JOIN public.profiles p2 ON p2.id = r2.user_id
      WHERE r2.time_class = p_time_class AND r2.rating > v_r.rating
        AND p2.country  IS NOT DISTINCT FROM v_p.country
        AND p2.state    IS NOT DISTINCT FROM v_p.state
        AND p2.district IS NOT DISTINCT FROM v_p.district;
  END IF;

  IF v_has_sp THEN
    SELECT count(*) + 1 INTO v_sp_rank FROM public.season_rankings sr2
    WHERE sr2.season_id = v_season AND sr2.banned = false
      AND sr2.season_iq > v_sr.season_iq;
  END IF;

  v_result := jsonb_build_object(
    'user_id',    p_user_id,
    'username',   v_p.username,
    'full_name',  v_p.full_name,
    'avatar_url', v_p.avatar_url,
    'country',    v_p.country,
    'state',      v_p.state,
    'district',   v_p.district,
    'elo', CASE WHEN NOT v_has_elo THEN NULL ELSE jsonb_build_object(
      'time_class',    p_time_class,
      'rating',        v_r.rating,
      'peak_rating',   v_r.peak_rating,
      'games_played',  v_r.games_played,
      'wins',          v_r.wins,
      'losses',        v_r.losses,
      'draws',         v_r.draws,
      'global_rank',   v_global,
      'country_rank',  v_country,
      'state_rank',    v_state,
      'district_rank', v_district
    ) END,
    'season', CASE WHEN NOT v_has_sp THEN NULL ELSE jsonb_build_object(
      'season_id',       v_season,
      'season_points',   v_sr.season_iq,
      'rung_id',         v_sr.rung_id,
      'rung_index',      v_sr.rung_index,
      'tier_code',       split_part(v_sr.rung_id, '_', 1),
      'rank',            v_sp_rank,
      'prev_rank',       v_sr.prev_rank,
      'peak_sp',         v_sr.peak_sp,
      'peak_rung_index', v_sr.peak_rung_index,
      'games_played',    v_sr.games_played,
      'wins',            v_sr.wins,
      'losses',          v_sr.losses,
      'draws',           v_sr.draws,
      'best_win_streak', v_sr.best_win_streak,
      'banned',          v_sr.banned
    ) END,
    'career', jsonb_build_object(
      'best_season_rank',   v_p.career_best_rank,
      'best_season_number', v_p.career_best_rank_season,
      'highest_sp',         v_p.career_highest_iq,
      'seasons_played',     (SELECT count(*) FROM public.season_history WHERE user_id = p_user_id),
      'seasons_won',        (SELECT count(*) FROM public.season_history
                              WHERE user_id = p_user_id AND final_rank = 1)
    )
  );

  RETURN v_result;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.player_ranking_card(UUID, public.time_class)
  TO anon, authenticated;

-- 102.11 Hall of Fame
-- Permanent record of past season finishers
CREATE OR REPLACE FUNCTION public.hall_of_fame(
  p_season_number INT DEFAULT NULL,
  p_limit         INT DEFAULT 100,
  p_offset        INT DEFAULT 0
)
RETURNS TABLE (
  season_number INT,
  season_name   TEXT,
  ended_at      TIMESTAMPTZ,
  final_rank    INT,
  user_id       UUID,
  username      TEXT,
  full_name     TEXT,
  avatar_url    TEXT,
  country       TEXT,
  season_points INT,
  tier_code     TEXT,
  rung_id       TEXT,
  rewards       TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT
    s.season_number,
    s.name,
    sh.ended_at,
    sh.final_rank,
    sh.user_id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.country,
    sh.season_iq,
    COALESCE(split_part(sh.rung_id, '_', 1), lower(COALESCE(sh.tier, ''))),
    sh.rung_id,
    sh.rewards
  FROM public.season_history sh
  JOIN public.seasons  s ON s.id = sh.season_id
  JOIN public.profiles p ON p.id = sh.user_id
  WHERE (p_season_number IS NULL OR s.season_number = p_season_number)
  ORDER BY s.season_number DESC, sh.final_rank ASC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 100), 200), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$fn$;
GRANT EXECUTE ON FUNCTION public.hall_of_fame(INT, INT, INT) TO anon, authenticated;

-- Champions only — one row per completed season, for the HoF header.
CREATE OR REPLACE FUNCTION public.hall_of_fame_champions(p_limit INT DEFAULT 24)
RETURNS TABLE (
  season_number INT,
  season_name   TEXT,
  ended_at      TIMESTAMPTZ,
  user_id       UUID,
  username      TEXT,
  avatar_url    TEXT,
  country       TEXT,
  season_points INT,
  tier_code     TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT s.season_number, s.name, sh.ended_at, sh.user_id,
         p.username, p.avatar_url, p.country, sh.season_iq,
         COALESCE(split_part(sh.rung_id, '_', 1), lower(COALESCE(sh.tier, '')))
  FROM public.season_history sh
  JOIN public.seasons  s ON s.id = sh.season_id
  JOIN public.profiles p ON p.id = sh.user_id
  WHERE sh.final_rank = 1
  ORDER BY s.season_number DESC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 24), 100), 1);
$fn$;
GRANT EXECUTE ON FUNCTION public.hall_of_fame_champions(INT) TO anon, authenticated;

-- 102.12 Season-end tier rewards
-- Grants the tier reward bundle + placement rewards to every ranked player of a...
CREATE OR REPLACE FUNCTION public.award_season_tier_rewards(p_season_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_count INT := 0;
BEGIN
  WITH bundles AS (
    SELECT sr.user_id,
           sr.rank,
           split_part(sr.rung_id, '_', 1) AS tier_code,
           CASE split_part(sr.rung_id, '_', 1)
             WHEN 'bronze'      THEN ARRAY['badge_bronze']
             WHEN 'silver'      THEN ARRAY['badge_silver','coins']
             WHEN 'gold'        THEN ARRAY['coins','avatar_premium']
             WHEN 'platinum'    THEN ARRAY['coins','frame_platinum','title_platinum']
             WHEN 'diamond'     THEN ARRAY['badge_animated_diamond']
             WHEN 'master'      THEN ARRAY['theme_master']
             WHEN 'grandmaster' THEN ARRAY['badge_crown','border_grandmaster',
                                           'hall_of_fame','trophy_season']
             ELSE ARRAY[]::TEXT[]
           END
           ||
           CASE
             WHEN sr.rank = 1            THEN ARRAY['top_1']
             WHEN sr.rank <= 3           THEN ARRAY['top_3']
             WHEN sr.rank <= 10          THEN ARRAY['top_10']
             WHEN sr.rank <= 100         THEN ARRAY['top_100']
             ELSE ARRAY[]::TEXT[]
           END AS bundle
    FROM public.season_rankings sr
    WHERE sr.season_id = p_season_id AND sr.banned = false AND sr.rank IS NOT NULL
  )
  UPDATE public.season_rankings sr
  SET rewards = ARRAY(SELECT DISTINCT unnest(sr.rewards || b.bundle))
  FROM bundles b
  WHERE sr.season_id = p_season_id AND sr.user_id = b.user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $fn$;
REVOKE ALL ON FUNCTION public.award_season_tier_rewards(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_season_tier_rewards(UUID) TO service_role;

-- 102.13 Admin RPCs
CREATE OR REPLACE FUNCTION public.admin_get_season_config()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_row RECORD;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT * INTO v_row FROM public.season_config WHERE id;
  RETURN jsonb_build_object(
    'sp_rates',              v_row.sp_rates,
    'upset_bonus',           v_row.upset_bonus,
    'penalties',             v_row.penalties,
    'ladder',                v_row.ladder,
    'demotion_grace_sp',     v_row.demotion_grace_sp,
    'min_moves_for_sp',      v_row.min_moves_for_sp,
    'daily_sp_cap',          v_row.daily_sp_cap,
    'repeat_opponent_limit', v_row.repeat_opponent_limit,
    'repeat_opponent_pct',   v_row.repeat_opponent_pct,
    'updated_at',            v_row.updated_at
  );
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.admin_get_season_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_season_config() TO authenticated, service_role;

-- Partial update: pass only the keys you want to change.
CREATE OR REPLACE FUNCTION public.admin_update_season_config(p_patch JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;

  UPDATE public.season_config SET
    sp_rates              = COALESCE(p_patch -> 'sp_rates', sp_rates),
    upset_bonus           = COALESCE(p_patch -> 'upset_bonus', upset_bonus),
    penalties             = COALESCE(p_patch -> 'penalties', penalties),
    ladder                = COALESCE(p_patch -> 'ladder', ladder),
    demotion_grace_sp     = COALESCE((p_patch ->> 'demotion_grace_sp')::INT, demotion_grace_sp),
    min_moves_for_sp      = COALESCE((p_patch ->> 'min_moves_for_sp')::INT, min_moves_for_sp),
    daily_sp_cap          = COALESCE((p_patch ->> 'daily_sp_cap')::INT, daily_sp_cap),
    repeat_opponent_limit = COALESCE((p_patch ->> 'repeat_opponent_limit')::INT, repeat_opponent_limit),
    repeat_opponent_pct   = COALESCE((p_patch ->> 'repeat_opponent_pct')::INT, repeat_opponent_pct),
    updated_at            = now(),
    updated_by            = auth.uid()
  WHERE id;

  RETURN public.admin_get_season_config();
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.admin_update_season_config(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_season_config(JSONB) TO authenticated, service_role;

-- Manual SP adjustment (compensation or sanction). Always ledgered.
CREATE OR REPLACE FUNCTION public.admin_adjust_season_points(
  p_user_id UUID,
  p_points  INT,
  p_reason  TEXT
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_applied INT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF COALESCE(p_points, 0) = 0 THEN RETURN 0; END IF;

  v_applied := public._season_award_sp(
    p_user_id, 'admin_adjust', p_points,
    'admin:' || auth.uid()::text || ':' || extract(epoch from now())::bigint::text,
    jsonb_build_object('reason', p_reason, 'by', auth.uid())
  );

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (p_user_id, 'rank_adjustment',
          CASE WHEN p_points > 0 THEN 'Season Points added' ELSE 'Season Points removed' END,
          COALESCE(p_reason, 'An administrator adjusted your season total.'),
          '/seasons');

  RETURN v_applied;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_season_points(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_season_points(UUID, INT, TEXT) TO authenticated, service_role;

-- Season ban / unban for the live season.
CREATE OR REPLACE FUNCTION public.admin_set_season_ban(
  p_user_id UUID,
  p_banned  BOOLEAN,
  p_reason  TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_season UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;

  SELECT id INTO v_season FROM public.seasons
  WHERE status = 'live' ORDER BY season_number DESC LIMIT 1;
  IF v_season IS NULL THEN RAISE EXCEPTION 'No live season'; END IF;

  UPDATE public.season_rankings
  SET banned = p_banned, ban_reason = p_reason, updated_at = now()
  WHERE season_id = v_season AND user_id = p_user_id;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.admin_set_season_ban(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_season_ban(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

-- Ranking analytics for the admin dashboard.
CREATE OR REPLACE FUNCTION public.admin_ranking_analytics()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_season UUID;
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;

  SELECT id INTO v_season FROM public.seasons
  WHERE status = 'live' ORDER BY season_number DESC LIMIT 1;

  SELECT jsonb_build_object(
    'season_id', v_season,
    'ranked_players', (SELECT count(*) FROM public.season_rankings
                        WHERE season_id = v_season AND banned = false),
    'banned_players', (SELECT count(*) FROM public.season_rankings
                        WHERE season_id = v_season AND banned = true),
    'active_players', (SELECT count(*) FROM public.season_rankings
                        WHERE season_id = v_season AND games_played > 0 AND banned = false),
    'games_counted',  (SELECT COALESCE(sum(games_played), 0) / 2 FROM public.season_rankings
                        WHERE season_id = v_season),
    'sp_awarded',     (SELECT COALESCE(sum(points), 0) FROM public.season_iq_events
                        WHERE season_id = v_season AND points > 0),
    'sp_deducted',    (SELECT COALESCE(sum(-points), 0) FROM public.season_iq_events
                        WHERE season_id = v_season AND points < 0),
    'tier_distribution', (
      SELECT COALESCE(jsonb_object_agg(t.tier_code, t.n), '{}'::jsonb)
      FROM (
        SELECT split_part(rung_id, '_', 1) AS tier_code, count(*) AS n
        FROM public.season_rankings
        WHERE season_id = v_season AND banned = false
        GROUP BY 1
      ) t
    ),
    'elo_distribution', (
      SELECT COALESCE(jsonb_object_agg(b.bucket, b.n), '{}'::jsonb)
      FROM (
        SELECT (rating / 200 * 200)::TEXT AS bucket, count(*) AS n
        FROM public.ratings WHERE time_class = 'rapid' AND games_played >= 5
        GROUP BY 1
      ) b
    )
  ) INTO v_result;