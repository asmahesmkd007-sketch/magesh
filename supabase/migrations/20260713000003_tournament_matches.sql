-- =====================================================================
-- TOURNAMENT_MATCHES
-- ---------------------------------------------------------------------
-- Backs the bracket UI in src/routes/tournament.$id.tsx, which selects
-- id,round,slot,player1_id,player2_id,game_id,winner_id,status filtered
-- by tournament_id and ordered by round, and subscribes to postgres_changes
-- on this table (filter tournament_id=eq.<id>) for live bracket updates.
-- Prior audit (AUDIT_REPORT.md) found no definition for this table
-- anywhere in schema.sql or migrations. Purely additive: no DROP.
-- Follows the same conventions as tournaments/tournament_entries
-- (schema.sql SECTION 15/16).
-- =====================================================================

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

-- Public read, consistent with tournaments/tournament_entries being open
-- to anon/authenticated (bracket is public info once a tournament goes live).
DROP POLICY IF EXISTS "Tournament matches public read" ON public.tournament_matches;
CREATE POLICY "Tournament matches public read"
  ON public.tournament_matches FOR SELECT USING (true);

-- Writes are restricted to admins (bracket generation/progression is a
-- server-side/admin operation), same as "Admins update tournaments".
DROP POLICY IF EXISTS "Admins insert tournament matches" ON public.tournament_matches;
CREATE POLICY "Admins insert tournament matches"
  ON public.tournament_matches FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update tournament matches" ON public.tournament_matches;
CREATE POLICY "Admins update tournament matches"
  ON public.tournament_matches FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at maintenance trigger, following the same style used elsewhere
-- in schema.sql for tables with an updated_at column.
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

-- Realtime: the route subscribes to postgres_changes on this table
-- (channel `tournament_detail:<id>`, filter tournament_id=eq.<id>).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournament_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_matches;
  END IF;
END $$;
