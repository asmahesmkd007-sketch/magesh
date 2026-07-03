-- =====================================================================
-- ChessOx — Master Schema (Idempotent)
-- =====================================================================
-- Safe to run on a fresh OR existing Supabase project.
-- Uses IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE throughout
-- so re-running never errors on duplicate objects.
--===========================================================

-- =====================================================================
-- SECTION 1: ENUMS
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    EXECUTE 'CREATE TYPE public.app_role AS ENUM (''admin'', ''moderator'', ''user'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'premium_tier') THEN
    EXECUTE 'CREATE TYPE public.premium_tier AS ENUM (''free'', ''gold'', ''platinum'', ''maharaja'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'game_result') THEN
    EXECUTE 'CREATE TYPE public.game_result AS ENUM (''white'', ''black'', ''draw'', ''ongoing'', ''aborted'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'time_class') THEN
    EXECUTE 'CREATE TYPE public.time_class AS ENUM (''bullet'', ''blitz'', ''rapid'', ''classical'', ''correspondence'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'friend_status') THEN
    EXECUTE 'CREATE TYPE public.friend_status AS ENUM (''pending'', ''accepted'', ''blocked'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'club_role') THEN
    EXECUTE 'CREATE TYPE public.club_role AS ENUM (''owner'', ''admin'', ''member'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    EXECUTE 'CREATE TYPE public.subscription_status AS ENUM (''active'', ''cancelled'', ''past_due'', ''trialing'', ''inactive'')';
  END IF;
END $$;

-- =====================================================================
-- SECTION 2: UTILITY TRIGGER FUNCTION
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- SECTION 3: PROFILES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  bio          TEXT DEFAULT '',
  country      TEXT DEFAULT 'India',
  avatar_url    TEXT,
  banner_url    TEXT,
  website       TEXT,
  youtube_url   TEXT,
  instagram_url TEXT,
  facebook_url  TEXT,
  twitter_url   TEXT,
  title        TEXT,
  premium_tier public.premium_tier NOT NULL DEFAULT 'free',
  last_seen    TIMESTAMPTZ DEFAULT now(),
  is_online    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  iq_rating INT NOT NULL DEFAULT 100
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are publicly viewable" ON public.profiles;
CREATE POLICY "Profiles are publicly viewable"
  ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- SECTION 4: USER ROLES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles"
  ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

-- =====================================================================
-- SECTION 5: RATINGS
-- (Default 100)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ratings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  time_class   public.time_class NOT NULL,
  rating       INT NOT NULL DEFAULT 100,
  peak_rating  INT NOT NULL DEFAULT 100,
  games_played INT NOT NULL DEFAULT 0,
  wins         INT NOT NULL DEFAULT 0,
  losses       INT NOT NULL DEFAULT 0,
  draws        INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, time_class)
);
GRANT SELECT ON public.ratings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ratings public read" ON public.ratings;
CREATE POLICY "Ratings public read"
  ON public.ratings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users update own ratings" ON public.ratings;
CREATE POLICY "Users update own ratings"
  ON public.ratings FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own ratings" ON public.ratings;
CREATE POLICY "Users insert own ratings"
  ON public.ratings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- SECTION 6: GAMES
-- (All writes via RPCs or service-role server fn.)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.games (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  white_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  black_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  host_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  white_username   TEXT,
  black_username   TEXT,
  white_rating     INT,
  black_rating     INT,
  pgn              TEXT NOT NULL DEFAULT '',
  fen              TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  turn             TEXT NOT NULL DEFAULT 'w',
  status           TEXT NOT NULL DEFAULT 'waiting',
  result           public.game_result NOT NULL DEFAULT 'ongoing',
  winner_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  draw_offered_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  end_reason       TEXT,
  time_class       public.time_class NOT NULL DEFAULT 'rapid',
  time_control     TEXT NOT NULL DEFAULT '10+0',
  initial_seconds  INT NOT NULL DEFAULT 300,
  increment_seconds INT NOT NULL DEFAULT 0,
  white_time_ms    INT NOT NULL DEFAULT 300000,
  black_time_ms    INT NOT NULL DEFAULT 300000,
  last_move_at     TIMESTAMPTZ,
  moves_count      INT NOT NULL DEFAULT 0,
  opening          TEXT,
  is_rated         BOOLEAN NOT NULL DEFAULT true,
  vs_computer      BOOLEAN NOT NULL DEFAULT false,
  elo_applied      BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  iq_applied BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_games_white   ON public.games(white_id);
CREATE INDEX IF NOT EXISTS idx_games_black   ON public.games(black_id);
CREATE INDEX IF NOT EXISTS idx_games_created ON public.games(created_at DESC);
GRANT SELECT ON public.games TO anon;
GRANT SELECT ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Games are public" ON public.games;
CREATE POLICY "Games are public"
  ON public.games FOR SELECT TO anon, authenticated USING (true);

-- =====================================================================
-- SECTION 7: GAME MOVES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.game_moves (
  id          BIGSERIAL PRIMARY KEY,
  game_id     UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  ply         INT NOT NULL,
  san         TEXT NOT NULL,
  uci         TEXT NOT NULL,
  fen_after   TEXT NOT NULL,
  by_user     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  time_left_ms INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, ply)
);
GRANT SELECT ON public.game_moves TO anon, authenticated;
GRANT ALL ON public.game_moves TO service_role;
ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moves readable" ON public.game_moves;
CREATE POLICY "moves readable"
  ON public.game_moves FOR SELECT TO anon, authenticated USING (true);

-- =====================================================================
-- SECTION 8: GAME CHAT
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.game_chat (
  id         BIGSERIAL PRIMARY KEY,
  game_id    UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT NOT NULL,
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.game_chat TO anon;
GRANT SELECT, INSERT ON public.game_chat TO authenticated;
GRANT ALL ON public.game_chat TO service_role;
ALTER TABLE public.game_chat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat readable" ON public.game_chat;
CREATE POLICY "chat readable"
  ON public.game_chat FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "chat insert self" ON public.game_chat;
CREATE POLICY "chat insert self"
  ON public.game_chat FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- =====================================================================
-- SECTION 9: MATCHMAKING POOL
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.matchmaking_pool (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username         TEXT NOT NULL,
  rating           INT NOT NULL DEFAULT 100,
  time_class       TEXT NOT NULL DEFAULT 'rapid',
  time_control     TEXT NOT NULL DEFAULT '10+0',
  initial_seconds  INT NOT NULL DEFAULT 600,
  increment_seconds INT NOT NULL DEFAULT 0,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE, UPDATE ON public.matchmaking_pool TO authenticated;
GRANT ALL ON public.matchmaking_pool TO service_role;
ALTER TABLE public.matchmaking_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pool readable" ON public.matchmaking_pool;
CREATE POLICY "pool readable"
  ON public.matchmaking_pool FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pool own insert" ON public.matchmaking_pool;
CREATE POLICY "pool own insert"
  ON public.matchmaking_pool FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "pool own delete" ON public.matchmaking_pool;
CREATE POLICY "pool own delete"
  ON public.matchmaking_pool FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "pool own update" ON public.matchmaking_pool;
CREATE POLICY "pool own update"
  ON public.matchmaking_pool FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- =====================================================================
-- SECTION 10: PUZZLES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.puzzles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fen        TEXT NOT NULL,
  moves      TEXT NOT NULL,
  rating     INT NOT NULL DEFAULT 1500,
  themes     TEXT[] NOT NULL DEFAULT '{}',
  popularity INT NOT NULL DEFAULT 0,
  theme      TEXT NOT NULL DEFAULT 'Tactics',
  goal       TEXT NOT NULL DEFAULT 'Best move',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON public.puzzles(rating);
GRANT SELECT ON public.puzzles TO anon, authenticated;
GRANT ALL ON public.puzzles TO service_role;
ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Puzzles public read" ON public.puzzles;
CREATE POLICY "Puzzles public read"
  ON public.puzzles FOR SELECT USING (true);

-- =====================================================================
-- SECTION 11: PUZZLE ATTEMPTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.puzzle_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_id     UUID NOT NULL REFERENCES public.puzzles(id) ON DELETE CASCADE,
  solved        BOOLEAN NOT NULL,
  time_ms       INT NOT NULL DEFAULT 0,
  rating_change INT NOT NULL DEFAULT 0,
  puzzle_rating INT,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user ON public.puzzle_attempts(user_id, attempted_at DESC);
GRANT SELECT, INSERT ON public.puzzle_attempts TO authenticated;
GRANT ALL ON public.puzzle_attempts TO service_role;
ALTER TABLE public.puzzle_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own attempts" ON public.puzzle_attempts;
CREATE POLICY "Users view own attempts"
  ON public.puzzle_attempts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own attempts" ON public.puzzle_attempts;
CREATE POLICY "Users insert own attempts"
  ON public.puzzle_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- SECTION 12: FRIENDS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.friends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        public.friend_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friends TO authenticated;
GRANT ALL ON public.friends TO service_role;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own friendships" ON public.friends;
CREATE POLICY "Users see own friendships"
  ON public.friends FOR SELECT
  USING (auth.uid() IN (requester_id, addressee_id));
DROP POLICY IF EXISTS "Users create friend requests" ON public.friends;
CREATE POLICY "Users create friend requests"
  ON public.friends FOR INSERT WITH CHECK (auth.uid() = requester_id);
DROP POLICY IF EXISTS "Users respond to own friendships" ON public.friends;
CREATE POLICY "Users respond to own friendships"
  ON public.friends FOR UPDATE
  USING (auth.uid() IN (requester_id, addressee_id));
DROP POLICY IF EXISTS "Users delete own friendships" ON public.friends;
CREATE POLICY "Users delete own friendships"
  ON public.friends FOR DELETE
  USING (auth.uid() IN (requester_id, addressee_id));
DROP TRIGGER IF EXISTS trg_friends_updated_at ON public.friends;
CREATE TRIGGER trg_friends_updated_at
  BEFORE UPDATE ON public.friends
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- SECTION 13: CLUBS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.clubs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT DEFAULT '',
  banner_url     TEXT,
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_count   INT NOT NULL DEFAULT 1,
  is_public      BOOLEAN NOT NULL DEFAULT true,
  cover_gradient TEXT,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clubs TO anon, authenticated;
GRANT INSERT, UPDATE ON public.clubs TO authenticated;
GRANT ALL ON public.clubs TO service_role;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public clubs viewable" ON public.clubs;
CREATE POLICY "Public clubs viewable"
  ON public.clubs FOR SELECT USING (is_public OR auth.uid() = owner_id);
DROP POLICY IF EXISTS "Authenticated create clubs" ON public.clubs;
CREATE POLICY "Authenticated create clubs"
  ON public.clubs FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Owners update clubs" ON public.clubs;
CREATE POLICY "Owners update clubs"
  ON public.clubs FOR UPDATE USING (auth.uid() = owner_id);
DROP TRIGGER IF EXISTS trg_clubs_updated_at ON public.clubs;
CREATE TRIGGER trg_clubs_updated_at
  BEFORE UPDATE ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- SECTION 14: CLUB MEMBERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.club_members (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id  UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role     public.club_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, user_id)
);
GRANT SELECT ON public.club_members TO anon, authenticated;
GRANT INSERT, DELETE, UPDATE ON public.club_members TO authenticated;
GRANT ALL ON public.club_members TO service_role;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Club members visible" ON public.club_members;
CREATE POLICY "Club members visible"
  ON public.club_members FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users join clubs" ON public.club_members;
CREATE POLICY "Users join clubs"
  ON public.club_members FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users leave clubs" ON public.club_members;
CREATE POLICY "Users leave clubs"
  ON public.club_members FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
-- SECTION 15: TOURNAMENTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tournaments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  format          TEXT NOT NULL DEFAULT 'swiss',
  time_control    TEXT NOT NULL DEFAULT '5+3',
  prize_pool      TEXT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ,
  max_players     INT NOT NULL DEFAULT 256,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'upcoming',
  cover_gradient  TEXT,
  winner_display  TEXT,
  player_count    INT NOT NULL DEFAULT 0,
  entry_fee_coins INT NOT NULL DEFAULT 0,
  prize_1st       INT NOT NULL DEFAULT 0,
  prize_2nd       INT NOT NULL DEFAULT 0,
  prize_3rd       INT NOT NULL DEFAULT 0,
  prizes_distributed BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tournaments TO anon, authenticated;
GRANT INSERT, UPDATE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tournaments public read" ON public.tournaments;
CREATE POLICY "Tournaments public read"
  ON public.tournaments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins create tournaments" ON public.tournaments;
CREATE POLICY "Admins create tournaments"
  ON public.tournaments FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins update tournaments" ON public.tournaments;
CREATE POLICY "Admins update tournaments"
  ON public.tournaments FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- SECTION 16: TOURNAMENT ENTRIES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tournament_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score          NUMERIC NOT NULL DEFAULT 0,
  rank           INT,
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_tx_id  UUID,
  UNIQUE (tournament_id, user_id)
);
GRANT SELECT ON public.tournament_entries TO anon;
GRANT SELECT, INSERT, DELETE ON public.tournament_entries TO authenticated;
GRANT ALL ON public.tournament_entries TO service_role;
ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Entries public read" ON public.tournament_entries;
CREATE POLICY "Entries public read"
  ON public.tournament_entries FOR SELECT USING (true);
