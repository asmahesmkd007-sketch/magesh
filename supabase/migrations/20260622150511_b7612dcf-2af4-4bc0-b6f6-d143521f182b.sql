
-- Extend games for live multiplayer
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS fen text NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  ADD COLUMN IF NOT EXISTS turn text NOT NULL DEFAULT 'w',
  ADD COLUMN IF NOT EXISTS initial_seconds integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS increment_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS white_time_ms integer NOT NULL DEFAULT 300000,
  ADD COLUMN IF NOT EXISTS black_time_ms integer NOT NULL DEFAULT 300000,
  ADD COLUMN IF NOT EXISTS last_move_at timestamptz,
  ADD COLUMN IF NOT EXISTS host_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draw_offered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS end_reason text;

-- Allow nulls for usernames/ratings on waiting games
ALTER TABLE public.games ALTER COLUMN white_username DROP NOT NULL;
ALTER TABLE public.games ALTER COLUMN black_username DROP NOT NULL;
ALTER TABLE public.games ALTER COLUMN white_rating DROP NOT NULL;
ALTER TABLE public.games ALTER COLUMN black_rating DROP NOT NULL;

-- Moves table
CREATE TABLE IF NOT EXISTS public.game_moves (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  ply integer NOT NULL,
  san text NOT NULL,
  uci text NOT NULL,
  fen_after text NOT NULL,
  by_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  time_left_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, ply)
);
GRANT SELECT ON public.game_moves TO anon, authenticated;
GRANT INSERT ON public.game_moves TO authenticated;
GRANT ALL ON public.game_moves TO service_role;
ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moves readable" ON public.game_moves FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "moves insert by player" ON public.game_moves FOR INSERT TO authenticated
  WITH CHECK (by_user = auth.uid());

-- Game chat
CREATE TABLE IF NOT EXISTS public.game_chat (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.game_chat TO authenticated;
GRANT SELECT ON public.game_chat TO anon;
GRANT ALL ON public.game_chat TO service_role;
ALTER TABLE public.game_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat readable" ON public.game_chat FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "chat insert self" ON public.game_chat FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_moves;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_chat;

-- Allow players to update their own games (status, fen, clocks) — server fns will use auth context
DROP POLICY IF EXISTS "players update own games" ON public.games;
CREATE POLICY "players update own games" ON public.games FOR UPDATE TO authenticated
  USING (auth.uid() = white_id OR auth.uid() = black_id OR auth.uid() = host_id)
  WITH CHECK (auth.uid() = white_id OR auth.uid() = black_id OR auth.uid() = host_id);

DROP POLICY IF EXISTS "anyone insert own games" ON public.games;
CREATE POLICY "anyone insert own games" ON public.games FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);

-- Anyone can read games (spectating)
DROP POLICY IF EXISTS "games readable" ON public.games;
CREATE POLICY "games readable" ON public.games FOR SELECT TO anon, authenticated USING (true);
