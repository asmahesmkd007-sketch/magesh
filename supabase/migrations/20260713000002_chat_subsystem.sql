-- =====================================================================
-- CHAT SUBSYSTEM
-- ---------------------------------------------------------------------
-- Backs src/lib/api/chatClient.ts (Global Chat + Custom Rooms + Direct
-- Messages) and src/routes/admin.chat.tsx. Prior audit (AUDIT_REPORT.md)
-- found ~16+ RPCs plus a backing table referenced by the frontend with
-- no SQL definition anywhere in schema.sql or migrations. This migration
-- creates the full additive backend: chat_channels, chat_channel_members,
-- chat_messages, chat_message_reactions, chat_reports tables, and every
-- RPC the client/admin route calls, matching exact param names/order and
-- return shapes. Follows the same conventions as public.game_chat
-- (schema.sql ~line 224) and public.community_comments (~line 2848) for
-- table/RLS style, and admin_credit_wallet/has_role for the admin gate.
-- Purely additive: no DROP of anything pre-existing.
-- =====================================================================

-- ── 1. Core tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL CHECK (type IN ('global', 'room', 'dm')),
  slug         TEXT UNIQUE,
  name         TEXT,
  description  TEXT DEFAULT '',
  is_private   BOOLEAN NOT NULL DEFAULT false,
  owner_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- For DM channels: canonical pair (least(user), greatest(user)) so a
  -- unique index can prevent duplicate DM channels between two users.
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

-- ── 2. RLS ────────────────────────────────────────────────────────────
-- All reads/writes to these tables happen through SECURITY DEFINER RPCs
-- below (mirrors the game_chat / community_comments pattern of a public
-- SELECT policy plus RPC-gated writes). Direct table access from the
-- client is only used by admin.chat.tsx for chat_reports (admin-only
-- SELECT), everything else goes through chatClient.ts RPCs.

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;

-- Public rooms/global are readable by anyone; DMs/private rooms only by
-- members. Used as a fallback if the frontend ever queries these tables
-- directly; the RPCs below do their own visibility checks internally.
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

-- Reports: only admins and the reporter may read; only authenticated
-- users may create (via RPC, which sets reporter_id = auth.uid()).
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
    'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url
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
  SELECT id INTO v_id FROM public.chat_channels WHERE type = 'global' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.chat_channels (type, slug, name, description, is_private)
    VALUES ('global', 'global', 'Global Chat', 'ChessOx community chat', false)
    RETURNING id INTO v_id;
  END IF;

  IF p_user IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id, role)
    VALUES (v_id, p_user, 'member')
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  RETURN v_id;
END; $$;

-- Named composite type (NOT the same as a RETURNS TABLE(...) signature,
-- which is local to a single function and cannot be reused as a type
-- elsewhere) so both the row-builder helper and every public RPC below
-- can share one shape: matches ChatChannel in chatClient.ts.
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

CREATE OR REPLACE FUNCTION public.chat_get_channel(p_slug_or_id TEXT)
RETURNS public.chat_channel_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_row public.chat_channel_row;
BEGIN
  BEGIN
    v_id := p_slug_or_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_id := NULL;
  END;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.chat_channels WHERE slug = p_slug_or_id;
  END IF;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_row FROM public._chat_channel_row(v_id, auth.uid());
  RETURN v_row;
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_get_channel(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_get_channel(TEXT) TO anon, authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.chat_leave_room(p_channel UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.chat_channel_members WHERE channel_id = p_channel AND user_id = auth.uid();
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_leave_room(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_leave_room(UUID) TO authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.chat_mark_read(p_channel UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chat_channel_members SET last_read_at = now()
  WHERE channel_id = p_channel AND user_id = auth.uid();
END; $$;
REVOKE EXECUTE ON FUNCTION public.chat_mark_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_mark_read(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.chat_channel_members(p_channel UUID)
RETURNS TABLE (
  id UUID, username TEXT, display_name TEXT, avatar_url TEXT,
  premium_tier TEXT, role TEXT, muted_until TIMESTAMPTZ, joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url,
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
       'id', p.id, 'username', p.username, 'display_name', p.display_name,
       'avatar_url', p.avatar_url, 'premium_tier', p.premium_tier
     ) FROM public.profiles p WHERE p.id = msg.user_id),
    (SELECT json_build_object(
       'id', rp.id, 'content', rp.content, 'user_id', rp.user_id,
       'author_name', pr.display_name
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

  -- Auto-join global; require existing membership for rooms/dms.
  IF EXISTS (SELECT 1 FROM public.chat_channels WHERE id = p_channel AND type = 'global') THEN
    PERFORM public._chat_ensure_global(auth.uid());
  END IF;

  IF NOT public._chat_is_member(p_channel, auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of this channel';
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