DROP POLICY IF EXISTS "entries own insert" ON public.tournament_entries;
CREATE POLICY "entries own insert"
  ON public.tournament_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "entries own delete" ON public.tournament_entries;
CREATE POLICY "entries own delete"
  ON public.tournament_entries FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================================
-- SECTION 17: NEWS ARTICLES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.news_articles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  excerpt       TEXT,
  body          TEXT NOT NULL,
  cover_image   TEXT,
  author_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published     BOOLEAN NOT NULL DEFAULT false,
  published_at  TIMESTAMPTZ,
  category      TEXT,
  read_time_min INT,
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  cover_gradient TEXT,
  author_name   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.news_articles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.news_articles TO authenticated;
GRANT ALL ON public.news_articles TO service_role;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Published news public" ON public.news_articles;
CREATE POLICY "Published news public"
  ON public.news_articles FOR SELECT
  USING (published OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage news ins" ON public.news_articles;
CREATE POLICY "Admins manage news ins"
  ON public.news_articles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage news upd" ON public.news_articles;
CREATE POLICY "Admins manage news upd"
  ON public.news_articles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage news del" ON public.news_articles;
CREATE POLICY "Admins manage news del"
  ON public.news_articles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- SECTION 18: NOTIFICATIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own notifications" ON public.notifications;
CREATE POLICY "Users see own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "users insert own notif" ON public.notifications;
CREATE POLICY "users insert own notif"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "service can insert notifications" ON public.notifications;
CREATE POLICY "service can insert notifications"
  ON public.notifications FOR INSERT TO service_role WITH CHECK (true);

-- =====================================================================
-- SECTION 19: SUBSCRIPTIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                   public.premium_tier NOT NULL DEFAULT 'free',
  status                 public.subscription_status NOT NULL DEFAULT 'inactive',
  provider               TEXT,
  provider_subscription_id TEXT,
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own subscription" ON public.subscriptions;
CREATE POLICY "Users view own subscription"
  ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_subs_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subs_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- SECTION 20: RATING HISTORY
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.rating_history (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id    UUID REFERENCES public.games(id) ON DELETE SET NULL,
  time_class public.time_class NOT NULL,
  old_rating INT NOT NULL,
  new_rating INT NOT NULL,
  delta      INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rating_history_user ON public.rating_history(user_id, created_at DESC);
GRANT SELECT ON public.rating_history TO authenticated;
GRANT ALL ON public.rating_history TO service_role;
ALTER TABLE public.rating_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own rating history" ON public.rating_history;
CREATE POLICY "users read own rating history"
  ON public.rating_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================================
-- SECTION 21: SIGNUP TRIGGER
-- Creates profile, role, ratings, subscription, and wallet for each
-- new auth.users row. Uses CREATE OR REPLACE so it is safe to re-run.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_username TEXT;
  v_display  TEXT;
  v_base     TEXT;
  v_suffix   INT := 0;
BEGIN
  v_display := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'Player'
  );
  v_base := lower(regexp_replace(COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1),
    'player'
  ), '[^a-z0-9_]', '', 'g'));
  IF length(v_base) < 3 THEN v_base := 'player' || substr(NEW.id::text, 1, 6); END IF;
  v_username := v_base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_suffix   := v_suffix + 1;
    v_username := v_base || v_suffix::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (NEW.id, v_username, v_display, NEW.raw_user_meta_data->>'avatar_url');

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');

  INSERT INTO public.ratings (user_id, time_class) VALUES
    (NEW.id, 'bullet'),
    (NEW.id, 'blitz'),
    (NEW.id, 'rapid'),
    (NEW.id, 'classical');

  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'inactive');

  -- Create wallet with welcome bonus
  INSERT INTO public.wallets (user_id, balance, total_earned)
  VALUES (NEW.id, 50, 50);

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, description, idempotency_key)
  VALUES
    (NEW.id, 'welcome_bonus', 50, 50, 'Welcome to ChessOx! Here are 50 bonus coins.',
     'welcome_' || NEW.id::text);

  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- SECTION 22: HELPER RPC — CURRENT RATING
-- =====================================================================
CREATE OR REPLACE FUNCTION public.current_rating(
  p_user_id    UUID,
  p_time_class public.time_class
) RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT rating FROM public.ratings
      WHERE user_id = p_user_id AND time_class = p_time_class),
    100
  );
$$;
REVOKE EXECUTE ON FUNCTION public.current_rating(UUID, public.time_class) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_rating(UUID, public.time_class) TO authenticated, service_role;

-- =====================================================================
-- SECTION 23: APPLY ELO CHANGE (v2)
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.apply_elo_change(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_elo_change(UUID) TO authenticated, service_role;

-- =====================================================================
-- SECTION 24: RPC — CREATE CHALLENGE
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_challenge(
  p_time_class      public.time_class,
  p_time_control    TEXT,
  p_initial_seconds INT,
  p_increment_seconds INT,
  p_is_rated        BOOLEAN,
  p_host_color      TEXT DEFAULT 'random'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_username   TEXT;
  v_rating     INT;
  v_game_id    UUID;
  v_host_white BOOLEAN :=
    CASE p_host_color WHEN 'w' THEN true WHEN 'b' THEN false ELSE (random() < 0.5) END;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_initial_seconds  < 10 OR p_initial_seconds  > 86400 THEN RAISE EXCEPTION 'Invalid time control'; END IF;
  IF p_increment_seconds < 0 OR p_increment_seconds > 180   THEN RAISE EXCEPTION 'Invalid increment';    END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  v_rating := public.current_rating(v_uid, p_time_class);

  INSERT INTO public.games (
    host_id,
    white_id,        black_id,
    white_username,  black_username,
    white_rating,    black_rating,
    status, result, time_class, time_control,
    initial_seconds, increment_seconds,
    white_time_ms,   black_time_ms,
    is_rated, fen, turn
  ) VALUES (
    v_uid,
    CASE WHEN v_host_white THEN v_uid ELSE NULL END,
    CASE WHEN v_host_white THEN NULL ELSE v_uid END,
    CASE WHEN v_host_white THEN v_username ELSE NULL END,
    CASE WHEN v_host_white THEN NULL ELSE v_username END,
    CASE WHEN v_host_white THEN v_rating ELSE NULL END,
    CASE WHEN v_host_white THEN NULL ELSE v_rating END,
    'waiting', 'ongoing', p_time_class, p_time_control,
    p_initial_seconds, p_increment_seconds,
    p_initial_seconds * 1000, p_initial_seconds * 1000,
    p_is_rated,
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w'
  ) RETURNING id INTO v_game_id;

  RETURN v_game_id;
END; $$;
REVOKE EXECUTE ON FUNCTION
  public.create_challenge(public.time_class, TEXT, INT, INT, BOOLEAN, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.create_challenge(public.time_class, TEXT, INT, INT, BOOLEAN, TEXT)
  TO authenticated, service_role;

-- =====================================================================
-- SECTION 25: RPC — JOIN GAME
-- =====================================================================
CREATE OR REPLACE FUNCTION public.join_game(p_game_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_username TEXT;
  v_game     public.games%ROWTYPE;
  v_rating   INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.status <> 'waiting' THEN RAISE EXCEPTION 'Game already started'; END IF;
  IF v_game.white_id = v_uid OR v_game.black_id = v_uid THEN RETURN p_game_id; END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  v_rating := public.current_rating(v_uid, v_game.time_class);

  IF v_game.white_id IS NULL THEN
    UPDATE public.games SET
      white_id = v_uid, white_username = v_username, white_rating = v_rating,
      status = 'active', last_move_at = now()
    WHERE id = p_game_id;
  ELSIF v_game.black_id IS NULL THEN
    UPDATE public.games SET
      black_id = v_uid, black_username = v_username, black_rating = v_rating,
      status = 'active', last_move_at = now()
    WHERE id = p_game_id;
  ELSE
    RAISE EXCEPTION 'Game is full';
  END IF;

  RETURN p_game_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.join_game(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_game(UUID) TO authenticated, service_role;

-- =====================================================================
-- SECTION 26: RPC — MATCHMAKE
-- =====================================================================
CREATE OR REPLACE FUNCTION public.matchmake(
  p_time_class        public.time_class,
  p_time_control      TEXT,
  p_initial_seconds   INT,
  p_increment_seconds INT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid        UUID    := auth.uid();
  v_username   TEXT;
  v_rating     INT;
  v_opp        RECORD;
  v_game_id    UUID;
  v_i_am_white BOOLEAN := (random() < 0.5);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  -- REPAIR: If username is null or empty, generate one and ensure profile exists
  IF v_username IS NULL OR trim(v_username) = '' THEN
    v_username := 'Player_' || substr(v_uid::text, 1, 6);
    
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (v_uid, v_username, 'Player')
    ON CONFLICT (id) DO UPDATE SET 
      username = EXCLUDED.username
    WHERE public.profiles.username IS NULL OR trim(public.profiles.username) = '';
  END IF;

  -- SAFEGUARD: Final check before continuing
  IF v_username IS NULL OR trim(v_username) = '' THEN
    RAISE EXCEPTION 'Failed to generate a valid username for matchmaking';
  END IF;

  v_rating := public.current_rating(v_uid, p_time_class);
  IF v_rating IS NULL THEN 
    v_rating := 100;
  END IF;

  SELECT * INTO v_opp
  FROM public.matchmaking_pool
  WHERE time_control = p_time_control
    AND time_class   = p_time_class::text
    AND user_id     <> v_uid
  ORDER BY joined_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.games (
      host_id,
      white_id,       black_id,
      white_username, black_username,
      white_rating,   black_rating,
      status, result, time_class, time_control,
      initial_seconds, increment_seconds,
      white_time_ms,  black_time_ms,
      is_rated, fen, turn, last_move_at
    ) VALUES (
      v_uid,
      CASE WHEN v_i_am_white THEN v_uid       ELSE v_opp.user_id END,
      CASE WHEN v_i_am_white THEN v_opp.user_id ELSE v_uid       END,
      CASE WHEN v_i_am_white THEN v_username  ELSE v_opp.username END,
      CASE WHEN v_i_am_white THEN v_opp.username ELSE v_username  END,
      CASE WHEN v_i_am_white THEN v_rating    ELSE v_opp.rating  END,
      CASE WHEN v_i_am_white THEN v_opp.rating ELSE v_rating     END,
      'active', 'ongoing', p_time_class, p_time_control,
      p_initial_seconds, p_increment_seconds,
      p_initial_seconds * 1000, p_initial_seconds * 1000,
      true,
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w', now()
    ) RETURNING id INTO v_game_id;

    DELETE FROM public.matchmaking_pool
    WHERE user_id IN (v_uid, v_opp.user_id);

    RETURN v_game_id;
  END IF;

  INSERT INTO public.matchmaking_pool
    (user_id, username, rating, time_class, time_control, initial_seconds, increment_seconds)
  VALUES
    (v_uid, v_username, v_rating, p_time_class::text, p_time_control,
     p_initial_seconds, p_increment_seconds)
  ON CONFLICT (user_id) DO UPDATE SET
    time_class        = EXCLUDED.time_class,
    time_control      = EXCLUDED.time_control,
    initial_seconds   = EXCLUDED.initial_seconds,
    increment_seconds = EXCLUDED.increment_seconds,
    rating            = EXCLUDED.rating,
    joined_at         = now();

  RETURN NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION
  public.matchmake(public.time_class, TEXT, INT, INT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.matchmake(public.time_class, TEXT, INT, INT)
  TO authenticated, service_role;

-- =====================================================================
-- SECTION 27: RPC — LEAVE QUEUE
-- =====================================================================
CREATE OR REPLACE FUNCTION public.leave_queue()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.matchmaking_pool WHERE user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.leave_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_queue() TO authenticated, service_role;

-- =====================================================================
-- SECTION 28: RPC — RESIGN GAME
-- =====================================================================
CREATE OR REPLACE FUNCTION public.resign_game(p_game_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_game   public.games%ROWTYPE;
  v_result public.game_result;
  v_winner UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.status <> 'active' THEN RETURN; END IF;
  IF v_uid <> v_game.white_id AND v_uid <> v_game.black_id THEN
    RAISE EXCEPTION 'Not a player';
  END IF;

  IF v_uid = v_game.white_id THEN
    v_result := 'black'; v_winner := v_game.black_id;
  ELSE
    v_result := 'white'; v_winner := v_game.white_id;
  END IF;

  UPDATE public.games SET
    status     = 'finished',
    result     = v_result,
    winner_id  = v_winner,
    end_reason = 'resignation',
    ended_at   = now()
  WHERE id = p_game_id;

  PERFORM public.apply_elo_change(p_game_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.resign_game(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resign_game(UUID) TO authenticated, service_role;

-- =====================================================================
-- SECTION 29: RPC — RESPOND DRAW (offer or accept)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.respond_draw(p_game_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_game public.games%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.status <> 'active' THEN RETURN 'inactive'; END IF;
  IF v_uid <> v_game.white_id AND v_uid <> v_game.black_id THEN
    RAISE EXCEPTION 'Not a player';
  END IF;

  IF v_game.draw_offered_by IS NOT NULL AND v_game.draw_offered_by <> v_uid THEN
    UPDATE public.games SET
      status          = 'finished',
      result          = 'draw',
      end_reason      = 'agreement',
      ended_at        = now(),
      draw_offered_by = NULL
    WHERE id = p_game_id;
    PERFORM public.apply_elo_change(p_game_id);
    RETURN 'accepted';
  ELSE
    UPDATE public.games SET draw_offered_by = v_uid WHERE id = p_game_id;
    RETURN 'offered';
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.respond_draw(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_draw(UUID) TO authenticated, service_role;

-- =====================================================================
-- SECTION 30: RPC — CLAIM TIMEOUT
-- =====================================================================
CREATE OR REPLACE FUNCTION public.claim_timeout(p_game_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_game       public.games%ROWTYPE;
  v_elapsed_ms BIGINT;
  v_to_move_ms INT;
  v_result     public.game_result;
  v_winner     UUID;
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

  IF v_game.turn = 'w' THEN
    v_result := 'black'; v_winner := v_game.black_id;
  ELSE
    v_result := 'white'; v_winner := v_game.white_id;
  END IF;

  UPDATE public.games SET
    status       = 'finished',
    result       = v_result,
    winner_id    = v_winner,
    end_reason   = 'timeout',
    ended_at     = now(),
    white_time_ms = CASE WHEN v_game.turn = 'w' THEN 0 ELSE v_game.white_time_ms END,
    black_time_ms = CASE WHEN v_game.turn = 'b' THEN 0 ELSE v_game.black_time_ms END
  WHERE id = p_game_id;

  PERFORM public.apply_elo_change(p_game_id);
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION public.claim_timeout(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_timeout(UUID) TO authenticated, service_role;

-- =====================================================================
-- SECTION 31: RPC — SAVE COMPUTER GAME
-- =====================================================================
CREATE OR REPLACE FUNCTION public.save_computer_game(
  p_my_color    TEXT,
  p_result      public.game_result,
  p_pgn         TEXT,
  p_moves_count INT,
  p_engine_name TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_username TEXT;
  v_game_id  UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_my_color NOT IN ('w','b') THEN RAISE EXCEPTION 'Invalid color'; END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.games (
    white_id,       black_id,
    white_username, black_username,
    pgn, result, status,
    time_class, time_control,
    moves_count, is_rated, vs_computer, ended_at
  ) VALUES (
    CASE WHEN p_my_color = 'w' THEN v_uid ELSE NULL END,
    CASE WHEN p_my_color = 'b' THEN v_uid ELSE NULL END,
    CASE WHEN p_my_color = 'w' THEN v_username ELSE p_engine_name END,
    CASE WHEN p_my_color = 'b' THEN v_username ELSE p_engine_name END,
    p_pgn, p_result, 'finished',
    'rapid', 'casual',
    GREATEST(p_moves_count, 0), false, true, now()
  ) RETURNING id INTO v_game_id;

  RETURN v_game_id;
END; $$;
REVOKE EXECUTE ON FUNCTION
  public.save_computer_game(TEXT, public.game_result, TEXT, INT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.save_computer_game(TEXT, public.game_result, TEXT, INT, TEXT)
  TO authenticated, service_role;

-- =====================================================================
-- SECTION 32: REALTIME PUBLICATIONS
-- Each table is added only if not already a member of the publication.
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'games') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'game_moves') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_moves;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'game_chat') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_chat;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'matchmaking_pool') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matchmaking_pool;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friends') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friends;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- =====================================================================
-- SECTION 33: WALLETS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.wallets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance      INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned INT NOT NULL DEFAULT 0,
  total_spent  INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON public.wallets(user_id);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own wallet" ON public.wallets;
CREATE POLICY "Users view own wallet"
  ON public.wallets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_wallets_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- SECTION 34: WALLET TRANSACTIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  amount          INT NOT NULL,
  balance_after   INT NOT NULL,
  description     TEXT NOT NULL,
  reference_id    TEXT,
  idempotency_key TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON public.wallet_transactions(user_id, created_at DESC);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own transactions" ON public.wallet_transactions;
CREATE POLICY "Users view own transactions"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- FK from tournament_entries.payment_tx_id (added only if not present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_entries_payment_tx'
  ) THEN
    ALTER TABLE public.tournament_entries
      ADD CONSTRAINT fk_entries_payment_tx
      FOREIGN KEY (payment_tx_id) REFERENCES public.wallet_transactions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================================
-- SECTION 35: RPC — CREDIT PREMIUM BONUS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.credit_premium_bonus(
  p_plan_name       TEXT,
  p_base_coins      INT,
  p_idempotency_key TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_bonus     INT  := 10;
  v_total     INT  := p_base_coins + v_bonus;
  v_wallet    RECORD;
  v_new_bal   INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_base_coins <= 0 THEN RAISE EXCEPTION 'Invalid coin amount'; END IF;

  IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key) THEN
    RETURN;
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance, total_earned) VALUES (v_uid, 0, 0);
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
  END IF;

  v_new_bal := v_wallet.balance + v_total;

  UPDATE public.wallets SET
    balance      = v_new_bal,
    total_earned = total_earned + v_total,
    updated_at   = now()
  WHERE user_id = v_uid;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, description, reference_id, idempotency_key)
  VALUES
    (v_uid, 'premium_bonus', v_total, v_new_bal,
     p_plan_name || ' plan: ' || p_base_coins || ' coins + ' || v_bonus || ' bonus',
     p_plan_name, p_idempotency_key);

  UPDATE public.subscriptions
  SET tier = lower(p_plan_name)::public.premium_tier, status = 'active', updated_at = now()
  WHERE user_id = v_uid;

  UPDATE public.profiles
  SET premium_tier = lower(p_plan_name)::public.premium_tier
  WHERE id = v_uid;
END; $$;
REVOKE EXECUTE ON FUNCTION public.credit_premium_bonus(TEXT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credit_premium_bonus(TEXT, INT, TEXT) TO authenticated, service_role;

-- =====================================================================
-- SECTION 36: RPC — JOIN TOURNAMENT PAID
-- =====================================================================
CREATE OR REPLACE FUNCTION public.join_tournament_paid(p_tournament_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_tournament RECORD;
  v_wallet     RECORD;
  v_new_bal    INT;
  v_tx_id      UUID;
  v_ikey       TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_tournament.status <> 'upcoming' THEN RAISE EXCEPTION 'Registration is closed'; END IF;
  IF v_tournament.player_count >= v_tournament.max_players THEN
    RAISE EXCEPTION 'Tournament is full';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_entries
    WHERE tournament_id = p_tournament_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Already registered';
  END IF;

  v_ikey := 'tourn_entry_' || v_uid::text || '_' || p_tournament_id::text;

  IF v_tournament.entry_fee_coins > 0 THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;

    IF v_wallet.balance < v_tournament.entry_fee_coins THEN
      RAISE EXCEPTION 'Insufficient wallet balance';
    END IF;

    v_new_bal := v_wallet.balance - v_tournament.entry_fee_coins;

    UPDATE public.wallets SET
      balance     = v_new_bal,
      total_spent = total_spent + v_tournament.entry_fee_coins,
      updated_at  = now()
    WHERE user_id = v_uid;

    INSERT INTO public.wallet_transactions
      (user_id, type, amount, balance_after, description, reference_id, idempotency_key)
    VALUES
      (v_uid, 'tournament_entry', -v_tournament.entry_fee_coins, v_new_bal,
       'Entry fee: ' || v_tournament.name,
       p_tournament_id::text, v_ikey)
    RETURNING id INTO v_tx_id;
  END IF;

  INSERT INTO public.tournament_entries (tournament_id, user_id, payment_tx_id)
  VALUES (p_tournament_id, v_uid, v_tx_id);

  UPDATE public.tournaments SET player_count = player_count + 1 WHERE id = p_tournament_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.join_tournament_paid(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_tournament_paid(UUID) TO authenticated, service_role;

-- =====================================================================
-- SECTION 37: RPC — DISTRIBUTE TOURNAMENT PRIZES (admin only)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.distribute_tournament_prizes(
  p_tournament_id UUID,
  p_1st_user_id   UUID,
  p_2nd_user_id   UUID DEFAULT NULL,
  p_3rd_user_id   UUID DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_tournament RECORD;
  v_users      UUID[] := ARRAY[p_1st_user_id, p_2nd_user_id, p_3rd_user_id];
  v_places     TEXT[] := ARRAY['1st', '2nd', '3rd'];
  v_amounts    INT[];
  v_w          RECORD;
  v_bal        INT;
  v_ikey       TEXT;
  i            INT;
BEGIN
  -- NULL uid = service_role call (backend). Non-null uid must be an admin.
  IF v_uid IS NOT NULL AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_tournament.prizes_distributed THEN RAISE EXCEPTION 'Prizes already distributed'; END IF;

  v_amounts := ARRAY[v_tournament.prize_1st, v_tournament.prize_2nd, v_tournament.prize_3rd];

  FOR i IN 1..3 LOOP
    IF v_users[i] IS NOT NULL AND v_amounts[i] > 0 THEN
      v_ikey := 'prize_' || v_places[i] || '_' || p_tournament_id::text;

      IF NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE idempotency_key = v_ikey) THEN
        SELECT * INTO v_w FROM public.wallets WHERE user_id = v_users[i] FOR UPDATE;
        IF NOT FOUND THEN
          INSERT INTO public.wallets (user_id) VALUES (v_users[i]);
          SELECT * INTO v_w FROM public.wallets WHERE user_id = v_users[i] FOR UPDATE;
        END IF;

        v_bal := v_w.balance + v_amounts[i];

        UPDATE public.wallets SET
          balance      = v_bal,
          total_earned = total_earned + v_amounts[i],
          updated_at   = now()
        WHERE user_id = v_users[i];

        INSERT INTO public.wallet_transactions
          (user_id, type, amount, balance_after, description, reference_id, idempotency_key)
        VALUES
          (v_users[i], 'tournament_prize', v_amounts[i], v_bal,
           v_places[i] || ' place prize: ' || v_tournament.name,
           p_tournament_id::text, v_ikey);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.tournaments SET
    prizes_distributed = true,
    status             = 'finished'
  WHERE id = p_tournament_id;
END; $$;
REVOKE EXECUTE ON FUNCTION
  public.distribute_tournament_prizes(UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.distribute_tournament_prizes(UUID, UUID, UUID, UUID) TO authenticated, service_role;

-- =====================================================================
-- SECTION 38: RPC — ADMIN CREDIT / DEBIT WALLET
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_credit_wallet(
  p_target_user_id UUID,
  p_amount         INT,
  p_description    TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wallet  RECORD;
  v_new_bal INT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id) VALUES (p_target_user_id);
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_target_user_id FOR UPDATE;
  END IF;

  v_new_bal := v_wallet.balance + p_amount;
  UPDATE public.wallets SET
    balance      = v_new_bal,
    total_earned = total_earned + p_amount,
    updated_at   = now()
  WHERE user_id = p_target_user_id;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  VALUES
    (p_target_user_id, 'admin_credit', p_amount, v_new_bal, p_description,
     auth.uid()::text);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_credit_wallet(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_credit_wallet(UUID, INT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_debit_wallet(
  p_target_user_id UUID,
  p_amount         INT,
  p_description    TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wallet  RECORD;
  v_new_bal INT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_wallet.balance < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_bal := v_wallet.balance - p_amount;
  UPDATE public.wallets SET
    balance     = v_new_bal,
    total_spent = total_spent + p_amount,
    updated_at  = now()
  WHERE user_id = p_target_user_id;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  VALUES
    (p_target_user_id, 'admin_debit', -p_amount, v_new_bal, p_description,
     auth.uid()::text);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_debit_wallet(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_debit_wallet(UUID, INT, TEXT) TO authenticated, service_role;

-- =====================================================================
-- SECTION 39: REALTIME FOR WALLET TABLES
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'wallets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'wallet_transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;
  END IF;
END $$;

-- =====================================================================
-- SECTION 40: PUBLIC ROOMS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.public_rooms (
  id                TEXT PRIMARY KEY,
  host_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'waiting'
                      CHECK (status IN ('waiting','guest_joined','starting','playing','finished','closed')),
  time_control      TEXT NOT NULL DEFAULT '10+0',
  time_class        TEXT NOT NULL DEFAULT 'rapid',
  initial_seconds   INT  NOT NULL DEFAULT 600,
  increment_seconds INT  NOT NULL DEFAULT 0,
  color_mode        TEXT NOT NULL DEFAULT 'random'
                      CHECK (color_mode IN ('random','host_white','host_black')),
  is_rated          BOOLEAN NOT NULL DEFAULT true,
  game_id           UUID REFERENCES public.games(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 hours'),
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_public_rooms_host   ON public.public_rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_public_rooms_guest  ON public.public_rooms(guest_id);
CREATE INDEX IF NOT EXISTS idx_public_rooms_status ON public.public_rooms(status) WHERE status IN ('waiting','guest_joined');

GRANT SELECT ON public.public_rooms TO authenticated;
GRANT ALL    ON public.public_rooms TO service_role;
ALTER TABLE public.public_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room members and open rooms are visible" ON public.public_rooms;
CREATE POLICY "Room members and open rooms are visible"
  ON public.public_rooms FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR guest_id = auth.uid() OR status = 'waiting');

-- =====================================================================
-- SECTION 41: create_public_room RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_public_room(
  p_time_control      TEXT    DEFAULT '10+0',
  p_time_class        TEXT    DEFAULT 'rapid',
  p_initial_seconds   INT     DEFAULT 600,
  p_increment_seconds INT     DEFAULT 0,
  p_color_mode        TEXT    DEFAULT 'random',
  p_is_rated          BOOLEAN DEFAULT true
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_room_id TEXT;
  v_attempt INT  := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Auto-close stale expired rooms owned by this user so they can create again
  UPDATE public.public_rooms
  SET status = 'closed', finished_at = now()
  WHERE host_id = v_uid
    AND status IN ('waiting', 'guest_joined', 'starting')
    AND expires_at < now();

  -- One active room per host
  IF EXISTS (
    SELECT 1 FROM public.public_rooms
    WHERE host_id = v_uid AND status IN ('waiting', 'guest_joined', 'starting')
  ) THEN
    RAISE EXCEPTION 'You already have an active room. Leave it first.';
  END IF;

  -- Generate unique 6-char uppercase hex room ID (e.g. "A1B2C3")
  LOOP
    v_room_id := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.public_rooms WHERE id = v_room_id);
    v_attempt := v_attempt + 1;
    IF v_attempt > 20 THEN RAISE EXCEPTION 'Failed to generate unique room ID'; END IF;
  END LOOP;

  INSERT INTO public.public_rooms (
    id, host_id, status,
    time_control, time_class, initial_seconds, increment_seconds,
    color_mode, is_rated
  ) VALUES (
    v_room_id, v_uid, 'waiting',
    p_time_control, p_time_class, p_initial_seconds, p_increment_seconds,
    p_color_mode, p_is_rated
  );

  RETURN v_room_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.create_public_room(TEXT,TEXT,INT,INT,TEXT,BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_public_room(TEXT,TEXT,INT,INT,TEXT,BOOLEAN) TO authenticated;

-- =====================================================================
-- SECTION 42: join_public_room RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.join_public_room(
  p_room_id TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_room public.public_rooms;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_room FROM public.public_rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;
  IF v_room.expires_at < now() THEN
    RAISE EXCEPTION 'This room has expired';
  END IF;
  IF v_room.host_id = v_uid THEN
    RAISE EXCEPTION 'You are the host of this room';
  END IF;
  -- Already joined as guest — idempotent no-op
  IF v_room.guest_id = v_uid THEN RETURN; END IF;

  -- Check full before checking status so callers get consistent "Room is full"
  -- and can branch to join_room_queue instead.
  IF v_room.guest_id IS NOT NULL OR v_room.status = 'guest_joined' THEN
    RAISE EXCEPTION 'Room is full';
  END IF;
  IF v_room.status != 'waiting' THEN
    RAISE EXCEPTION 'Room is not accepting players';
  END IF;

  UPDATE public.public_rooms
  SET guest_id = v_uid, status = 'guest_joined'
  WHERE id = p_room_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.join_public_room(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.join_public_room(TEXT) TO authenticated;

-- =====================================================================
-- SECTION 43: leave_public_room RPC (with queue auto-promotion)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.leave_public_room(
  p_room_id TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_room     public.public_rooms;
  v_next_uid UUID;
  v_pos      INT;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT * INTO v_room FROM public.public_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_room.status IN ('playing', 'finished', 'closed') THEN RETURN; END IF;

  IF v_room.host_id = v_uid THEN
    -- Host leaving: clear queue and close the room
    DELETE FROM public.room_queue WHERE room_id = p_room_id;
    UPDATE public.public_rooms
    SET status = 'closed', finished_at = now()
    WHERE id = p_room_id;

  ELSIF v_room.guest_id = v_uid THEN
    -- Guest leaving: promote first queued user if one exists
    SELECT user_id INTO v_next_uid
    FROM public.room_queue
    WHERE room_id = p_room_id
    ORDER BY position ASC
    LIMIT 1;

    IF FOUND THEN
      DELETE FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_next_uid;
      UPDATE public.room_queue SET position = position - 1 WHERE room_id = p_room_id;
      UPDATE public.public_rooms
      SET guest_id = v_next_uid, status = 'guest_joined'
      WHERE id = p_room_id;
    ELSE
      UPDATE public.public_rooms
      SET guest_id = NULL, status = 'waiting'
      WHERE id = p_room_id;
    END IF;

  ELSE
    -- User is in the queue — remove and reorder
    SELECT position INTO v_pos FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_uid;
    IF FOUND THEN
      DELETE FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_uid;
      UPDATE public.room_queue SET position = position - 1
      WHERE room_id = p_room_id AND position > v_pos;
    END IF;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.leave_public_room(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.leave_public_room(TEXT) TO authenticated;

-- =====================================================================
-- SECTION 44: start_room_match RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.start_room_match(
  p_room_id TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_room     public.public_rooms;
  v_white_id UUID;
  v_black_id UUID;
  v_game_id  UUID;
  v_tc       public.time_class;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_room FROM public.public_rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.host_id != v_uid THEN RAISE EXCEPTION 'Only the host can start the match'; END IF;
  IF v_room.guest_id IS NULL   THEN RAISE EXCEPTION 'Waiting for an opponent to join'; END IF;
  IF v_room.status != 'guest_joined' THEN RAISE EXCEPTION 'Room is not ready to start'; END IF;

  -- Assign colors
  IF v_room.color_mode = 'host_white' THEN
    v_white_id := v_room.host_id;  v_black_id := v_room.guest_id;
  ELSIF v_room.color_mode = 'host_black' THEN
    v_white_id := v_room.guest_id; v_black_id := v_room.host_id;
  ELSE
    IF random() > 0.5 THEN
      v_white_id := v_room.host_id;  v_black_id := v_room.guest_id;
    ELSE
      v_white_id := v_room.guest_id; v_black_id := v_room.host_id;
    END IF;
  END IF;

  -- Derive time class from initial_seconds
  v_tc := CASE
    WHEN v_room.initial_seconds < 180  THEN 'bullet'::public.time_class
    WHEN v_room.initial_seconds < 600  THEN 'blitz'::public.time_class
    WHEN v_room.initial_seconds < 1800 THEN 'rapid'::public.time_class
    ELSE                                    'classical'::public.time_class
  END;

  -- Create game with both players already set to active
  INSERT INTO public.games (
    white_id, black_id,
    white_username, black_username,
    white_rating,   black_rating,
    status, result,
    time_class, time_control, initial_seconds, increment_seconds,
    white_time_ms,  black_time_ms,
    is_rated, vs_computer,
    fen, pgn
  ) VALUES (
    v_white_id, v_black_id,
    (SELECT username FROM public.profiles WHERE id = v_white_id),
    (SELECT username FROM public.profiles WHERE id = v_black_id),
    (SELECT COALESCE(rating, 100) FROM public.ratings WHERE user_id = v_white_id AND time_class = v_tc LIMIT 1),
    (SELECT COALESCE(rating, 100) FROM public.ratings WHERE user_id = v_black_id AND time_class = v_tc LIMIT 1),
    'active', 'ongoing',
    v_tc, v_room.time_control, v_room.initial_seconds, v_room.increment_seconds,
    v_room.initial_seconds * 1000, v_room.initial_seconds * 1000,
    v_room.is_rated, false,
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ''
  )
  RETURNING id INTO v_game_id;

  UPDATE public.public_rooms
  SET status = 'playing', game_id = v_game_id, started_at = now()
  WHERE id = p_room_id;

  RETURN v_game_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.start_room_match(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.start_room_match(TEXT) TO authenticated;

-- =====================================================================
-- SECTION 45: REALTIME FOR PUBLIC ROOMS
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'public_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.public_rooms;
  END IF;
END $$;

-- =====================================================================
-- SECTION 46: USER STREAKS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_login_streak  INT         NOT NULL DEFAULT 0,
  best_login_streak     INT         NOT NULL DEFAULT 0,
  last_login_date       DATE,
  current_match_streak  INT         NOT NULL DEFAULT 0,
  best_match_streak     INT         NOT NULL DEFAULT 0,
  last_match_date       DATE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_streaks TO authenticated;
GRANT ALL    ON public.user_streaks TO service_role;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own streaks" ON public.user_streaks;
CREATE POLICY "Users view own streaks"
  ON public.user_streaks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =====================================================================
-- SECTION 47: update_login_streak RPC
-- Called from the frontend on every SIGNED_IN auth event.
-- Idempotent: calling multiple times on the same calendar day is a no-op.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_login_streak()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_row   public.user_streaks;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  -- Ensure the row exists
  INSERT INTO public.user_streaks (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.user_streaks WHERE user_id = v_uid FOR UPDATE;

  -- Already updated today — idempotent exit
  IF v_row.last_login_date = v_today THEN RETURN; END IF;

  IF v_row.last_login_date = v_today - 1 THEN
    -- Consecutive day → extend streak
    UPDATE public.user_streaks SET
      current_login_streak = v_row.current_login_streak + 1,
      best_login_streak    = GREATEST(v_row.best_login_streak, v_row.current_login_streak + 1),
      last_login_date      = v_today,
      updated_at           = now()
    WHERE user_id = v_uid;
  ELSE
    -- Streak broken or first-ever login → reset to 1
    UPDATE public.user_streaks SET
      current_login_streak = 1,
      best_login_streak    = GREATEST(v_row.best_login_streak, 1),
      last_login_date      = v_today,
      updated_at           = now()
    WHERE user_id = v_uid;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.update_login_streak() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_login_streak() TO authenticated;

-- =====================================================================
-- SECTION 48: match streak trigger
-- Fires automatically when games.ended_at is set (NULL → non-NULL).
-- Updates both players' match streaks.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_match_streak_for_user(p_uid UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_row   public.user_streaks;
BEGIN
  IF p_uid IS NULL THEN RETURN; END IF;

  INSERT INTO public.user_streaks (user_id)
  VALUES (p_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.user_streaks WHERE user_id = p_uid FOR UPDATE;

  -- Already updated today — idempotent exit
  IF v_row.last_match_date = v_today THEN RETURN; END IF;

  IF v_row.last_match_date = v_today - 1 THEN
    UPDATE public.user_streaks SET
      current_match_streak = v_row.current_match_streak + 1,
      best_match_streak    = GREATEST(v_row.best_match_streak, v_row.current_match_streak + 1),
      last_match_date      = v_today,
      updated_at           = now()
    WHERE user_id = p_uid;
  ELSE
    UPDATE public.user_streaks SET
      current_match_streak = 1,
      best_match_streak    = GREATEST(v_row.best_match_streak, 1),
      last_match_date      = v_today,
      updated_at           = now()
    WHERE user_id = p_uid;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.update_match_streak_for_user(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_match_streak_for_user(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_game_finished_streak()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only fires on the transition NULL → non-NULL (game just ended)
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
    PERFORM public.update_match_streak_for_user(NEW.white_id);
    PERFORM public.update_match_streak_for_user(NEW.black_id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_game_finished_streak ON public.games;
CREATE TRIGGER trg_game_finished_streak
  AFTER UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.handle_game_finished_streak();

-- =====================================================================
-- SECTION 49: REALTIME FOR USER STREAKS
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_streaks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_streaks;
  END IF;
END $$;

-- =====================================================================
-- SECTION 50: RPC — SAVE COMPUTER GAME (with moves)
-- Replaces the old 5-param version so individual moves are persisted.
-- p_moves is JSONB array of {ply, san, uci, fen_after} objects.
-- =====================================================================
DROP FUNCTION IF EXISTS public.save_computer_game(TEXT, public.game_result, TEXT, INT, TEXT);
CREATE OR REPLACE FUNCTION public.save_computer_game(
  p_my_color    TEXT,
  p_result      public.game_result,
  p_pgn         TEXT,
  p_moves_count INT,
  p_engine_name TEXT,
  p_moves       JSONB DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_username TEXT;
  v_game_id  UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_my_color NOT IN ('w','b') THEN RAISE EXCEPTION 'Invalid color'; END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.games (
    white_id,       black_id,
    white_username, black_username,
    pgn, result, status,
    time_class, time_control,
    moves_count, is_rated, vs_computer, ended_at
  ) VALUES (
    CASE WHEN p_my_color = 'w' THEN v_uid ELSE NULL END,
    CASE WHEN p_my_color = 'b' THEN v_uid ELSE NULL END,
    CASE WHEN p_my_color = 'w' THEN v_username ELSE p_engine_name END,
    CASE WHEN p_my_color = 'b' THEN v_username ELSE p_engine_name END,
    p_pgn, p_result, 'finished',
    'rapid', 'casual',
    GREATEST(p_moves_count, 0), false, true, now()
  ) RETURNING id INTO v_game_id;

  IF p_moves IS NOT NULL AND jsonb_array_length(p_moves) > 0 THEN
    INSERT INTO public.game_moves (game_id, ply, san, uci, fen_after)
    SELECT
      v_game_id,
      (m->>'ply')::INT,
      m->>'san',
      m->>'uci',
      m->>'fen_after'
    FROM jsonb_array_elements(p_moves) AS m;
  END IF;

  RETURN v_game_id;
END; $$;
REVOKE EXECUTE ON FUNCTION
  public.save_computer_game(TEXT, public.game_result, TEXT, INT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.save_computer_game(TEXT, public.game_result, TEXT, INT, TEXT, JSONB)
  TO authenticated, service_role;

-- =====================================================================
-- SECTION 51: RPC — SAVE LOCAL GAME
-- Persists a finished pass-and-play game. The logged-in user is
-- associated with p_my_color so the game appears in their history.
-- p_moves is JSONB array of {ply, san, uci, fen_after} objects.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.save_local_game(
  p_my_color        TEXT,
  p_opponent_name   TEXT,
  p_result          public.game_result,
  p_end_reason      TEXT,
  p_pgn             TEXT,
  p_moves_count     INT,
  p_moves           JSONB DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_username TEXT;
  v_game_id  UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_my_color NOT IN ('w','b') THEN RAISE EXCEPTION 'Invalid color'; END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.games (
    white_id,       black_id,
    white_username, black_username,
    pgn, result, end_reason, status,
    time_class, time_control,
    moves_count, is_rated, vs_computer, ended_at
  ) VALUES (
    CASE WHEN p_my_color = 'w' THEN v_uid ELSE NULL END,
    CASE WHEN p_my_color = 'b' THEN v_uid ELSE NULL END,
    CASE WHEN p_my_color = 'w' THEN v_username ELSE p_opponent_name END,
    CASE WHEN p_my_color = 'b' THEN v_username ELSE p_opponent_name END,
    p_pgn, p_result, p_end_reason, 'finished',
    'casual', 'local',
    GREATEST(p_moves_count, 0), false, false, now()
  ) RETURNING id INTO v_game_id;

  IF p_moves IS NOT NULL AND jsonb_array_length(p_moves) > 0 THEN
    INSERT INTO public.game_moves (game_id, ply, san, uci, fen_after)
    SELECT
      v_game_id,
      (m->>'ply')::INT,
      m->>'san',
      m->>'uci',
      m->>'fen_after'
    FROM jsonb_array_elements(p_moves) AS m;
  END IF;

  RETURN v_game_id;
END; $$;
REVOKE EXECUTE ON FUNCTION
  public.save_local_game(TEXT, TEXT, public.game_result, TEXT, TEXT, INT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.save_local_game(TEXT, TEXT, public.game_result, TEXT, TEXT, INT, JSONB)
  TO authenticated, service_role;

-- =====================================================================
-- SECTION 52: PERFORMANCE INDEXES FOR MATCH HISTORY
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_games_white_ended
  ON public.games (white_id, ended_at DESC)
  WHERE ended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_black_ended
  ON public.games (black_id, ended_at DESC)
  WHERE ended_at IS NOT NULL;

-- =====================================================================
-- SECTION 53: ENRICH game_moves + FIX RPCs
-- Adds fen_before and move-flag columns to game_moves.
-- Recreates save_computer_game and save_local_game with p_final_fen
-- and a richer p_moves JSONB format that includes the new fields.
-- =====================================================================

-- Add new columns to game_moves (safe to re-run)
ALTER TABLE public.game_moves
  ADD COLUMN IF NOT EXISTS fen_before   TEXT,
  ADD COLUMN IF NOT EXISTS is_capture   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_check     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_castling  BOOLEAN NOT NULL DEFAULT false;

-- Recreate save_computer_game with p_final_fen + enriched move insert
DROP FUNCTION IF EXISTS public.save_computer_game(TEXT, public.game_result, TEXT, INT, TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.save_computer_game(
  p_my_color    TEXT,
  p_result      public.game_result,
  p_pgn         TEXT,
  p_moves_count INT,
  p_engine_name TEXT,
  p_final_fen   TEXT   DEFAULT NULL,
  p_moves       JSONB  DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_username TEXT;
  v_game_id  UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_my_color NOT IN ('w','b') THEN RAISE EXCEPTION 'Invalid color'; END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.games (
    white_id,       black_id,
    white_username, black_username,
    pgn, fen, result, status,
    time_class, time_control,
    moves_count, is_rated, vs_computer, ended_at
  ) VALUES (
    CASE WHEN p_my_color = 'w' THEN v_uid ELSE NULL END,
    CASE WHEN p_my_color = 'b' THEN v_uid ELSE NULL END,
    CASE WHEN p_my_color = 'w' THEN v_username ELSE p_engine_name END,
    CASE WHEN p_my_color = 'b' THEN v_username ELSE p_engine_name END,
    p_pgn,
    COALESCE(p_final_fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
    p_result, 'finished',
    'rapid', 'casual',
    GREATEST(p_moves_count, 0), false, true, now()
  ) RETURNING id INTO v_game_id;

  IF p_moves IS NOT NULL AND jsonb_array_length(p_moves) > 0 THEN
    INSERT INTO public.game_moves
      (game_id, ply, san, uci, fen_before, fen_after,
       by_user, is_capture, is_check, is_promotion, is_castling)
    SELECT
      v_game_id,
      (m->>'ply')::INT,
      m->>'san',
      m->>'uci',
      m->>'fen_before',
      m->>'fen_after',
      CASE WHEN m->>'by_user' IS NOT NULL THEN (m->>'by_user')::UUID ELSE NULL END,
      COALESCE((m->>'is_capture')::BOOLEAN,   false),
      COALESCE((m->>'is_check')::BOOLEAN,     false),
      COALESCE((m->>'is_promotion')::BOOLEAN, false),
      COALESCE((m->>'is_castling')::BOOLEAN,  false)
    FROM jsonb_array_elements(p_moves) AS m;
  END IF;

  RETURN v_game_id;
END; $$;
REVOKE EXECUTE ON FUNCTION
  public.save_computer_game(TEXT, public.game_result, TEXT, INT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.save_computer_game(TEXT, public.game_result, TEXT, INT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;

-- Recreate save_local_game with p_final_fen + enriched move insert
DROP FUNCTION IF EXISTS public.save_local_game(TEXT, TEXT, public.game_result, TEXT, TEXT, INT, JSONB);
CREATE OR REPLACE FUNCTION public.save_local_game(
  p_my_color      TEXT,
  p_opponent_name TEXT,
  p_result        public.game_result,
  p_end_reason    TEXT,
  p_pgn           TEXT,
  p_moves_count   INT,
  p_final_fen     TEXT  DEFAULT NULL,
  p_moves         JSONB DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_username TEXT;
  v_game_id  UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_my_color NOT IN ('w','b') THEN RAISE EXCEPTION 'Invalid color'; END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.games (
    white_id,       black_id,
    white_username, black_username,
    pgn, fen, result, end_reason, status,
    time_class, time_control,
    moves_count, is_rated, vs_computer, ended_at
  ) VALUES (
    CASE WHEN p_my_color = 'w' THEN v_uid ELSE NULL END,
    CASE WHEN p_my_color = 'b' THEN v_uid ELSE NULL END,
    CASE WHEN p_my_color = 'w' THEN v_username ELSE p_opponent_name END,
    CASE WHEN p_my_color = 'b' THEN v_username ELSE p_opponent_name END,
    p_pgn,
    COALESCE(p_final_fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
    p_result, p_end_reason, 'finished',
    'casual', 'local',
    GREATEST(p_moves_count, 0), false, false, now()
  ) RETURNING id INTO v_game_id;

  IF p_moves IS NOT NULL AND jsonb_array_length(p_moves) > 0 THEN
    INSERT INTO public.game_moves
      (game_id, ply, san, uci, fen_before, fen_after,
       by_user, is_capture, is_check, is_promotion, is_castling)
    SELECT
      v_game_id,
      (m->>'ply')::INT,
      m->>'san',
      m->>'uci',
      m->>'fen_before',
      m->>'fen_after',
      CASE WHEN m->>'by_user' IS NOT NULL THEN (m->>'by_user')::UUID ELSE NULL END,
      COALESCE((m->>'is_capture')::BOOLEAN,   false),
      COALESCE((m->>'is_check')::BOOLEAN,     false),
      COALESCE((m->>'is_promotion')::BOOLEAN, false),
      COALESCE((m->>'is_castling')::BOOLEAN,  false)
    FROM jsonb_array_elements(p_moves) AS m;
  END IF;

  RETURN v_game_id;
END; $$;
REVOKE EXECUTE ON FUNCTION
  public.save_local_game(TEXT, TEXT, public.game_result, TEXT, TEXT, INT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.save_local_game(TEXT, TEXT, public.game_result, TEXT, TEXT, INT, TEXT, JSONB)
  TO authenticated, service_role;

-- =====================================================================
-- SECTION 54: GAME ANALYSIS — schema additions
-- =====================================================================

-- Additional columns on game_moves for engine annotations
ALTER TABLE public.game_moves
  ADD COLUMN IF NOT EXISTS eval_before_cp  INT,
  ADD COLUMN IF NOT EXISTS eval_after_cp   INT,
  ADD COLUMN IF NOT EXISTS best_move_san   TEXT,
  ADD COLUMN IF NOT EXISTS classification  TEXT
    CHECK (classification IN ('best','excellent','good','inaccuracy','mistake','blunder')),
  ADD COLUMN IF NOT EXISTS time_used_ms    INT;

-- Per-game analysis summary table
CREATE TABLE IF NOT EXISTS public.game_analysis (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  accuracy_white   NUMERIC(5,2),
  accuracy_black   NUMERIC(5,2),
  blunders_white   INT NOT NULL DEFAULT 0,
  mistakes_white   INT NOT NULL DEFAULT 0,
  blunders_black   INT NOT NULL DEFAULT 0,
  mistakes_black   INT NOT NULL DEFAULT 0,
  opening_name     TEXT,
  analysis_status  TEXT NOT NULL DEFAULT 'pending'
    CHECK (analysis_status IN ('pending','running','done','failed')),
  analyzed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS game_analysis_game_id_idx
  ON public.game_analysis (game_id);

-- RLS for game_analysis
ALTER TABLE public.game_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read analysis for their games" ON public.game_analysis;
CREATE POLICY "users can read analysis for their games"
  ON public.game_analysis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_analysis.game_id
        AND (g.white_id = auth.uid() OR g.black_id = auth.uid())
    )
  );

-- RPC: save analysis results for a game (called by client after local engine run)
CREATE OR REPLACE FUNCTION public.save_game_analysis(
  p_game_id        UUID,
  p_accuracy_white NUMERIC,
  p_accuracy_black NUMERIC,
  p_blunders_white INT,
  p_mistakes_white INT,
  p_blunders_black INT,
  p_mistakes_black INT,
  p_opening_name   TEXT DEFAULT NULL,
  p_move_evals     JSONB DEFAULT NULL  -- [{ply, eval_before_cp, eval_after_cp, best_move_san, classification}]
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Verify caller is a participant of this game
  IF NOT EXISTS (
    SELECT 1 FROM public.games
    WHERE id = p_game_id AND (white_id = v_uid OR black_id = v_uid)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  INSERT INTO public.game_analysis (
    game_id, accuracy_white, accuracy_black,
    blunders_white, mistakes_white,
    blunders_black, mistakes_black,
    opening_name, analysis_status, analyzed_at
  ) VALUES (
    p_game_id, p_accuracy_white, p_accuracy_black,
    p_blunders_white, p_mistakes_white,
    p_blunders_black, p_mistakes_black,
    p_opening_name, 'done', now()
  )
  ON CONFLICT (game_id) DO UPDATE SET
    accuracy_white  = EXCLUDED.accuracy_white,
    accuracy_black  = EXCLUDED.accuracy_black,
    blunders_white  = EXCLUDED.blunders_white,
    mistakes_white  = EXCLUDED.mistakes_white,
    blunders_black  = EXCLUDED.blunders_black,
    mistakes_black  = EXCLUDED.mistakes_black,
    opening_name    = EXCLUDED.opening_name,
    analysis_status = 'done',
    analyzed_at     = now();

  -- Update per-move eval annotations when provided
  IF p_move_evals IS NOT NULL AND jsonb_array_length(p_move_evals) > 0 THEN
    UPDATE public.game_moves gm
    SET
      eval_before_cp = (m->>'eval_before_cp')::INT,
      eval_after_cp  = (m->>'eval_after_cp')::INT,
      best_move_san  = m->>'best_move_san',
      classification = m->>'classification'
    FROM jsonb_array_elements(p_move_evals) AS m
    WHERE gm.game_id = p_game_id
      AND gm.ply = (m->>'ply')::INT;
  END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION
  public.save_game_analysis(UUID, NUMERIC, NUMERIC, INT, INT, INT, INT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.save_game_analysis(UUID, NUMERIC, NUMERIC, INT, INT, INT, INT, TEXT, JSONB)
  TO authenticated, service_role;

-- =====================================================================
-- SECTION 55: ROOM WAITING QUEUE
-- =====================================================================

-- Queue table: holds users waiting to enter a room as guest
CREATE TABLE IF NOT EXISTS public.room_queue (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id   TEXT        NOT NULL REFERENCES public.public_rooms(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  position  INT         NOT NULL,
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_queue_room ON public.room_queue(room_id, position);

GRANT SELECT, INSERT, DELETE ON public.room_queue TO authenticated;
GRANT ALL ON public.room_queue TO service_role;
ALTER TABLE public.room_queue ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view the queue for rooms they are part of (or that are open)
DROP POLICY IF EXISTS "Queue viewable by room participants" ON public.room_queue;
CREATE POLICY "Queue viewable by room participants"
  ON public.room_queue FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.public_rooms r
      WHERE r.id = room_id
        AND (r.host_id = auth.uid() OR r.guest_id = auth.uid() OR r.status = 'waiting')
    )
  );

-- Users can only insert/delete their own queue entries (via RPC below)
DROP POLICY IF EXISTS "Users manage own queue entry" ON public.room_queue;
CREATE POLICY "Users manage own queue entry"
  ON public.room_queue FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Enable Realtime for live queue updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'room_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_queue;
  END IF;
END $$;

-- =====================================================================
-- SECTION 56: join_room_queue RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.join_room_queue(p_room_id TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_room     public.public_rooms;
  v_position INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_room FROM public.public_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status NOT IN ('waiting', 'guest_joined') THEN
    RAISE EXCEPTION 'Room is not accepting queued players';
  END IF;
  IF v_room.host_id = v_uid THEN RAISE EXCEPTION 'Host cannot join the queue'; END IF;
  IF v_room.guest_id = v_uid THEN RAISE EXCEPTION 'You are already in the room as guest'; END IF;

  -- Idempotent: return existing position if already queued
  SELECT position INTO v_position
  FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_uid;
  IF FOUND THEN RETURN v_position; END IF;

  SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
  FROM public.room_queue WHERE room_id = p_room_id;

  INSERT INTO public.room_queue (room_id, user_id, position)
  VALUES (p_room_id, v_uid, v_position);

  RETURN v_position;
END; $$;
REVOKE ALL ON FUNCTION public.join_room_queue(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_room_queue(TEXT) TO authenticated;

-- =====================================================================
-- SECTION 57: leave_room_queue RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.leave_room_queue(p_room_id TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pos INT;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT position INTO v_pos
  FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_uid;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.room_queue WHERE room_id = p_room_id AND user_id = v_uid;
  UPDATE public.room_queue SET position = position - 1
  WHERE room_id = p_room_id AND position > v_pos;
END; $$;
REVOKE ALL ON FUNCTION public.leave_room_queue(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_room_queue(TEXT) TO authenticated;

-- =====================================================================
-- SECTION 58: DATA REPAIR (RUN ONCE)
-- Repair any users missing a profile or having a null/empty username.
-- =====================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  -- 1. Create fallback profiles for auth.users without a profile
  FOR r IN 
    SELECT id FROM auth.users 
    WHERE id NOT IN (SELECT id FROM public.profiles) 
  LOOP
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (r.id, 'Player_' || substr(r.id::text, 1, 6), 'Player')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- 2. Fix null or empty usernames in existing profiles
  UPDATE public.profiles
  SET username = 'Player_' || substr(id::text, 1, 6)
  WHERE username IS NULL OR trim(username) = '';
END $$;

-- =====================================================================
-- SECTION 59: TOURNAMENT AUTO-CREATION SYSTEM
-- =====================================================================

-- 1. Create a Unique Index to prevent multiple 'upcoming' tournaments per category
DROP INDEX IF EXISTS unique_upcoming_tournaments;
CREATE UNIQUE INDEX unique_upcoming_tournaments 
ON public.tournaments (time_control, entry_fee_coins) 
WHERE status = 'upcoming';

-- 2. Function to ensure exactly one upcoming tournament per category
CREATE OR REPLACE FUNCTION public.ensure_upcoming_tournaments()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_timers TEXT[] := ARRAY['1+0', '3+0', '5+0'];
  v_coins INT[] := ARRAY[5, 10, 20, 30, 50, 80, 100, 200, 500];
  v_t TEXT;
  v_c INT;
  v_slug TEXT;
  v_name TEXT;
  v_prize_1st INT;
  v_prize_2nd INT;
  v_prize_3rd INT;
  v_max_players INT := 16;
  v_total_prize INT;
BEGIN
  FOREACH v_t IN ARRAY v_timers
  LOOP
    FOREACH v_c IN ARRAY v_coins
    LOOP
      -- Check if an upcoming tournament exists for this combination
      IF NOT EXISTS (
        SELECT 1 FROM public.tournaments 
        WHERE time_control = v_t AND entry_fee_coins = v_c AND status = 'upcoming'
      ) THEN
        -- Generate unique slug
        v_slug := 'auto-' || replace(v_t, '+', '-') || '-' || v_c || '-' || substr(md5(random()::text), 1, 8);
        v_name := split_part(v_t, '+', 1) || ' Min Arena (' || v_c || ' Coins)';
        
        -- Calculate prizes (90% return, split 50/30/20 of that 90%)
        v_total_prize := (v_max_players * v_c * 0.9)::INT;
        v_prize_1st := (v_total_prize * 0.5)::INT;
        v_prize_2nd := (v_total_prize * 0.3)::INT;
        v_prize_3rd := v_total_prize - v_prize_1st - v_prize_2nd;

        INSERT INTO public.tournaments (
          slug, name, description, format, time_control, 
          starts_at, max_players, status, entry_fee_coins,
          prize_1st, prize_2nd, prize_3rd, prize_pool
        ) VALUES (
          v_slug, v_name, 'Auto-generated ' || v_name, 'swiss', v_t,
          now() + interval '5 minutes', v_max_players, 'upcoming', v_c,
          v_prize_1st, v_prize_2nd, v_prize_3rd, v_total_prize::text || ' Coins'
        ) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_upcoming_tournaments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_upcoming_tournaments() TO service_role;

-- 3. Trigger to auto-create when an upcoming tournament starts/locks
CREATE OR REPLACE FUNCTION public.trg_auto_create_tournament()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'upcoming' AND NEW.status IN ('locked', 'live', 'completed', 'cancelled') THEN
    -- Call the ensure function synchronously to instantly replenish
    PERFORM public.ensure_upcoming_tournaments();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_tournament_status_change ON public.tournaments;
CREATE TRIGGER on_tournament_status_change
  AFTER UPDATE OF status ON public.tournaments
  FOR EACH ROW
  WHEN (OLD.status = 'upcoming' AND NEW.status IN ('locked', 'live', 'completed', 'cancelled'))
  EXECUTE FUNCTION public.trg_auto_create_tournament();

-- 4. Enable pg_cron and schedule the auto-healing job
DO $$
BEGIN
  -- We assume pg_cron is enabled in the database, if not this block will gracefully skip or fail
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create pg_cron extension, ensure it is enabled via dashboard.';
END $$;

DO $$
BEGIN
  -- Unschedule if exists to recreate
  PERFORM cron.unschedule('auto_heal_tournaments');
  -- Schedule every minute
  PERFORM cron.schedule('auto_heal_tournaments', '* * * * *', 'SELECT public.ensure_upcoming_tournaments();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or failed to schedule';
END $$;

-- =====================================================================
-- SECTION 60: TOURNAMENT FLOW REWORK
-- =====================================================================

-- 1. Make starts_at nullable so Upcoming tournaments don't need a countdown
ALTER TABLE public.tournaments ALTER COLUMN starts_at DROP NOT NULL;

-- 2. Update Auto-Creator to insert starts_at = NULL
CREATE OR REPLACE FUNCTION public.ensure_upcoming_tournaments()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_timers TEXT[] := ARRAY['1+0', '3+0', '5+0'];
  v_coins INT[] := ARRAY[5, 10, 20, 30, 50, 80, 100, 200, 500];
  v_t TEXT;
  v_c INT;
  v_slug TEXT;
  v_name TEXT;
  v_prize_1st INT;
  v_prize_2nd INT;
  v_prize_3rd INT;
  v_max_players INT := 16;
  v_total_prize INT;
BEGIN
  FOREACH v_t IN ARRAY v_timers
  LOOP
    FOREACH v_c IN ARRAY v_coins
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.tournaments 
        WHERE time_control = v_t AND entry_fee_coins = v_c AND status = 'upcoming'
      ) THEN
        v_slug := 'auto-' || replace(v_t, '+', '-') || '-' || v_c || '-' || substr(md5(random()::text), 1, 8);
        v_name := split_part(v_t, '+', 1) || ' Min Arena (' || v_c || ' Coins)';
        
        v_total_prize := (v_max_players * v_c * 0.9)::INT;
        v_prize_1st := (v_total_prize * 0.5)::INT;
        v_prize_2nd := (v_total_prize * 0.3)::INT;
        v_prize_3rd := v_total_prize - v_prize_1st - v_prize_2nd;

        INSERT INTO public.tournaments (
          slug, name, description, format, time_control, 
          starts_at, max_players, status, entry_fee_coins,
          prize_1st, prize_2nd, prize_3rd, prize_pool
        ) VALUES (
          v_slug, v_name, 'Auto-generated ' || v_name, 'swiss', v_t,
          NULL, v_max_players, 'upcoming', v_c,
          v_prize_1st, v_prize_2nd, v_prize_3rd, v_total_prize::text || ' Coins'
        ) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END; $$;

-- 3. Update Join Logic to handle lock state and 2 min countdown
CREATE OR REPLACE FUNCTION public.join_tournament_paid(p_tournament_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_tournament RECORD;
  v_wallet     RECORD;
  v_new_bal    INT;
  v_tx_id      UUID;
  v_ikey       TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_tournament.status <> 'upcoming' THEN RAISE EXCEPTION 'Registration is closed'; END IF;
  IF v_tournament.player_count >= v_tournament.max_players THEN
    RAISE EXCEPTION 'Tournament is full';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_entries
    WHERE tournament_id = p_tournament_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Already registered';
  END IF;

  v_ikey := 'tourn_entry_' || v_uid::text || '_' || p_tournament_id::text;

  IF v_tournament.entry_fee_coins > 0 THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;

    IF v_wallet.balance < v_tournament.entry_fee_coins THEN
      RAISE EXCEPTION 'Insufficient wallet balance';
    END IF;

    v_new_bal := v_wallet.balance - v_tournament.entry_fee_coins;

    UPDATE public.wallets SET
      balance     = v_new_bal,
      total_spent = total_spent + v_tournament.entry_fee_coins,
      updated_at  = now()
    WHERE user_id = v_uid;

    INSERT INTO public.wallet_transactions
      (user_id, type, amount, balance_after, description, reference_id, idempotency_key)
    VALUES
      (v_uid, 'tournament_entry', -v_tournament.entry_fee_coins, v_new_bal,
       'Entry fee: ' || v_tournament.name,
       p_tournament_id::text, v_ikey)
    RETURNING id INTO v_tx_id;
  END IF;

  INSERT INTO public.tournament_entries (tournament_id, user_id, payment_tx_id)
  VALUES (p_tournament_id, v_uid, v_tx_id);

  -- Check if this was the last player needed
  IF (v_tournament.player_count + 1) >= v_tournament.max_players THEN
    UPDATE public.tournaments 
    SET player_count = player_count + 1, 
        status = 'locked', 
        starts_at = now() + interval '2 minutes' 
    WHERE id = p_tournament_id;

    -- Send notifications to all registered players
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT user_id, 'tournament_locked', 'Tournament Locked', 
           'Your tournament is full. Tournament starts in 2 minutes.', 
           '/tournament/' || p_tournament_id::text
    FROM public.tournament_entries 
    WHERE tournament_id = p_tournament_id;
  ELSE
    UPDATE public.tournaments SET player_count = player_count + 1 WHERE id = p_tournament_id;
  END IF;
END; $$;

-- 4. Create function to transition locked to live
CREATE OR REPLACE FUNCTION public.transition_locked_tournaments()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tourn RECORD;
BEGIN
  FOR v_tourn IN 
    SELECT id FROM public.tournaments 
    WHERE status = 'locked' AND starts_at <= now()
  LOOP
    UPDATE public.tournaments SET status = 'live' WHERE id = v_tourn.id;
    
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT user_id, 'tournament_live', 'Tournament Live', 
           'Your tournament is now live! Matchmaking has started.', 
           '/tournament/' || v_tourn.id::text
    FROM public.tournament_entries 
    WHERE tournament_id = v_tourn.id;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.transition_locked_tournaments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_locked_tournaments() TO service_role;

-- 5. Schedule transition job
DO $$
BEGIN
  PERFORM cron.unschedule('transition_locked_tournaments');
  PERFORM cron.schedule('transition_locked_tournaments', '* * * * *', 'SELECT public.transition_locked_tournaments();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or failed to schedule';
END $$;

-- =====================================================================
-- SECTION 61: PREMIUM BADGE STATUS SYNC
-- =====================================================================

-- 1. Add premium status columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS premium_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive';

-- 2. Trigger to sync subscription changes to profiles
CREATE OR REPLACE FUNCTION public.sync_premium_status_to_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- If status is active and not expired, mark as premium
  IF NEW.status = 'active' AND (NEW.current_period_end IS NULL OR NEW.current_period_end > now()) THEN
    UPDATE public.profiles
    SET premium_active = true,
        premium_expires_at = NEW.current_period_end,
        subscription_status = NEW.status
    WHERE id = NEW.user_id;
  ELSE
    UPDATE public.profiles
    SET premium_active = false,
        premium_expires_at = NEW.current_period_end,
        subscription_status = NEW.status
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_premium_status ON public.subscriptions;
CREATE TRIGGER trg_sync_premium_status
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_premium_status_to_profile();

-- 3. Cron job to expire stale premium status
CREATE OR REPLACE FUNCTION public.expire_premium_subscriptions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET premium_active = false
  WHERE premium_active = true 
    AND premium_expires_at IS NOT NULL 
    AND premium_expires_at < now();
END; $$;

REVOKE ALL ON FUNCTION public.expire_premium_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_premium_subscriptions() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('expire_premium_subscriptions_cron');
  PERFORM cron.schedule('expire_premium_subscriptions_cron', '0 * * * *', 'SELECT public.expire_premium_subscriptions();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or failed to schedule';
END $$;

-- =====================================================================
-- SECTION 62: STORAGE BUCKETS
-- =====================================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('banners', 'banners', true) ON CONFLICT (id) DO NOTHING;

-- Policies for avatars
DROP POLICY IF EXISTS "Avatar images are publicly accessible." ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible." ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "Anyone can upload an avatar." ON storage.objects;
CREATE POLICY "Anyone can upload an avatar." ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');
DROP POLICY IF EXISTS "Anyone can update an avatar." ON storage.objects;
CREATE POLICY "Anyone can update an avatar." ON storage.objects FOR UPDATE WITH CHECK (bucket_id = 'avatars');

-- Policies for banners
DROP POLICY IF EXISTS "Banner images are publicly accessible." ON storage.objects;
CREATE POLICY "Banner images are publicly accessible." ON storage.objects FOR SELECT USING (bucket_id = 'banners');
DROP POLICY IF EXISTS "Anyone can upload a banner." ON storage.objects;
CREATE POLICY "Anyone can upload a banner." ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'banners');
DROP POLICY IF EXISTS "Anyone can update a banner." ON storage.objects;
CREATE POLICY "Anyone can update a banner." ON storage.objects FOR UPDATE WITH CHECK (bucket_id = 'banners');

-- =====================================================================
-- SECTION 63: BANK ACCOUNTS
-- =====================================================================

-- Ensure pgcrypto is enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_holder_name TEXT NOT NULL,
  account_number_encrypted TEXT NOT NULL,
  account_number_last4 TEXT NOT NULL,
  ifsc_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  branch_address TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('savings', 'current')),
  verification_status TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('verified', 'failed', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id) -- one bank account per user for now, or allow multiple? Let's limit to one active per user
);

GRANT SELECT ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own bank accounts" ON public.bank_accounts;
CREATE POLICY "Users can view their own bank accounts"
  ON public.bank_accounts FOR SELECT
  USING (auth.uid() = user_id);

-- We don't allow direct INSERT/UPDATE from client. We use RPC to encrypt the account number.
CREATE OR REPLACE FUNCTION public.save_bank_account(
  p_account_holder_name TEXT,
  p_account_number TEXT,
  p_ifsc_code TEXT,
  p_bank_name TEXT,
  p_branch_name TEXT,
  p_branch_address TEXT,
  p_account_type TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_secret TEXT := 'chessox_secret_key_123!'; -- In production, use vault or current_setting('app.encryption_key')
  v_last4 TEXT;
  v_encrypted TEXT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  
  IF length(p_account_number) < 4 THEN
    RAISE EXCEPTION 'Account number too short';
  END IF;

  v_last4 := right(p_account_number, 4);
  v_encrypted := pgp_sym_encrypt(p_account_number, v_secret);

  INSERT INTO public.bank_accounts (
    user_id, account_holder_name, account_number_encrypted, account_number_last4,
    ifsc_code, bank_name, branch_name, branch_address, account_type, verification_status
  ) VALUES (
    v_uid, p_account_holder_name, v_encrypted, v_last4,
    p_ifsc_code, p_bank_name, p_branch_name, p_branch_address, p_account_type, 'verified'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    account_holder_name = EXCLUDED.account_holder_name,
    account_number_encrypted = EXCLUDED.account_number_encrypted,
    account_number_last4 = EXCLUDED.account_number_last4,
    ifsc_code = EXCLUDED.ifsc_code,
    bank_name = EXCLUDED.bank_name,
    branch_name = EXCLUDED.branch_name,
    branch_address = EXCLUDED.branch_address,
    account_type = EXCLUDED.account_type,
    verification_status = 'verified',
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.save_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ==========================================
-- COMMUNITY SYSTEM
-- ==========================================

-- 1. Tables

CREATE TABLE IF NOT EXISTS public.community_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    media_url TEXT,
    likes_count INTEGER NOT NULL DEFAULT 0,
    dislikes_count INTEGER NOT NULL DEFAULT 0,
    comments_count INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'dislike')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.community_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_saved_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, post_id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_community_posts_score ON public.community_posts (score DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON public.community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_reactions_post_user ON public.community_reactions (post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_post_id ON public.community_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_community_saved_posts_user_id ON public.community_saved_posts (user_id);

-- 3. Triggers for counts and score

CREATE OR REPLACE FUNCTION public.handle_community_reaction()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.reaction_type = 'like' THEN
            UPDATE public.community_posts SET likes_count = likes_count + 1, score = score + 1 WHERE id = NEW.post_id;
        ELSIF NEW.reaction_type = 'dislike' THEN
            UPDATE public.community_posts SET dislikes_count = dislikes_count + 1, score = score - 1 WHERE id = NEW.post_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.reaction_type = 'like' AND NEW.reaction_type = 'dislike' THEN
            UPDATE public.community_posts SET likes_count = likes_count - 1, dislikes_count = dislikes_count + 1, score = score - 2 WHERE id = NEW.post_id;
        ELSIF OLD.reaction_type = 'dislike' AND NEW.reaction_type = 'like' THEN
            UPDATE public.community_posts SET dislikes_count = dislikes_count - 1, likes_count = likes_count + 1, score = score + 2 WHERE id = NEW.post_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.reaction_type = 'like' THEN
            UPDATE public.community_posts SET likes_count = likes_count - 1, score = score - 1 WHERE id = OLD.post_id;
        ELSIF OLD.reaction_type = 'dislike' THEN
            UPDATE public.community_posts SET dislikes_count = dislikes_count - 1, score = score + 1 WHERE id = OLD.post_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_community_reactions
AFTER INSERT OR UPDATE OR DELETE ON public.community_reactions
FOR EACH ROW EXECUTE FUNCTION public.handle_community_reaction();

CREATE OR REPLACE FUNCTION public.handle_community_comment()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.community_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.community_posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_community_comments
AFTER INSERT OR DELETE ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public.handle_community_comment();

-- 4. RLS Policies

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_saved_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view posts" ON public.community_posts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create posts" ON public.community_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON public.community_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON public.community_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view reactions" ON public.community_reactions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can react" ON public.community_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reactions" ON public.community_reactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reactions" ON public.community_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view comments" ON public.community_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment" ON public.community_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.community_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view own saved posts" ON public.community_saved_posts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can save posts" ON public.community_saved_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsave posts" ON public.community_saved_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_saved_posts;


-- =====================================================================
-- Auto-seed Daily Tournaments RPC
-- =====================================================================

CREATE OR REPLACE FUNCTION public.seed_daily_tournaments()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_id UUID;
  v_tc RECORD;
  v_count INT;
BEGIN
  -- Find an admin to be the creator (if none exists, will be NULL)
  SELECT user_id INTO v_admin_id FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  
  -- Time Controls: Bullet (1+0), Blitz (3+2), Rapid (10+0)
  FOR v_tc IN SELECT * FROM (VALUES 
    ('1+0', 'Bullet Arena', 'swiss'), 
    ('3+2', 'Blitz Championship', 'swiss'), 
    ('10+0', 'Rapid Royal', 'swiss')
  ) AS t(tc, name, format)
  LOOP
    -- Check if an upcoming or ongoing tournament exists for this time control
    SELECT count(*) INTO v_count FROM public.tournaments
    WHERE time_control = v_tc.tc AND status IN ('upcoming', 'ongoing');
    
    IF v_count = 0 THEN
      INSERT INTO public.tournaments (
        slug, name, description, format, time_control, starts_at, 
        max_players, created_by, status, entry_fee_coins, 
        prize_1st, prize_2nd, prize_3rd
      ) VALUES (
        'auto-' || replace(v_tc.tc, '+', '-') || '-' || extract(epoch from now())::text,
        v_tc.name,
        'Daily auto-generated ' || v_tc.name || ' tournament.',
        v_tc.format,
        v_tc.tc,
        now() + interval '5 minutes',
        256,
        v_admin_id,
        'upcoming',
        0,
        1000, 500, 250
      );
    END IF;
  END LOOP;
END;
$$;

-- Allow anyone to trigger the check (it is safe and idempotent)
GRANT EXECUTE ON FUNCTION public.seed_daily_tournaments() TO anon, authenticated, service_role;





-- 1. Add iq_rating to profiles


-- 2. Add iq_applied to games


-- 3. Create iq_history table
CREATE TABLE IF NOT EXISTS public.iq_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
  old_iq INT NOT NULL,
  new_iq INT NOT NULL,
  change_amount INT NOT NULL,
  result TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iq_history_user ON public.iq_history(user_id, created_at DESC);

-- RLS for iq_history
GRANT SELECT ON public.iq_history TO anon, authenticated;
GRANT ALL ON public.iq_history TO service_role;
ALTER TABLE public.iq_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "IQ history public read" ON public.iq_history;
CREATE POLICY "IQ history public read"
  ON public.iq_history FOR SELECT USING (true);


-- 4. Create apply_iq_change RPC
CREATE OR REPLACE FUNCTION public.apply_iq_change(p_game_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game RECORD;
  v_white_iq INT;
  v_black_iq INT;
  v_new_white_iq INT;
  v_new_black_iq INT;
  v_white_change INT := 0;
  v_black_change INT := 0;
BEGIN
  -- Fetch the game
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
  
  -- Validation: game must exist, have ended, be rated, and not be vs bot
  IF NOT FOUND THEN RETURN; END IF;
  IF v_game.result NOT IN ('white', 'black', 'draw') THEN RETURN; END IF;
  IF NOT v_game.is_rated THEN RETURN; END IF;
  IF v_game.vs_computer THEN RETURN; END IF;
  IF v_game.white_id IS NULL OR v_game.black_id IS NULL THEN RETURN; END IF;
  
  -- Anti-abuse: Run only once per game
  IF v_game.iq_applied THEN RETURN; END IF;

  -- Time class must be rated eligible (optional friend match exclusion handled by is_rated flag usually)
  -- But we enforce explicitly: bullet, blitz, rapid, classical (correspondence too if standard)
  IF v_game.time_class NOT IN ('bullet', 'blitz', 'rapid', 'classical') THEN RETURN; END IF;

  -- Fetch current IQ ratings
  SELECT iq_rating INTO v_white_iq FROM public.profiles WHERE id = v_game.white_id;
  SELECT iq_rating INTO v_black_iq FROM public.profiles WHERE id = v_game.black_id;

  -- Default to 100 if somehow missing
  IF v_white_iq IS NULL THEN v_white_iq := 100; END IF;
  IF v_black_iq IS NULL THEN v_black_iq := 100; END IF;

  -- Calculate IQ changes
  IF v_game.result = 'white' THEN
    v_white_change := 8;
    v_black_change := -5;
  ELSIF v_game.result = 'black' THEN
    v_white_change := -5;
    v_black_change := 8;
  ELSIF v_game.result = 'draw' THEN
    v_white_change := 3;
    v_black_change := 3;
  END IF;

  v_new_white_iq := v_white_iq + v_white_change;
  v_new_black_iq := v_black_iq + v_black_change;

  -- Update Profiles
  UPDATE public.profiles SET iq_rating = v_new_white_iq WHERE id = v_game.white_id;
  UPDATE public.profiles SET iq_rating = v_new_black_iq WHERE id = v_game.black_id;

  -- Insert History
  INSERT INTO public.iq_history (user_id, game_id, old_iq, new_iq, change_amount, result)
  VALUES 
    (v_game.white_id, p_game_id, v_white_iq, v_new_white_iq, v_white_change, v_game.result),
    (v_game.black_id, p_game_id, v_black_iq, v_new_black_iq, v_black_change, v_game.result);

  -- Mark processed
  UPDATE public.games SET iq_applied = true WHERE id = p_game_id;

END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_iq_change(UUID) TO anon, authenticated, service_role;





-- 1. Add iq_rating to profiles


-- 2. Add iq_applied to games


-- 3. Create iq_history table
CREATE TABLE IF NOT EXISTS public.iq_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
  old_iq INT NOT NULL,
  new_iq INT NOT NULL,
  change_amount INT NOT NULL,
  result TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iq_history_user ON public.iq_history(user_id, created_at DESC);

-- RLS for iq_history
GRANT SELECT ON public.iq_history TO anon, authenticated;
GRANT ALL ON public.iq_history TO service_role;
ALTER TABLE public.iq_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "IQ history public read" ON public.iq_history;
CREATE POLICY "IQ history public read"
  ON public.iq_history FOR SELECT USING (true);


-- 4. Create apply_iq_change RPC
CREATE OR REPLACE FUNCTION public.apply_iq_change(p_game_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game RECORD;
  v_white_iq INT;
  v_black_iq INT;
  v_new_white_iq INT;
  v_new_black_iq INT;
  v_white_change INT := 0;
  v_black_change INT := 0;
BEGIN
  -- Fetch the game
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
  
  -- Validation: game must exist, have ended, be rated, and not be vs bot
  IF NOT FOUND THEN RETURN; END IF;
  IF v_game.result NOT IN ('white', 'black', 'draw') THEN RETURN; END IF;
  IF NOT v_game.is_rated THEN RETURN; END IF;
  IF v_game.vs_computer THEN RETURN; END IF;
  IF v_game.white_id IS NULL OR v_game.black_id IS NULL THEN RETURN; END IF;
  
  -- Anti-abuse: Run only once per game
  IF v_game.iq_applied THEN RETURN; END IF;

  -- Time class must be rated eligible
  IF v_game.time_class NOT IN ('bullet', 'blitz', 'rapid', 'classical') THEN RETURN; END IF;

  -- Fetch current IQ ratings
  SELECT iq_rating INTO v_white_iq FROM public.profiles WHERE id = v_game.white_id;
  SELECT iq_rating INTO v_black_iq FROM public.profiles WHERE id = v_game.black_id;

  -- Default to 100 if somehow missing
  IF v_white_iq IS NULL THEN v_white_iq := 100; END IF;
  IF v_black_iq IS NULL THEN v_black_iq := 100; END IF;

  -- Calculate IQ changes
  IF v_game.result = 'white' THEN
    v_white_change := 8;
    v_black_change := -5;
  ELSIF v_game.result = 'black' THEN
    v_white_change := -5;
    v_black_change := 8;
  ELSIF v_game.result = 'draw' THEN
    v_white_change := 3;
    v_black_change := 3;
  END IF;

  v_new_white_iq := v_white_iq + v_white_change;
  v_new_black_iq := v_black_iq + v_black_change;

  -- Update Profiles
  UPDATE public.profiles SET iq_rating = v_new_white_iq WHERE id = v_game.white_id;
  UPDATE public.profiles SET iq_rating = v_new_black_iq WHERE id = v_game.black_id;

  -- Insert History
  INSERT INTO public.iq_history (user_id, game_id, old_iq, new_iq, change_amount, result)
  VALUES 
    (v_game.white_id, p_game_id, v_white_iq, v_new_white_iq, v_white_change, v_game.result),
    (v_game.black_id, p_game_id, v_black_iq, v_new_black_iq, v_black_change, v_game.result);

  -- Mark processed
  UPDATE public.games SET iq_applied = true WHERE id = p_game_id;

END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_iq_change(UUID) TO anon, authenticated, service_role;

-- 5. Modify apply_elo_change to automatically trigger apply_iq_change
--    This ensures that ALL game end conditions (resignation, timeout, draw, etc.) automatically apply IQ!
CREATE OR REPLACE FUNCTION public.apply_elo_change(p_game_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game   RECORD;
  v_w      RECORD;
  v_b      RECORD;
  v_K      INT := 24;
  v_exp_w  NUMERIC;
  v_exp_b  NUMERIC;
  v_score_w NUMERIC;
  v_new_w  INT;
  v_new_b  INT;
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
    (v_game.white_id, v_game.time_class, 100, 100, 0, 0, 0, 0)
  ON CONFLICT (user_id, time_class) DO NOTHING;

  INSERT INTO public.ratings
    (user_id, time_class, rating, peak_rating, games_played, wins, losses, draws)
  VALUES
    (v_game.black_id, v_game.time_class, 100, 100, 0, 0, 0, 0)
  ON CONFLICT (user_id, time_class) DO NOTHING;

  SELECT * INTO v_w FROM public.ratings
    WHERE user_id = v_game.white_id AND time_class = v_game.time_class;
  SELECT * INTO v_b FROM public.ratings
    WHERE user_id = v_game.black_id AND time_class = v_game.time_class;
  IF v_w IS NULL OR v_b IS NULL THEN RETURN; END IF;

  v_exp_w   := 1.0 / (1 + power(10, (v_b.rating - v_w.rating) / 400.0));
  v_exp_b   := 1.0 - v_exp_w;
  v_score_w := CASE v_game.result WHEN 'white' THEN 1 WHEN 'draw' THEN 0.5 ELSE 0 END;

  v_new_w := ROUND(v_w.rating + v_K * (v_score_w - v_exp_w));
  v_new_b := ROUND(v_b.rating + v_K * ((1 - v_score_w) - v_exp_b));

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
    (v_game.white_id, p_game_id, v_game.time_class,
     v_w.rating, v_new_w, v_new_w - v_w.rating),
    (v_game.black_id, p_game_id, v_game.time_class,
     v_b.rating, v_new_b, v_new_b - v_b.rating);

  UPDATE public.games SET elo_applied = true WHERE id = p_game_id;
  
  -- NEW: Automatically trigger IQ updates
  PERFORM public.apply_iq_change(p_game_id);
END; $$;

