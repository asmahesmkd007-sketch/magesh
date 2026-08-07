
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

-- Named composite type (NOT the same as a RETURNS TABLE(...) signature, which i...
DO $$ BEGIN
  DROP TYPE IF EXISTS public.chat_channel_row CASCADE;
  CREATE TYPE public.chat_channel_row AS (
    id UUID, type TEXT, slug TEXT, name TEXT, description TEXT, is_private BOOLEAN,
    owner_id UUID, member_count INT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    my_role TEXT, is_member BOOLEAN, owner JSON, other_user JSON,
    last_message JSON, unread_count INT,
    room_code TEXT, icon TEXT, max_members INT, online_count INT,
    is_permanent BOOLEAN, coming_soon BOOLEAN, password_protected BOOLEAN
  );
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
       WHERE msg.channel_id = c.id AND msg.is_deleted = false AND msg.created_at > m.last_read_at),
    c.room_code, c.icon, c.max_members,
    (SELECT COUNT(*)::INT FROM public.chat_channel_members m
       WHERE m.channel_id = c.id AND m.last_read_at > now() - interval '5 minutes'),
    c.is_permanent, c.coming_soon, (c.password_hash IS NOT NULL)
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

DROP FUNCTION IF EXISTS public.chat_channel_members(UUID);
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
-- SEASONS BACKEND
-- Backs src/lib/api/seasonsClient.ts (routes /seasons and /admin/seasons)

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

-- Per-season leaderboard snapshot, refreshed live while a season is 'live'/'pau...
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

-- Final, immutable record written when a season ends (admin_end_season)
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

-- Everyone can read seasons/rankings/history (leaderboards are public, consiste...
DROP POLICY IF EXISTS "seasons_select_all" ON public.seasons;
CREATE POLICY "seasons_select_all" ON public.seasons
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "season_rankings_select_all" ON public.season_rankings;
CREATE POLICY "season_rankings_select_all" ON public.season_rankings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "season_history_select_all" ON public.season_history;
CREATE POLICY "season_history_select_all" ON public.season_history
  FOR SELECT USING (true);

-- These three tables were created after this file's blanket `GRANT ..
GRANT SELECT ON public.seasons, public.season_rankings, public.season_history
  TO anon, authenticated;
GRANT ALL ON public.seasons, public.season_rankings, public.season_history TO service_role;

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

-- Guarded: this is the first of three season_leaderboard definitions in this fi...
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

-- ── 3
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

-- ── 4

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
-- HOTFIX: leaderboard_view / get_dynamic_leaderboard referenced columns and a t...

-- 1

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

-- 2
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

-- 3
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

-- Section 74: TOURNAMENT ENGINE — LIVE TR PAGE (2026-07-14)
-- Everything the live tournament (TR) page needs that SECTIONS 15/16/36/ 59/60 ...

-- 74.1 Columns
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS current_round    INT NOT NULL DEFAULT 0;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS total_rounds     INT NOT NULL DEFAULT 0;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS min_players      INT NOT NULL DEFAULT 2;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS platform_fee_pct INT NOT NULL DEFAULT 10;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS prize_4th        INT NOT NULL DEFAULT 0;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS round_started_at TIMESTAMPTZ;

ALTER TABLE public.tournament_entries ADD COLUMN IF NOT EXISTS wins                INT    NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_entries ADD COLUMN IF NOT EXISTS losses              INT    NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_entries ADD COLUMN IF NOT EXISTS draws               INT    NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_entries ADD COLUMN IF NOT EXISTS piece_points        INT    NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_entries ADD COLUMN IF NOT EXISTS time_used_ms        BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_entries ADD COLUMN IF NOT EXISTS status              TEXT   NOT NULL DEFAULT 'active';
ALTER TABLE public.tournament_entries ADD COLUMN IF NOT EXISTS eliminated_in_round INT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tournament_entry_status') THEN
    ALTER TABLE public.tournament_entries ADD CONSTRAINT chk_tournament_entry_status
      CHECK (status IN ('active', 'eliminated', 'winner', 'runner_up', 'third', 'fourth'));
  END IF;
END $$;

-- Direct INSERT/DELETE on tournament_entries let clients skip the paid join / r...
DROP POLICY IF EXISTS "entries own insert" ON public.tournament_entries;
DROP POLICY IF EXISTS "entries own delete" ON public.tournament_entries;
REVOKE INSERT, DELETE ON public.tournament_entries FROM authenticated;

-- 74.2 Activity feed table (drives the TR page's live activity section)
CREATE TABLE IF NOT EXISTS public.tournament_activity (
  id            BIGSERIAL PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  message       TEXT NOT NULL,
  actor_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tournament_activity
  ON public.tournament_activity(tournament_id, created_at DESC);
GRANT SELECT ON public.tournament_activity TO anon, authenticated;
GRANT ALL ON public.tournament_activity TO service_role;
ALTER TABLE public.tournament_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tournament activity public read" ON public.tournament_activity;
CREATE POLICY "Tournament activity public read"
  ON public.tournament_activity FOR SELECT USING (true);
-- No INSERT policies on purpose: only SECURITY DEFINER engine functions and the...

-- Realtime: the TR page subscribes to postgres_changes on all four tournament t...
DO $$
DECLARE v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['tournaments', 'tournament_entries', 'tournament_activity', 'games'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
    END IF;
  END LOOP;
END $$;

-- 74.3 Internal helpers
DROP FUNCTION IF EXISTS public._tournament_log(UUID, TEXT, TEXT, UUID, JSONB);
CREATE OR REPLACE FUNCTION public._tournament_log(
  p_tournament_id UUID,
  p_kind          TEXT,
  p_message       TEXT,
  p_actor         UUID  DEFAULT NULL,
  p_meta          JSONB DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.tournament_activity (tournament_id, kind, message, actor_id, meta)
  VALUES (p_tournament_id, p_kind, p_message, p_actor, COALESCE(p_meta, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public._tournament_log(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._tournament_log(UUID, TEXT, TEXT, UUID, JSONB) TO service_role;

-- Material still on the board for one side, from a FEN (P1 N3 B3 R5 Q9).
DROP FUNCTION IF EXISTS public._fen_material(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public._fen_material(p_fen TEXT, p_color TEXT)
RETURNS INT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_board TEXT := split_part(COALESCE(p_fen, ''), ' ', 1);
  v_ch    TEXT;
  v_total INT := 0;
  i       INT;
BEGIN
  FOR i IN 1..length(v_board) LOOP
    v_ch := substr(v_board, i, 1);
    IF p_color = 'w' THEN
      v_total := v_total + CASE v_ch
        WHEN 'P' THEN 1 WHEN 'N' THEN 3 WHEN 'B' THEN 3 WHEN 'R' THEN 5 WHEN 'Q' THEN 9 ELSE 0 END;
    ELSE
      v_total := v_total + CASE v_ch
        WHEN 'p' THEN 1 WHEN 'n' THEN 3 WHEN 'b' THEN 3 WHEN 'r' THEN 5 WHEN 'q' THEN 9 ELSE 0 END;
    END IF;
  END LOOP;
  RETURN v_total;
END; $$;

-- '3+2' → 180s initial, 2s increment, blitz.
DROP FUNCTION IF EXISTS public._tournament_time_params(TEXT);
CREATE OR REPLACE FUNCTION public._tournament_time_params(
  p_time_control      TEXT,
  OUT o_initial_seconds   INT,
  OUT o_increment_seconds INT,
  OUT o_time_class        public.time_class
) LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  o_initial_seconds   := GREATEST(10, LEAST(86400, COALESCE(NULLIF(split_part(p_time_control, '+', 1), '')::INT, 5) * 60));
  o_increment_seconds := GREATEST(0,  LEAST(180,   COALESCE(NULLIF(split_part(p_time_control, '+', 2), '')::INT, 0)));
  o_time_class := CASE
    WHEN o_initial_seconds < 180 THEN 'bullet'::public.time_class
    WHEN o_initial_seconds < 600 THEN 'blitz'::public.time_class
    ELSE 'rapid'::public.time_class
  END;
EXCEPTION WHEN OTHERS THEN
  o_initial_seconds := 300; o_increment_seconds := 0; o_time_class := 'blitz'::public.time_class;
END; $$;

-- Creates the live game for one pairing
DROP FUNCTION IF EXISTS public._tournament_create_game(public.tournaments, UUID, UUID);
CREATE OR REPLACE FUNCTION public._tournament_create_game(
  p_tournament public.tournaments,
  p_player1    UUID,
  p_player2    UUID
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_white UUID;
  v_black UUID;
  v_ini   INT;
  v_inc   INT;
  v_tc    public.time_class;
  v_game  UUID;
BEGIN
  SELECT o_initial_seconds, o_increment_seconds, o_time_class INTO v_ini, v_inc, v_tc
  FROM public._tournament_time_params(p_tournament.time_control);

  IF random() < 0.5 THEN v_white := p_player1; v_black := p_player2;
  ELSE                   v_white := p_player2; v_black := p_player1;
  END IF;

  INSERT INTO public.games (
    host_id, white_id, black_id, white_username, black_username,
    white_rating, black_rating, status, result, time_class, time_control,
    initial_seconds, increment_seconds, white_time_ms, black_time_ms,
    is_rated, fen, turn, last_move_at
  ) VALUES (
    v_white, v_white, v_black,
    (SELECT username FROM public.profiles WHERE id = v_white),
    (SELECT username FROM public.profiles WHERE id = v_black),
    public.current_rating(v_white, v_tc), public.current_rating(v_black, v_tc),
    'active', 'ongoing', v_tc, p_tournament.time_control,
    v_ini, v_inc, v_ini * 1000, v_ini * 1000,
    true, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w', now()
  ) RETURNING id INTO v_game;

  RETURN v_game;
END; $$;
REVOKE ALL ON FUNCTION public._tournament_create_game(public.tournaments, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._tournament_create_game(public.tournaments, UUID, UUID) TO service_role;

-- 74.4 Round generation
-- Pairs the next round of the knockout bracket and spawns its games
DROP FUNCTION IF EXISTS public._tournament_start_round(UUID);
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
    SELECT array_agg(winner_id ORDER BY slot) INTO v_players
    FROM public.tournament_matches
    WHERE tournament_id = p_tournament_id AND round = v_t.current_round AND winner_id IS NOT NULL;
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

-- 74.5 Prize payout + completion
DROP FUNCTION IF EXISTS public._tournament_award_prize(public.tournaments, UUID, INT, TEXT);
CREATE OR REPLACE FUNCTION public._tournament_award_prize(
  p_tournament public.tournaments,
  p_user       UUID,
  p_amount     INT,
  p_place      TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ikey TEXT := 'prize_' || p_place || '_' || p_tournament.id::text;
  v_bal  INT;
BEGIN
  IF p_user IS NULL OR COALESCE(p_amount, 0) <= 0 THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE idempotency_key = v_ikey) THEN RETURN; END IF;

  INSERT INTO public.wallets (user_id, balance, total_earned)
  VALUES (p_user, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets SET
    balance      = balance + p_amount,
    total_earned = total_earned + p_amount,
    updated_at   = now()
  WHERE user_id = p_user
  RETURNING balance INTO v_bal;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, description, reference_id, idempotency_key)
  VALUES
    (p_user, 'tournament_prize', p_amount, v_bal,
     p_place || ' place prize: ' || p_tournament.name,
     p_tournament.id::text, v_ikey);

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (p_user, 'tournament_prize',
          'Prize won — ' || p_amount || ' coins!',
          'You finished ' || p_place || ' in ' || p_tournament.name || '. ' || p_amount || ' coins were added to your wallet.',
          '/tournament/' || p_tournament.id::text);

  PERFORM public._tournament_log(
    p_tournament.id, 'prize_distributed',
    COALESCE((SELECT username FROM public.profiles WHERE id = p_user), 'A player')
      || ' won ' || p_amount || ' coins (' || p_place || ' place)',
    p_user, jsonb_build_object('place', p_place, 'amount', p_amount));
END; $$;
REVOKE ALL ON FUNCTION public._tournament_award_prize(public.tournaments, UUID, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._tournament_award_prize(public.tournaments, UUID, INT, TEXT) TO service_role;

-- Called when the final has produced a winner: assigns places, pays prizes idem...
DROP FUNCTION IF EXISTS public._tournament_complete(UUID);
CREATE OR REPLACE FUNCTION public._tournament_complete(p_tournament_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t        public.tournaments%ROWTYPE;
  v_final    public.tournament_matches%ROWTYPE;
  v_champion UUID;
  v_runner   UUID;
  v_semis    UUID[];
  v_third    UUID;
  v_fourth   UUID;
  v_name     TEXT;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND OR v_t.status <> 'live' THEN RETURN; END IF;

  SELECT * INTO v_final
  FROM public.tournament_matches
  WHERE tournament_id = p_tournament_id AND round = v_t.current_round
  ORDER BY slot LIMIT 1;
  IF NOT FOUND OR v_final.winner_id IS NULL THEN RETURN; END IF;

  v_champion := v_final.winner_id;
  v_runner   := CASE WHEN v_final.player1_id = v_champion THEN v_final.player2_id ELSE v_final.player1_id END;

  -- Semifinal losers take 3rd/4th, better tournament score first.
  SELECT COALESCE(array_agg(s.loser ORDER BY e.score DESC, e.piece_points DESC, e.time_used_ms ASC), '{}')
  INTO v_semis
  FROM (
    SELECT CASE WHEN m.winner_id = m.player1_id THEN m.player2_id ELSE m.player1_id END AS loser
    FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.round = v_t.current_round - 1
      AND m.status = 'finished'
  ) s
  JOIN public.tournament_entries e ON e.tournament_id = p_tournament_id AND e.user_id = s.loser
  WHERE s.loser IS NOT NULL;
  v_third  := v_semis[1];
  v_fourth := v_semis[2];

  UPDATE public.tournament_entries SET rank = 1, status = 'winner'
  WHERE tournament_id = p_tournament_id AND user_id = v_champion;
  UPDATE public.tournament_entries SET rank = 2, status = 'runner_up'
  WHERE tournament_id = p_tournament_id AND user_id = v_runner;
  UPDATE public.tournament_entries SET rank = 3, status = 'third'
  WHERE tournament_id = p_tournament_id AND user_id = v_third;
  UPDATE public.tournament_entries SET rank = 4, status = 'fourth'
  WHERE tournament_id = p_tournament_id AND user_id = v_fourth;

  -- Everyone else: later elimination ranks higher, then score/material.
  UPDATE public.tournament_entries e SET rank = ranked.rnk
  FROM (
    SELECT user_id,
           4 + ROW_NUMBER() OVER (
             ORDER BY eliminated_in_round DESC NULLS LAST, score DESC, piece_points DESC, joined_at ASC
           ) AS rnk
    FROM public.tournament_entries
    WHERE tournament_id = p_tournament_id
      AND user_id IS DISTINCT FROM v_champion
      AND user_id IS DISTINCT FROM v_runner
      AND user_id IS DISTINCT FROM v_third
      AND user_id IS DISTINCT FROM v_fourth
  ) ranked
  WHERE e.tournament_id = p_tournament_id AND e.user_id = ranked.user_id;

  PERFORM public._tournament_award_prize(v_t, v_champion, v_t.prize_1st, '1st');
  PERFORM public._tournament_award_prize(v_t, v_runner,   v_t.prize_2nd, '2nd');
  PERFORM public._tournament_award_prize(v_t, v_third,    v_t.prize_3rd, '3rd');
  PERFORM public._tournament_award_prize(v_t, v_fourth,   v_t.prize_4th, '4th');

  SELECT username INTO v_name FROM public.profiles WHERE id = v_champion;

  UPDATE public.tournaments SET
    status             = 'completed',
    ends_at            = now(),
    prizes_distributed = true,
    winner_display     = COALESCE(v_name, winner_display)
  WHERE id = p_tournament_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT user_id, 'tournament_finished',
         'Tournament finished',
         COALESCE(v_name, 'The champion') || ' won ' || v_t.name || '. Check the final standings.',
         '/tournament/' || p_tournament_id::text
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id;

  PERFORM public._tournament_log(
    p_tournament_id, 'tournament_finished',
    COALESCE(v_name, 'The champion') || ' is the champion! 🏆',
    v_champion, jsonb_build_object('winner', v_name));
END; $$;
REVOKE ALL ON FUNCTION public._tournament_complete(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._tournament_complete(UUID) TO service_role;

-- 74.6 Result capture: games → bracket advancement
-- Fires once per game on the NULL → NOT NULL transition of ended_at (same conve...
DROP TRIGGER IF EXISTS trg_tournament_game_finished ON public.games;
DROP FUNCTION IF EXISTS public.handle_tournament_game_finished();
CREATE OR REPLACE FUNCTION public.handle_tournament_game_finished()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match      public.tournament_matches%ROWTYPE;
  v_t          public.tournaments%ROWTYPE;
  v_winner     UUID;
  v_loser      UUID;
  v_is_draw    BOOLEAN := false;
  v_wname      TEXT;
  v_lname      TEXT;
  v_white_used BIGINT;
  v_black_used BIGINT;
  v_pending    INT;
  v_in_round   INT;
BEGIN
  SELECT * INTO v_match FROM public.tournament_matches
  WHERE game_id = NEW.id AND status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Serialize all bracket processing per tournament.
  SELECT * INTO v_t FROM public.tournaments WHERE id = v_match.tournament_id FOR UPDATE;
  IF NOT FOUND OR v_t.status <> 'live' THEN RETURN NEW; END IF;

  IF NEW.result = 'white' THEN
    v_winner := NEW.white_id;
  ELSIF NEW.result = 'black' THEN
    v_winner := NEW.black_id;
  ELSE
    v_is_draw := (NEW.result = 'draw');
    v_winner := CASE WHEN COALESCE(NEW.white_time_ms, 0) >= COALESCE(NEW.black_time_ms, 0)
                     THEN NEW.white_id ELSE NEW.black_id END;
  END IF;
  v_loser := CASE WHEN v_winner = NEW.white_id THEN NEW.black_id ELSE NEW.white_id END;

  UPDATE public.tournament_matches SET winner_id = v_winner, status = 'finished'
  WHERE id = v_match.id;

  v_white_used := GREATEST(0, NEW.initial_seconds::BIGINT * 1000 - COALESCE(NEW.white_time_ms, 0));
  v_black_used := GREATEST(0, NEW.initial_seconds::BIGINT * 1000 - COALESCE(NEW.black_time_ms, 0));

  UPDATE public.tournament_entries SET
    wins   = wins   + CASE WHEN NOT v_is_draw AND user_id = v_winner THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN NOT v_is_draw AND user_id = v_loser  THEN 1 ELSE 0 END,
    draws  = draws  + CASE WHEN v_is_draw THEN 1 ELSE 0 END,
    score  = score  + CASE WHEN v_is_draw THEN 0.5 WHEN user_id = v_winner THEN 1 ELSE 0 END,
    piece_points = piece_points + CASE WHEN user_id = NEW.white_id
                                       THEN public._fen_material(NEW.fen, 'w')
                                       ELSE public._fen_material(NEW.fen, 'b') END,
    time_used_ms = time_used_ms + CASE WHEN user_id = NEW.white_id THEN v_white_used ELSE v_black_used END,
    status = CASE WHEN user_id = v_loser THEN 'eliminated' ELSE status END,
    eliminated_in_round = CASE WHEN user_id = v_loser THEN v_match.round ELSE eliminated_in_round END
  WHERE tournament_id = v_t.id AND user_id IN (NEW.white_id, NEW.black_id);

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
    PERFORM public._tournament_log(
      v_t.id, 'round_finished', 'Round ' || v_t.current_round || ' complete',
      NULL, jsonb_build_object('round', v_t.current_round));
    IF v_in_round = 1 THEN
      PERFORM public._tournament_complete(v_t.id);
    ELSE
      PERFORM public._tournament_start_round(v_t.id);
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_tournament_game_finished ON public.games;
CREATE TRIGGER trg_tournament_game_finished
  AFTER UPDATE ON public.games
  FOR EACH ROW
  WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_tournament_game_finished();

-- 74.7 Locked → live now also builds Round 1
CREATE OR REPLACE FUNCTION public.transition_locked_tournaments()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tourn RECORD;
BEGIN
  FOR v_tourn IN
    SELECT id FROM public.tournaments
    WHERE status = 'locked' AND starts_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.tournaments SET status = 'live' WHERE id = v_tourn.id;

    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT user_id, 'tournament_live', 'Tournament Live',
           'Your tournament is now live! Round 1 is starting.',
           '/tournament/' || v_tourn.id::text
    FROM public.tournament_entries
    WHERE tournament_id = v_tourn.id;

    PERFORM public._tournament_log(v_tourn.id, 'tournament_live', 'Tournament is live — Round 1 is starting');
    PERFORM public._tournament_start_round(v_tourn.id);
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.transition_locked_tournaments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_locked_tournaments() TO service_role, anon, authenticated;

-- 74.8 Clock sweep: force-finish tournament games with dead clocks
-- The move handler only settles a flag when someone calls it; if a player walks...
DROP FUNCTION IF EXISTS public.tournament_clock_sweep();
CREATE OR REPLACE FUNCTION public.tournament_clock_sweep()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_g      RECORD;
  v_winner UUID;
  v_result public.game_result;
BEGIN
  FOR v_g IN
    SELECT g.*
    FROM public.games g
    JOIN public.tournament_matches tm ON tm.game_id = g.id AND tm.status = 'active'
    WHERE g.status = 'active'
      AND g.last_move_at IS NOT NULL
      AND (
        (g.turn = 'w' AND g.last_move_at + make_interval(secs => g.white_time_ms / 1000.0) < now()) OR
        (g.turn = 'b' AND g.last_move_at + make_interval(secs => g.black_time_ms / 1000.0) < now())
      )
    FOR UPDATE OF g SKIP LOCKED
  LOOP
    IF v_g.turn = 'w' THEN v_result := 'black'; v_winner := v_g.black_id;
    ELSE                   v_result := 'white'; v_winner := v_g.white_id;
    END IF;

    UPDATE public.games SET
      status        = 'finished',
      result        = v_result,
      winner_id     = v_winner,
      end_reason    = CASE WHEN v_g.moves_count = 0 THEN 'no_show' ELSE 'timeout' END,
      ended_at      = now(),
      white_time_ms = CASE WHEN v_g.turn = 'w' THEN 0 ELSE white_time_ms END,
      black_time_ms = CASE WHEN v_g.turn = 'b' THEN 0 ELSE black_time_ms END
    WHERE id = v_g.id AND status = 'active';

    -- Rating only when an actual game happened (0-move no-shows stay unrated).
    IF v_g.is_rated AND v_g.moves_count > 0 THEN
      PERFORM public.apply_elo_change(v_g.id);
    END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.tournament_clock_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_clock_sweep() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('tournament_clock_sweep');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.schedule('tournament_clock_sweep', '* * * * *', 'SELECT public.tournament_clock_sweep();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — schedule tournament_clock_sweep manually';
END $$;

-- 74.9 Player RPC: withdraw + refund (client: refundTournamentEntry)
DROP FUNCTION IF EXISTS public.refund_tournament_entry(UUID);
CREATE OR REPLACE FUNCTION public.refund_tournament_entry(p_tournament_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_t    public.tournaments%ROWTYPE;
  v_e    public.tournament_entries%ROWTYPE;
  v_bal  INT;
  v_ikey TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_t.status <> 'upcoming' THEN RAISE EXCEPTION 'Withdrawals are closed'; END IF;

  SELECT * INTO v_e FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not registered'; END IF;

  IF v_t.entry_fee_coins > 0 THEN
    -- Scoped to the entry row so join → leave → join → leave still refunds.
    v_ikey := 'tourn_refund_' || v_e.id::text;
    IF NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE idempotency_key = v_ikey) THEN
      UPDATE public.wallets SET
        balance     = balance + v_t.entry_fee_coins,
        total_spent = GREATEST(0, total_spent - v_t.entry_fee_coins),
        updated_at  = now()
      WHERE user_id = v_uid
      RETURNING balance INTO v_bal;
      IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

      INSERT INTO public.wallet_transactions
        (user_id, type, amount, balance_after, description, reference_id, idempotency_key)
      VALUES
        (v_uid, 'tournament_refund', v_t.entry_fee_coins, v_bal,
         'Withdrew from: ' || v_t.name, p_tournament_id::text, v_ikey);
    END IF;
  END IF;

  DELETE FROM public.tournament_entries WHERE id = v_e.id;
  UPDATE public.tournaments SET player_count = GREATEST(0, player_count - 1)
  WHERE id = p_tournament_id;

  PERFORM public._tournament_log(
    p_tournament_id, 'player_left',
    COALESCE((SELECT username FROM public.profiles WHERE id = v_uid), 'A player') || ' withdrew',
    v_uid, '{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.refund_tournament_entry(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_tournament_entry(UUID) TO authenticated, service_role;

-- 74.10 Admin RPC: cancel + refund everyone (client: cancelTournament)
DROP FUNCTION IF EXISTS public.cancel_tournament(UUID);
CREATE OR REPLACE FUNCTION public.cancel_tournament(p_tournament_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_t    public.tournaments%ROWTYPE;
  v_e    RECORD;
  v_bal  INT;
  v_ikey TEXT;
BEGIN
  -- auth.uid() IS NULL only for service-role/scheduled calls.
  IF v_uid IS NOT NULL AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_t.status IN ('completed', 'cancelled') THEN RAISE EXCEPTION 'Tournament already ended'; END IF;

-- Mark cancelled and detach matches BEFORE force-finishing games so trg_tournam...
  UPDATE public.tournaments SET status = 'cancelled', ends_at = now() WHERE id = p_tournament_id;
  UPDATE public.tournament_matches SET status = 'finished'
  WHERE tournament_id = p_tournament_id AND status IN ('pending', 'active');

  UPDATE public.games g SET
    status = 'finished', result = 'aborted', end_reason = 'tournament_cancelled', ended_at = now()
  FROM public.tournament_matches tm
  WHERE tm.tournament_id = p_tournament_id AND tm.game_id = g.id AND g.status = 'active';

  FOR v_e IN
    SELECT * FROM public.tournament_entries WHERE tournament_id = p_tournament_id
  LOOP
    IF v_t.entry_fee_coins > 0 THEN
      v_ikey := 'tourn_cancel_' || v_e.user_id::text || '_' || p_tournament_id::text;
      IF NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE idempotency_key = v_ikey) THEN
        UPDATE public.wallets SET
          balance     = balance + v_t.entry_fee_coins,
          total_spent = GREATEST(0, total_spent - v_t.entry_fee_coins),
          updated_at  = now()
        WHERE user_id = v_e.user_id
        RETURNING balance INTO v_bal;
        IF v_bal IS NOT NULL THEN
          INSERT INTO public.wallet_transactions
            (user_id, type, amount, balance_after, description, reference_id, idempotency_key)
          VALUES
            (v_e.user_id, 'tournament_refund', v_t.entry_fee_coins, v_bal,
             'Tournament cancelled: ' || v_t.name, p_tournament_id::text, v_ikey);
        END IF;
      END IF;
    END IF;

    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (v_e.user_id, 'tournament_cancelled', 'Tournament cancelled',
            v_t.name || ' was cancelled.' ||
            CASE WHEN v_t.entry_fee_coins > 0 THEN ' Your entry fee was refunded.' ELSE '' END,
            '/tournament/' || p_tournament_id::text);
  END LOOP;

  PERFORM public._tournament_log(p_tournament_id, 'tournament_cancelled',
    'Tournament cancelled — all entry fees refunded', v_uid, '{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.cancel_tournament(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_tournament(UUID) TO authenticated, service_role;

-- 74.11 Player RPC: claim a no-show win early (client: claimNoShow)
DROP FUNCTION IF EXISTS public.handle_no_show(UUID);
CREATE OR REPLACE FUNCTION public.handle_no_show(p_match_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_m         public.tournament_matches%ROWTYPE;
  v_g         public.games%ROWTYPE;
  v_opp       UUID;
  v_opp_moves INT;
  v_result    public.game_result;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_m FROM public.tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR v_m.status <> 'active' OR v_m.game_id IS NULL THEN
    RAISE EXCEPTION 'Match is not active';
  END IF;
  IF v_uid <> v_m.player1_id AND v_uid <> v_m.player2_id THEN
    RAISE EXCEPTION 'Not your match';
  END IF;

  SELECT * INTO v_g FROM public.games WHERE id = v_m.game_id FOR UPDATE;
  IF v_g.status <> 'active' THEN RAISE EXCEPTION 'Game already finished'; END IF;

  v_opp := CASE WHEN v_g.white_id = v_uid THEN v_g.black_id ELSE v_g.white_id END;
-- White claiming against black must have opened the game first — otherwise blac...
  IF v_g.white_id = v_uid AND v_g.moves_count = 0 THEN
    RAISE EXCEPTION 'Make your first move first';
  END IF;
  SELECT count(*) INTO v_opp_moves FROM public.game_moves
  WHERE game_id = v_g.id AND by_user = v_opp;
  IF v_opp_moves > 0 THEN RAISE EXCEPTION 'Opponent has already moved'; END IF;
  IF v_g.created_at + interval '90 seconds' > now() THEN
    RAISE EXCEPTION 'Grace period not over yet';
  END IF;

  v_result := CASE WHEN v_g.white_id = v_uid THEN 'white'::public.game_result ELSE 'black'::public.game_result END;

  UPDATE public.games SET
    status = 'finished', result = v_result, winner_id = v_uid,
    end_reason = 'no_show', ended_at = now()
  WHERE id = v_g.id;
  -- No rating change for a game the opponent never played.
END; $$;
REVOKE ALL ON FUNCTION public.handle_no_show(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_no_show(UUID) TO authenticated, service_role;

-- 74.12 RPC: ensure_tournament_slots (client: ensureTournamentSlots)
DROP FUNCTION IF EXISTS public.ensure_tournament_slots();
CREATE OR REPLACE FUNCTION public.ensure_tournament_slots()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_before INT;
  v_after  INT;
BEGIN
  SELECT count(*) INTO v_before FROM public.tournaments WHERE status = 'upcoming';
  PERFORM public.ensure_upcoming_tournaments();
  SELECT count(*) INTO v_after FROM public.tournaments WHERE status = 'upcoming';
  RETURN jsonb_build_object('checked', v_after, 'created', GREATEST(0, v_after - v_before));
END; $$;
REVOKE ALL ON FUNCTION public.ensure_tournament_slots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_tournament_slots() TO authenticated, service_role;

-- 74.13 join_tournament_paid v3
-- Same contract as SECTION 60's version plus: • entry-attempt-scoped idempotenc...
DROP FUNCTION IF EXISTS public.join_tournament_paid(UUID);
CREATE OR REPLACE FUNCTION public.join_tournament_paid(p_tournament_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_tournament RECORD;
  v_wallet     RECORD;
  v_new_bal    INT;
  v_tx_id      UUID;
  v_ikey       TEXT;
  v_attempt    INT;
  v_name       TEXT;
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

  IF v_tournament.entry_fee_coins > 0 THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;

    IF v_wallet.balance < v_tournament.entry_fee_coins THEN
      RAISE EXCEPTION 'Insufficient wallet balance';
    END IF;

-- Attempt-scoped key: the 'Already registered' guard above (under the tournamen...
    SELECT count(*) + 1 INTO v_attempt FROM public.wallet_transactions
    WHERE user_id = v_uid AND type = 'tournament_entry' AND reference_id = p_tournament_id::text;
    v_ikey := 'tourn_entry_' || v_uid::text || '_' || p_tournament_id::text || '_' || v_attempt;

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

  SELECT username INTO v_name FROM public.profiles WHERE id = v_uid;
  PERFORM public._tournament_log(
    p_tournament_id, 'player_joined',
    COALESCE(v_name, 'A player') || ' joined (' || (v_tournament.player_count + 1)
      || '/' || v_tournament.max_players || ')',
    v_uid, '{}'::jsonb);

  IF (v_tournament.player_count + 1) >= v_tournament.max_players THEN
    UPDATE public.tournaments
    SET player_count = player_count + 1,
        status = 'locked',
        starts_at = now() + interval '2 minutes'
    WHERE id = p_tournament_id;

    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT user_id, 'tournament_locked', 'Tournament Locked',
           'Your tournament is full. Tournament starts in 2 minutes.',
           '/tournament/' || p_tournament_id::text
    FROM public.tournament_entries
    WHERE tournament_id = p_tournament_id;

    PERFORM public._tournament_log(
      p_tournament_id, 'tournament_locked',
      'All seats filled — tournament locked, Round 1 starts in 2 minutes', NULL, '{}'::jsonb);
  ELSE
    UPDATE public.tournaments SET player_count = player_count + 1 WHERE id = p_tournament_id;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.join_tournament_paid(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_tournament_paid(UUID) TO authenticated, service_role;

-- 74.14 Auto-created tournaments are knockout, not swiss
-- Identical to SECTION 60's ensure_upcoming_tournaments except the format now s...
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

        v_total_prize := v_max_players * v_c;
        v_prize_1st := (v_total_prize * 0.40)::INT;
        v_prize_2nd := (v_total_prize * 0.25)::INT;
        v_prize_3rd := (v_total_prize * 0.15)::INT;

        INSERT INTO public.tournaments (
          slug, name, description, format, time_control,
          starts_at, max_players, status, entry_fee_coins,
          prize_1st, prize_2nd, prize_3rd, prize_pool
        ) VALUES (
          v_slug, v_name, 'Auto-generated ' || v_name, 'knockout', v_t,
          NULL, v_max_players, 'upcoming', v_c,
          v_prize_1st, v_prize_2nd, v_prize_3rd, v_total_prize::text || ' Coins'
        ) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_upcoming_tournaments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_upcoming_tournaments() TO service_role;

-- Replenishment trigger (SECTION 59) recreated here so a fresh upcoming tournam...
CREATE OR REPLACE FUNCTION public.trg_auto_create_tournament()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'upcoming' AND NEW.status IN ('locked', 'live', 'completed', 'cancelled') THEN
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

-- 74.15 get_tournament_state — the TR page's one-round-trip state RPC
-- Returns the entire page state in a single call: tournament row, entries joine...
DROP FUNCTION IF EXISTS public.get_tournament_state(UUID);
CREATE OR REPLACE FUNCTION public.get_tournament_state(p_tournament_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_t        JSONB;
  v_entries  JSONB;
  v_matches  JSONB;
  v_activity JSONB;
BEGIN
  SELECT to_jsonb(t) INTO v_t FROM public.tournaments t WHERE t.id = p_tournament_id;
  IF v_t IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.score DESC, x.piece_points DESC, x.joined_at ASC), '[]'::jsonb)
  INTO v_entries
  FROM (
    SELECT e.id, e.user_id, e.score, e.rank, e.wins, e.losses, e.draws,
           e.piece_points, e.time_used_ms, e.status, e.eliminated_in_round, e.joined_at,
           p.username, p.avatar_url, p.country, p.iq_rating, p.is_online,
           p.premium_active, p.premium_expires_at
    FROM public.tournament_entries e
    LEFT JOIN public.profiles p ON p.id = e.user_id
    WHERE e.tournament_id = p_tournament_id
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.round, m.slot), '[]'::jsonb)
  INTO v_matches
  FROM (
    SELECT tm.id, tm.round, tm.slot, tm.player1_id, tm.player2_id,
           tm.game_id, tm.winner_id, tm.status,
           p1.username AS player1_username, p2.username AS player2_username,
           g.status AS game_status, g.result AS game_result, g.fen, g.turn,
           g.moves_count, g.white_id, g.black_id,
           g.white_username, g.black_username,
           g.white_time_ms, g.black_time_ms, g.last_move_at, g.end_reason,
           g.created_at AS game_created_at, g.ended_at AS game_ended_at
    FROM public.tournament_matches tm
    LEFT JOIN public.profiles p1 ON p1.id = tm.player1_id
    LEFT JOIN public.profiles p2 ON p2.id = tm.player2_id
    LEFT JOIN public.games g ON g.id = tm.game_id
    WHERE tm.tournament_id = p_tournament_id
  ) m;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC, a.id DESC), '[]'::jsonb)
  INTO v_activity
  FROM (
    SELECT id, kind, message, actor_id, meta, created_at
    FROM public.tournament_activity
    WHERE tournament_id = p_tournament_id
    ORDER BY created_at DESC, id DESC
    LIMIT 40
  ) a;

  RETURN jsonb_build_object(
    'server_now', now(),
    'viewer_id',  v_uid,
    'tournament', v_t,
    'entries',    v_entries,
    'matches',    v_matches,
    'activity',   v_activity
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_tournament_state(UUID) TO anon, authenticated, service_role;



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

        v_total_prize := v_max_players * v_c;
        v_prize_1st := (v_total_prize * 0.40)::INT;
        v_prize_2nd := (v_total_prize * 0.25)::INT;
        v_prize_3rd := (v_total_prize * 0.15)::INT;

        INSERT INTO public.tournaments (
          slug, name, description, format, time_control,
          starts_at, max_players, status, entry_fee_coins,
          prize_1st, prize_2nd, prize_3rd, prize_pool
        ) VALUES (
          v_slug, v_name, 'Auto-generated ' || v_name, 'knockout', v_t,
          NULL, v_max_players, 'upcoming', v_c,
          v_prize_1st, v_prize_2nd, v_prize_3rd, v_total_prize::text || ' Coins'
        ) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END; $$;







CREATE OR REPLACE FUNCTION public.tournament_1min_warning()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tourn RECORD;
BEGIN
  -- Find tournaments that are locked and will start in roughly 1 minute
  FOR v_tourn IN
    SELECT id, name FROM public.tournaments
    WHERE status = 'locked' 
      AND starts_at > now() + interval '30 seconds'
      AND starts_at <= now() + interval '90 seconds'
  LOOP
    -- Only send if we haven't sent the warning for this tournament yet
    IF NOT EXISTS (
      SELECT 1 FROM public.tournament_activity 
      WHERE tournament_id = v_tourn.id AND kind = '1min_warning'
    ) THEN
      
      INSERT INTO public.notifications (user_id, kind, title, body, link)
      SELECT user_id, 'tournament_warning', 'Tournament Starts in 1 Minute!',
             'Your match in ' || v_tourn.name || ' is about to start. Get ready.',
             '/tournament/' || v_tourn.id::text
      FROM public.tournament_entries
      WHERE tournament_id = v_tourn.id;

      PERFORM public._tournament_log(v_tourn.id, '1min_warning', 'Tournament starts in 1 minute', NULL, '{}'::jsonb);
    END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.tournament_1min_warning() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_1min_warning() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('tournament_1min_warning');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.schedule('tournament_1min_warning', '* * * * *', 'SELECT public.tournament_1min_warning();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — schedule tournament_1min_warning manually';
END $$;

-- Section 75: TR ARENA — POINT SYSTEM, CAPTURES, ABORT, ADMIN (2026-07-15)
-- Layers the arena experience on top of the SECTION 74 knockout engine WITHOUT ...

-- 75.1 Columns
-- The server move handler (game.functions.ts) already writes these on every mov...
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS fen_before   TEXT;
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS time_used_ms INT;
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS is_capture   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS is_check     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS is_castling  BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tournament_entries ADD COLUMN IF NOT EXISTS fastest_win_ms BIGINT;

-- 75.2 Captured pieces ledger (drives the live bonus ticker)
CREATE TABLE IF NOT EXISTS public.tournament_captured_pieces (
  id            BIGSERIAL PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id      UUID NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  game_id       UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  victim_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  piece         TEXT NOT NULL CHECK (piece IN ('p', 'n', 'b', 'r', 'q')),
  bonus         INT NOT NULL,
  ply           INT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tr_captures_tournament
  ON public.tournament_captured_pieces(tournament_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tr_captures_game
  ON public.tournament_captured_pieces(game_id);
GRANT SELECT ON public.tournament_captured_pieces TO anon, authenticated;
GRANT ALL ON public.tournament_captured_pieces TO service_role;
ALTER TABLE public.tournament_captured_pieces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "TR captures public read" ON public.tournament_captured_pieces;
CREATE POLICY "TR captures public read"
  ON public.tournament_captured_pieces FOR SELECT USING (true);
-- Writes only via the SECURITY DEFINER move trigger below.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'tournament_captured_pieces'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_captured_pieces;
  END IF;
END $$;

-- Abort bookkeeping: one abort per player per match, enforced by UNIQUE.
CREATE TABLE IF NOT EXISTS public.tournament_match_aborts (
  id         BIGSERIAL PRIMARY KEY,
  match_id   UUID NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id)
);
GRANT SELECT ON public.tournament_match_aborts TO anon, authenticated;
GRANT ALL ON public.tournament_match_aborts TO service_role;
ALTER TABLE public.tournament_match_aborts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "TR aborts public read" ON public.tournament_match_aborts;
CREATE POLICY "TR aborts public read"
  ON public.tournament_match_aborts FOR SELECT USING (true);

-- 75.3 Arena point rules
DROP FUNCTION IF EXISTS public._tr_piece_bonus(TEXT);
CREATE OR REPLACE FUNCTION public._tr_piece_bonus(p_piece TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_piece
    WHEN 'p' THEN 2 WHEN 'n' THEN 8 WHEN 'b' THEN 5
    WHEN 'r' THEN 5 WHEN 'q' THEN 10 ELSE 0 END;
$$;

-- Which victim-side piece disappeared between two FENs
DROP FUNCTION IF EXISTS public._tr_captured_piece(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public._tr_captured_piece(
  p_before TEXT, p_after TEXT, p_victim_color TEXT
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_b  TEXT := split_part(COALESCE(p_before, ''), ' ', 1);
  v_a  TEXT := split_part(COALESCE(p_after, ''), ' ', 1);
  v_t  TEXT;
  v_ch TEXT;
BEGIN
  IF v_b = '' OR v_a = '' THEN RETURN NULL; END IF;
  FOREACH v_t IN ARRAY ARRAY['q', 'r', 'b', 'n', 'p'] LOOP
    v_ch := CASE WHEN p_victim_color = 'w' THEN upper(v_t) ELSE v_t END;
    IF (length(v_b) - length(replace(v_b, v_ch, '')))
     > (length(v_a) - length(replace(v_a, v_ch, ''))) THEN
      RETURN v_t;
    END IF;
  END LOOP;
  RETURN NULL;
END; $$;

-- 75.4 Live capture bonus: fires on every recorded move
DROP TRIGGER IF EXISTS trg_tournament_move ON public.game_moves;
DROP FUNCTION IF EXISTS public.handle_tournament_move();
CREATE OR REPLACE FUNCTION public.handle_tournament_move()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m            RECORD;
  v_victim_color TEXT;
  v_piece        TEXT;
  v_bonus        INT;
BEGIN
  IF NEW.by_user IS NULL OR NEW.fen_before IS NULL OR NEW.fen_after IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tm.tournament_id, tm.id AS match_id, g.white_id, g.black_id
  INTO v_m
  FROM public.tournament_matches tm
  JOIN public.games g ON g.id = tm.game_id
  WHERE tm.game_id = NEW.game_id AND tm.status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_victim_color := CASE WHEN NEW.by_user = v_m.white_id THEN 'b' ELSE 'w' END;
  v_piece := public._tr_captured_piece(NEW.fen_before, NEW.fen_after, v_victim_color);
  IF v_piece IS NULL THEN RETURN NEW; END IF;
  v_bonus := public._tr_piece_bonus(v_piece);
  IF v_bonus <= 0 THEN RETURN NEW; END IF;

  UPDATE public.tournament_entries SET
    score        = score + v_bonus,
    piece_points = piece_points + v_bonus
  WHERE tournament_id = v_m.tournament_id AND user_id = NEW.by_user;

  INSERT INTO public.tournament_captured_pieces
    (tournament_id, match_id, game_id, user_id, victim_id, piece, bonus, ply)
  VALUES
    (v_m.tournament_id, v_m.match_id, NEW.game_id, NEW.by_user,
     CASE WHEN v_victim_color = 'w' THEN v_m.white_id ELSE v_m.black_id END,
     v_piece, v_bonus, NEW.ply);

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_tournament_move
  AFTER INSERT ON public.game_moves
  FOR EACH ROW EXECUTE FUNCTION public.handle_tournament_move();

-- 75.5 Finish scoring v2: WIN +5 / LOSS −5 / DRAW +2, fastest-win tiebreak
-- Same structure as SECTION 74's version; only the scoring block and the tiebre...
CREATE OR REPLACE FUNCTION public.handle_tournament_game_finished()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match       public.tournament_matches%ROWTYPE;
  v_t           public.tournaments%ROWTYPE;
  v_winner      UUID;
  v_loser       UUID;
  v_is_draw     BOOLEAN := false;
  v_wname       TEXT;
  v_lname       TEXT;
  v_white_used  BIGINT;
  v_black_used  BIGINT;
  v_duration_ms BIGINT;
  v_pending     INT;
  v_in_round    INT;
BEGIN
  SELECT * INTO v_match FROM public.tournament_matches
  WHERE game_id = NEW.id AND status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Serialize all bracket processing per tournament.
  SELECT * INTO v_t FROM public.tournaments WHERE id = v_match.tournament_id FOR UPDATE;
  IF NOT FOUND OR v_t.status <> 'live' THEN RETURN NEW; END IF;

  IF NEW.result = 'white' THEN
    v_winner := NEW.white_id;
  ELSIF NEW.result = 'black' THEN
    v_winner := NEW.black_id;
  ELSE
    v_is_draw := (NEW.result = 'draw');
    v_winner := CASE WHEN COALESCE(NEW.white_time_ms, 0) >= COALESCE(NEW.black_time_ms, 0)
                     THEN NEW.white_id ELSE NEW.black_id END;
  END IF;
  v_loser := CASE WHEN v_winner = NEW.white_id THEN NEW.black_id ELSE NEW.white_id END;

  UPDATE public.tournament_matches SET winner_id = v_winner, status = 'finished'
  WHERE id = v_match.id;

  v_white_used  := GREATEST(0, NEW.initial_seconds::BIGINT * 1000 - COALESCE(NEW.white_time_ms, 0));
  v_black_used  := GREATEST(0, NEW.initial_seconds::BIGINT * 1000 - COALESCE(NEW.black_time_ms, 0));
  v_duration_ms := GREATEST(0,
    (EXTRACT(EPOCH FROM (COALESCE(NEW.ended_at, now()) - NEW.created_at)) * 1000)::BIGINT);

-- Arena points: WIN +5, LOSS −5, DRAW both +2 (the clock-tiebreak "winner" of a...
  UPDATE public.tournament_entries SET
    wins   = wins   + CASE WHEN NOT v_is_draw AND user_id = v_winner THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN NOT v_is_draw AND user_id = v_loser  THEN 1 ELSE 0 END,
    draws  = draws  + CASE WHEN v_is_draw THEN 1 ELSE 0 END,
    score  = score  + CASE WHEN v_is_draw THEN 2
                           WHEN user_id = v_winner THEN 5
                           ELSE -5 END,
    time_used_ms = time_used_ms + CASE WHEN user_id = NEW.white_id THEN v_white_used ELSE v_black_used END,
    fastest_win_ms = CASE WHEN NOT v_is_draw AND user_id = v_winner
                          THEN LEAST(COALESCE(fastest_win_ms, 9223372036854775807), v_duration_ms)
                          ELSE fastest_win_ms END,
    status = CASE WHEN user_id = v_loser THEN 'eliminated' ELSE status END,
    eliminated_in_round = CASE WHEN user_id = v_loser THEN v_match.round ELSE eliminated_in_round END
  WHERE tournament_id = v_t.id AND user_id IN (NEW.white_id, NEW.black_id);

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
    PERFORM public._tournament_log(
      v_t.id, 'round_finished', 'Round ' || v_t.current_round || ' complete',
      NULL, jsonb_build_object('round', v_t.current_round));
    IF v_in_round = 1 THEN
      PERFORM public._tournament_complete(v_t.id);
    ELSE
      PERFORM public._tournament_start_round(v_t.id);
    END IF;
  END IF;

  RETURN NEW;
END; $$;

-- 75.6 Final placings use the arena tiebreaks
-- points → wins → fewest losses → fastest win, per the arena rules.
CREATE OR REPLACE FUNCTION public._tournament_complete(p_tournament_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t        public.tournaments%ROWTYPE;
  v_final    public.tournament_matches%ROWTYPE;
  v_champion UUID;
  v_runner   UUID;
  v_semis    UUID[];
  v_third    UUID;
  v_fourth   UUID;
  v_name     TEXT;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND OR v_t.status <> 'live' THEN RETURN; END IF;

  SELECT * INTO v_final
  FROM public.tournament_matches
  WHERE tournament_id = p_tournament_id AND round = v_t.current_round
  ORDER BY slot LIMIT 1;
  IF NOT FOUND OR v_final.winner_id IS NULL THEN RETURN; END IF;

  v_champion := v_final.winner_id;
  v_runner   := CASE WHEN v_final.player1_id = v_champion THEN v_final.player2_id ELSE v_final.player1_id END;

  SELECT COALESCE(array_agg(s.loser
           ORDER BY e.score DESC, e.wins DESC, e.losses ASC,
                    e.fastest_win_ms ASC NULLS LAST), '{}')
  INTO v_semis
  FROM (
    SELECT CASE WHEN m.winner_id = m.player1_id THEN m.player2_id ELSE m.player1_id END AS loser
    FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.round = v_t.current_round - 1
      AND m.status = 'finished'
  ) s
  JOIN public.tournament_entries e ON e.tournament_id = p_tournament_id AND e.user_id = s.loser
  WHERE s.loser IS NOT NULL;
  v_third  := v_semis[1];
  v_fourth := v_semis[2];

  UPDATE public.tournament_entries SET rank = 1, status = 'winner'
  WHERE tournament_id = p_tournament_id AND user_id = v_champion;
  UPDATE public.tournament_entries SET rank = 2, status = 'runner_up'
  WHERE tournament_id = p_tournament_id AND user_id = v_runner;
  UPDATE public.tournament_entries SET rank = 3, status = 'third'
  WHERE tournament_id = p_tournament_id AND user_id = v_third;
  UPDATE public.tournament_entries SET rank = 4, status = 'fourth'
  WHERE tournament_id = p_tournament_id AND user_id = v_fourth;

  UPDATE public.tournament_entries e SET rank = ranked.rnk
  FROM (
    SELECT user_id,
           4 + ROW_NUMBER() OVER (
             ORDER BY score DESC, wins DESC, losses ASC,
                      fastest_win_ms ASC NULLS LAST, joined_at ASC
           ) AS rnk
    FROM public.tournament_entries
    WHERE tournament_id = p_tournament_id
      AND user_id IS DISTINCT FROM v_champion
      AND user_id IS DISTINCT FROM v_runner
      AND user_id IS DISTINCT FROM v_third
      AND user_id IS DISTINCT FROM v_fourth
  ) ranked
  WHERE e.tournament_id = p_tournament_id AND e.user_id = ranked.user_id;

  PERFORM public._tournament_award_prize(v_t, v_champion, v_t.prize_1st, '1st');
  PERFORM public._tournament_award_prize(v_t, v_runner,   v_t.prize_2nd, '2nd');
  PERFORM public._tournament_award_prize(v_t, v_third,    v_t.prize_3rd, '3rd');
  PERFORM public._tournament_award_prize(v_t, v_fourth,   v_t.prize_4th, '4th');

  SELECT username INTO v_name FROM public.profiles WHERE id = v_champion;

  UPDATE public.tournaments SET
    status             = 'completed',
    ends_at            = now(),
    prizes_distributed = true,
    winner_display     = COALESCE(v_name, winner_display)
  WHERE id = p_tournament_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT user_id, 'tournament_finished',
         'Tournament finished',
         COALESCE(v_name, 'The champion') || ' won ' || v_t.name || '. Check the final standings.',
         '/tournament/' || p_tournament_id::text
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id;

  PERFORM public._tournament_log(
    p_tournament_id, 'tournament_finished',
    COALESCE(v_name, 'The champion') || ' is the champion! 🏆',
    v_champion, jsonb_build_object('winner', v_name));
END; $$;

-- 75.7 abort_game — chess.com-style abort
-- Allowed while at most one move has been played
DROP FUNCTION IF EXISTS public.abort_game(UUID);
CREATE OR REPLACE FUNCTION public.abort_game(p_game_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_g    public.games%ROWTYPE;
  v_m    public.tournament_matches%ROWTYPE;
  v_t    public.tournaments%ROWTYPE;
  v_new  UUID;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_g FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_g.status <> 'active' THEN RAISE EXCEPTION 'Game is not active'; END IF;
  IF v_uid <> v_g.white_id AND v_uid <> v_g.black_id THEN
    RAISE EXCEPTION 'Not a player in this game';
  END IF;
  IF v_g.moves_count > 1 THEN
    RAISE EXCEPTION 'Too late to abort — resign instead';
  END IF;

  SELECT * INTO v_m FROM public.tournament_matches
  WHERE game_id = p_game_id AND status = 'active' FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_t FROM public.tournaments WHERE id = v_m.tournament_id FOR UPDATE;
    IF v_t.status <> 'live' THEN RAISE EXCEPTION 'Tournament is not live'; END IF;

    BEGIN
      INSERT INTO public.tournament_match_aborts (match_id, user_id) VALUES (v_m.id, v_uid);
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'You already aborted this match once — resign instead';
    END;

-- Fresh board for the same pairing, re-pointed BEFORE the old game is ended so ...
    v_new := public._tournament_create_game(v_t, v_m.player1_id, v_m.player2_id);
    UPDATE public.tournament_matches SET game_id = v_new WHERE id = v_m.id;

    UPDATE public.games SET
      status = 'finished', result = 'aborted', end_reason = 'aborted', ended_at = now()
    WHERE id = p_game_id;

    SELECT username INTO v_name FROM public.profiles WHERE id = v_uid;
    PERFORM public._tournament_log(
      v_m.tournament_id, 'match_aborted',
      COALESCE(v_name, 'A player') || ' aborted — a fresh board was set up',
      v_uid, jsonb_build_object('round', v_m.round, 'game_id', v_new));

    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT u, 'tournament_round', 'Match restarted',
           'The game was aborted; a fresh board is ready.',
           '/game/' || v_new::text
    FROM unnest(ARRAY[v_m.player1_id, v_m.player2_id]) AS u
    WHERE u IS NOT NULL;

    RETURN v_new;
  ELSE
    UPDATE public.games SET
      status = 'finished', result = 'aborted', end_reason = 'aborted', ended_at = now()
    WHERE id = p_game_id;
    RETURN NULL;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.abort_game(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abort_game(UUID) TO authenticated, service_role;

-- 75.8 decline_draw — explicitly refuse an opponent's draw offer
DROP FUNCTION IF EXISTS public.decline_draw(UUID);
CREATE OR REPLACE FUNCTION public.decline_draw(p_game_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_g   public.games%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_g FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_uid <> v_g.white_id AND v_uid <> v_g.black_id THEN
    RAISE EXCEPTION 'Not a player in this game';
  END IF;
  IF v_g.draw_offered_by IS NULL OR v_g.draw_offered_by = v_uid THEN
    RAISE EXCEPTION 'No draw offer to decline';
  END IF;
  UPDATE public.games SET draw_offered_by = NULL WHERE id = p_game_id;
END; $$;
REVOKE ALL ON FUNCTION public.decline_draw(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_draw(UUID) TO authenticated, service_role;

-- 75.9 Client-safe grants for the cron fallbacks
-- Both functions are idempotent, validate all state transitions inside, and tak...
GRANT EXECUTE ON FUNCTION public.transition_locked_tournaments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_clock_sweep() TO authenticated;

-- 75.10 get_tournament_state v2 — arena ordering + captures feed
DROP FUNCTION IF EXISTS public.get_tournament_state(UUID);
CREATE OR REPLACE FUNCTION public.get_tournament_state(p_tournament_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_t        JSONB;
  v_entries  JSONB;
  v_matches  JSONB;
  v_activity JSONB;
  v_captures JSONB;
BEGIN
  SELECT to_jsonb(t) INTO v_t FROM public.tournaments t WHERE t.id = p_tournament_id;
  IF v_t IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x)
           ORDER BY x.score DESC, x.wins DESC, x.losses ASC,
                    x.fastest_win_ms ASC NULLS LAST, x.joined_at ASC), '[]'::jsonb)
  INTO v_entries
  FROM (
    SELECT e.id, e.user_id, e.score, e.rank, e.wins, e.losses, e.draws,
           e.piece_points, e.time_used_ms, e.fastest_win_ms,
           e.status, e.eliminated_in_round, e.joined_at,
           p.username, p.full_name, p.avatar_url, p.country, p.iq_rating, p.is_online,
           p.premium_active, p.premium_expires_at
    FROM public.tournament_entries e
    LEFT JOIN public.profiles p ON p.id = e.user_id
    WHERE e.tournament_id = p_tournament_id
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.round, m.slot), '[]'::jsonb)
  INTO v_matches
  FROM (
    SELECT tm.id, tm.round, tm.slot, tm.player1_id, tm.player2_id,
           tm.game_id, tm.winner_id, tm.status,
           p1.username AS player1_username, p2.username AS player2_username,
           g.status AS game_status, g.result AS game_result, g.fen, g.turn,
           g.moves_count, g.white_id, g.black_id,
           g.white_username, g.black_username,
           g.white_time_ms, g.black_time_ms, g.last_move_at, g.end_reason,
           g.created_at AS game_created_at, g.ended_at AS game_ended_at
    FROM public.tournament_matches tm
    LEFT JOIN public.profiles p1 ON p1.id = tm.player1_id
    LEFT JOIN public.profiles p2 ON p2.id = tm.player2_id
    LEFT JOIN public.games g ON g.id = tm.game_id
    WHERE tm.tournament_id = p_tournament_id
  ) m;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC, a.id DESC), '[]'::jsonb)
  INTO v_activity
  FROM (
    SELECT id, kind, message, actor_id, meta, created_at
    FROM public.tournament_activity
    WHERE tournament_id = p_tournament_id
    ORDER BY created_at DESC, id DESC
    LIMIT 40
  ) a;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC, c.id DESC), '[]'::jsonb)
  INTO v_captures
  FROM (
    SELECT cp.id, cp.match_id, cp.game_id, cp.user_id, cp.victim_id,
           cp.piece, cp.bonus, cp.ply, cp.created_at,
           pc.username AS capturer_username, pv.username AS victim_username
    FROM public.tournament_captured_pieces cp
    LEFT JOIN public.profiles pc ON pc.id = cp.user_id
    LEFT JOIN public.profiles pv ON pv.id = cp.victim_id
    WHERE cp.tournament_id = p_tournament_id
    ORDER BY cp.created_at DESC, cp.id DESC
    LIMIT 50
  ) c;

  RETURN jsonb_build_object(
    'server_now', now(),
    'viewer_id',  v_uid,
    'tournament', v_t,
    'entries',    v_entries,
    'matches',    v_matches,
    'activity',   v_activity,
    'captures',   v_captures
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_tournament_state(UUID) TO anon, authenticated, service_role;

-- 75.11 Admin TR panel RPCs
DROP FUNCTION IF EXISTS public.admin_tr_overview(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT);
CREATE OR REPLACE FUNCTION public.admin_tr_overview(
  p_status TEXT        DEFAULT NULL,
  p_search TEXT        DEFAULT NULL,
  p_from   TIMESTAMPTZ DEFAULT NULL,
  p_to     TIMESTAMPTZ DEFAULT NULL,
  p_limit  INT         DEFAULT 60,
  p_offset INT         DEFAULT 0
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_out JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT
      t.id, t.name, t.slug, t.status, t.time_control, t.format,
      t.entry_fee_coins, t.player_count, t.max_players,
      t.prize_1st, t.prize_2nd, t.prize_3rd, t.prize_4th,
      t.current_round, t.total_rounds, t.winner_display,
      t.prizes_distributed, t.created_at, t.starts_at, t.ends_at,
      COALESCE(fin.fees_collected, 0)  AS fees_collected,
      COALESCE(fin.refunds_paid, 0)    AS refunds_paid,
      COALESCE(fin.prizes_paid, 0)     AS prizes_paid,
      COALESCE(ms.total_matches, 0)    AS total_matches,
      COALESCE(ms.checkmates, 0)       AS checkmates,
      COALESCE(ms.resigns, 0)          AS resigns,
      COALESCE(ms.timeouts, 0)         AS timeouts,
      COALESCE(ms.no_shows, 0)         AS no_shows,
      COALESCE(ms.draws, 0)            AS draws,
      COALESCE(ab.aborted, 0)          AS aborted,
      COALESCE(cap.captures, 0)        AS captures,
      COALESCE(cap.capture_points, 0)  AS capture_points
    FROM public.tournaments t
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(-sum(amount) FILTER (WHERE type = 'tournament_entry'),  0) AS fees_collected,
        COALESCE( sum(amount) FILTER (WHERE type = 'tournament_refund'), 0) AS refunds_paid,
        COALESCE( sum(amount) FILTER (WHERE type = 'tournament_prize'),  0) AS prizes_paid
      FROM public.wallet_transactions wt
      WHERE wt.reference_id = t.id::text
    ) fin ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*)                                              AS total_matches,
        count(*) FILTER (WHERE g.end_reason = 'checkmate')    AS checkmates,
        count(*) FILTER (WHERE g.end_reason = 'resign')       AS resigns,
        count(*) FILTER (WHERE g.end_reason = 'timeout')      AS timeouts,
        count(*) FILTER (WHERE g.end_reason = 'no_show')      AS no_shows,
        count(*) FILTER (WHERE g.result = 'draw')             AS draws
      FROM public.tournament_matches tm
      LEFT JOIN public.games g ON g.id = tm.game_id
      WHERE tm.tournament_id = t.id
    ) ms ON true
    LEFT JOIN LATERAL (
-- Abort events come from the ledger: an aborted game gets replaced and un-refer...
      SELECT count(*) AS aborted
      FROM public.tournament_match_aborts a
      JOIN public.tournament_matches tm2 ON tm2.id = a.match_id
      WHERE tm2.tournament_id = t.id
    ) ab ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS captures, COALESCE(sum(bonus), 0) AS capture_points
      FROM public.tournament_captured_pieces cp
      WHERE cp.tournament_id = t.id
    ) cap ON true
    WHERE (p_status IS NULL OR t.status = p_status)
      AND (p_search IS NULL OR p_search = ''
           OR t.name ILIKE '%' || p_search || '%'
           OR t.id::text ILIKE p_search || '%'
           OR t.slug ILIKE '%' || p_search || '%')
      AND (p_from IS NULL OR t.created_at >= p_from)
      AND (p_to   IS NULL OR t.created_at <  p_to)
    ORDER BY t.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 200) OFFSET GREATEST(p_offset, 0)
  ) r;

  RETURN v_out;
END; $$;
REVOKE ALL ON FUNCTION public.admin_tr_overview(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_tr_overview(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_tr_finance(UUID);
CREATE OR REPLACE FUNCTION public.admin_tr_finance(p_tournament_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_out JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT wt.id, wt.user_id, p.username, wt.type, wt.amount,
           wt.balance_after, wt.description, wt.created_at
    FROM public.wallet_transactions wt
    LEFT JOIN public.profiles p ON p.id = wt.user_id
    WHERE wt.reference_id = p_tournament_id::text
      AND wt.type IN ('tournament_entry', 'tournament_refund', 'tournament_prize')
    ORDER BY wt.created_at DESC
    LIMIT 500
  ) r;

  RETURN v_out;
END; $$;
REVOKE ALL ON FUNCTION public.admin_tr_finance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_tr_finance(UUID) TO authenticated, service_role;










-- Section 75: TR ARENA — POINT SYSTEM, CAPTURES, ABORT, ADMIN (2026-07-15)
-- Layers the arena experience on top of the SECTION 74 knockout engine WITHOUT ...

-- 75.1 Columns
-- The server move handler (game.functions.ts) already writes these on every mov...
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS fen_before   TEXT;
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS time_used_ms INT;
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS is_capture   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS is_check     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_moves ADD COLUMN IF NOT EXISTS is_castling  BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tournament_entries ADD COLUMN IF NOT EXISTS fastest_win_ms BIGINT;

-- 75.2 Captured pieces ledger (drives the live bonus ticker)
CREATE TABLE IF NOT EXISTS public.tournament_captured_pieces (
  id            BIGSERIAL PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id      UUID NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  game_id       UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  victim_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  piece         TEXT NOT NULL CHECK (piece IN ('p', 'n', 'b', 'r', 'q')),
  bonus         INT NOT NULL,
  ply           INT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tr_captures_tournament
  ON public.tournament_captured_pieces(tournament_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tr_captures_game
  ON public.tournament_captured_pieces(game_id);
GRANT SELECT ON public.tournament_captured_pieces TO anon, authenticated;
GRANT ALL ON public.tournament_captured_pieces TO service_role;
ALTER TABLE public.tournament_captured_pieces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "TR captures public read" ON public.tournament_captured_pieces;
CREATE POLICY "TR captures public read"
  ON public.tournament_captured_pieces FOR SELECT USING (true);
-- Writes only via the SECURITY DEFINER move trigger below.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'tournament_captured_pieces'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_captured_pieces;
  END IF;
END $$;

-- Abort bookkeeping: one abort per player per match, enforced by UNIQUE.
CREATE TABLE IF NOT EXISTS public.tournament_match_aborts (
  id         BIGSERIAL PRIMARY KEY,
  match_id   UUID NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id)
);
GRANT SELECT ON public.tournament_match_aborts TO anon, authenticated;
GRANT ALL ON public.tournament_match_aborts TO service_role;
ALTER TABLE public.tournament_match_aborts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "TR aborts public read" ON public.tournament_match_aborts;
CREATE POLICY "TR aborts public read"
  ON public.tournament_match_aborts FOR SELECT USING (true);

-- 75.3 Arena point rules
DROP FUNCTION IF EXISTS public._tr_piece_bonus(TEXT);
CREATE OR REPLACE FUNCTION public._tr_piece_bonus(p_piece TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_piece
    WHEN 'p' THEN 2 WHEN 'n' THEN 8 WHEN 'b' THEN 5
    WHEN 'r' THEN 5 WHEN 'q' THEN 10 ELSE 0 END;
$$;

-- Which victim-side piece disappeared between two FENs
DROP FUNCTION IF EXISTS public._tr_captured_piece(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public._tr_captured_piece(
  p_before TEXT, p_after TEXT, p_victim_color TEXT
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_b  TEXT := split_part(COALESCE(p_before, ''), ' ', 1);
  v_a  TEXT := split_part(COALESCE(p_after, ''), ' ', 1);
  v_t  TEXT;
  v_ch TEXT;
BEGIN
  IF v_b = '' OR v_a = '' THEN RETURN NULL; END IF;
  FOREACH v_t IN ARRAY ARRAY['q', 'r', 'b', 'n', 'p'] LOOP
    v_ch := CASE WHEN p_victim_color = 'w' THEN upper(v_t) ELSE v_t END;
    IF (length(v_b) - length(replace(v_b, v_ch, '')))
     > (length(v_a) - length(replace(v_a, v_ch, ''))) THEN
      RETURN v_t;
    END IF;
  END LOOP;
  RETURN NULL;
END; $$;

-- 75.4 Live capture bonus: fires on every recorded move
DROP TRIGGER IF EXISTS trg_tournament_move ON public.game_moves;
DROP FUNCTION IF EXISTS public.handle_tournament_move();
CREATE OR REPLACE FUNCTION public.handle_tournament_move()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m            RECORD;
  v_victim_color TEXT;
  v_piece        TEXT;
  v_bonus        INT;
BEGIN
  IF NEW.by_user IS NULL OR NEW.fen_before IS NULL OR NEW.fen_after IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tm.tournament_id, tm.id AS match_id, g.white_id, g.black_id
  INTO v_m
  FROM public.tournament_matches tm
  JOIN public.games g ON g.id = tm.game_id
  WHERE tm.game_id = NEW.game_id AND tm.status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_victim_color := CASE WHEN NEW.by_user = v_m.white_id THEN 'b' ELSE 'w' END;
  v_piece := public._tr_captured_piece(NEW.fen_before, NEW.fen_after, v_victim_color);
  IF v_piece IS NULL THEN RETURN NEW; END IF;
  v_bonus := public._tr_piece_bonus(v_piece);
  IF v_bonus <= 0 THEN RETURN NEW; END IF;

  UPDATE public.tournament_entries SET
    score        = score + v_bonus,
    piece_points = piece_points + v_bonus
  WHERE tournament_id = v_m.tournament_id AND user_id = NEW.by_user;

  INSERT INTO public.tournament_captured_pieces
    (tournament_id, match_id, game_id, user_id, victim_id, piece, bonus, ply)
  VALUES
    (v_m.tournament_id, v_m.match_id, NEW.game_id, NEW.by_user,
     CASE WHEN v_victim_color = 'w' THEN v_m.white_id ELSE v_m.black_id END,
     v_piece, v_bonus, NEW.ply);

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_tournament_move
  AFTER INSERT ON public.game_moves
  FOR EACH ROW EXECUTE FUNCTION public.handle_tournament_move();

-- 75.5 Finish scoring v2: WIN +5 / LOSS −5 / DRAW +2, fastest-win tiebreak
-- Same structure as SECTION 74's version; only the scoring block and the tiebre...
CREATE OR REPLACE FUNCTION public.handle_tournament_game_finished()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match       public.tournament_matches%ROWTYPE;
  v_t           public.tournaments%ROWTYPE;
  v_winner      UUID;
  v_loser       UUID;
  v_is_draw     BOOLEAN := false;
  v_wname       TEXT;
  v_lname       TEXT;
  v_white_used  BIGINT;
  v_black_used  BIGINT;
  v_duration_ms BIGINT;
  v_pending     INT;
  v_in_round    INT;
BEGIN
  SELECT * INTO v_match FROM public.tournament_matches
  WHERE game_id = NEW.id AND status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Serialize all bracket processing per tournament.
  SELECT * INTO v_t FROM public.tournaments WHERE id = v_match.tournament_id FOR UPDATE;
  IF NOT FOUND OR v_t.status <> 'live' THEN RETURN NEW; END IF;

  IF NEW.result = 'white' THEN
    v_winner := NEW.white_id;
  ELSIF NEW.result = 'black' THEN
    v_winner := NEW.black_id;
  ELSE
    v_is_draw := (NEW.result = 'draw');
    v_winner := CASE WHEN COALESCE(NEW.white_time_ms, 0) >= COALESCE(NEW.black_time_ms, 0)
                     THEN NEW.white_id ELSE NEW.black_id END;
  END IF;
  v_loser := CASE WHEN v_winner = NEW.white_id THEN NEW.black_id ELSE NEW.white_id END;

  UPDATE public.tournament_matches SET winner_id = v_winner, status = 'finished'
  WHERE id = v_match.id;

  v_white_used  := GREATEST(0, NEW.initial_seconds::BIGINT * 1000 - COALESCE(NEW.white_time_ms, 0));
  v_black_used  := GREATEST(0, NEW.initial_seconds::BIGINT * 1000 - COALESCE(NEW.black_time_ms, 0));
  v_duration_ms := GREATEST(0,
    (EXTRACT(EPOCH FROM (COALESCE(NEW.ended_at, now()) - NEW.created_at)) * 1000)::BIGINT);

-- Arena points: WIN +5, LOSS −5, DRAW both +2 (the clock-tiebreak "winner" of a...
  UPDATE public.tournament_entries SET
    wins   = wins   + CASE WHEN NOT v_is_draw AND user_id = v_winner THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN NOT v_is_draw AND user_id = v_loser  THEN 1 ELSE 0 END,
    draws  = draws  + CASE WHEN v_is_draw THEN 1 ELSE 0 END,
    score  = score  + CASE WHEN v_is_draw THEN 2
                           WHEN user_id = v_winner THEN 5
                           ELSE -5 END,
    time_used_ms = time_used_ms + CASE WHEN user_id = NEW.white_id THEN v_white_used ELSE v_black_used END,
    fastest_win_ms = CASE WHEN NOT v_is_draw AND user_id = v_winner
                          THEN LEAST(COALESCE(fastest_win_ms, 9223372036854775807), v_duration_ms)
                          ELSE fastest_win_ms END,
    status = CASE WHEN user_id = v_loser THEN 'eliminated' ELSE status END,
    eliminated_in_round = CASE WHEN user_id = v_loser THEN v_match.round ELSE eliminated_in_round END
  WHERE tournament_id = v_t.id AND user_id IN (NEW.white_id, NEW.black_id);

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
    PERFORM public._tournament_log(
      v_t.id, 'round_finished', 'Round ' || v_t.current_round || ' complete',
      NULL, jsonb_build_object('round', v_t.current_round));
    IF v_in_round = 1 THEN
      PERFORM public._tournament_complete(v_t.id);
    ELSE
      PERFORM public._tournament_start_round(v_t.id);
    END IF;
  END IF;

  RETURN NEW;
END; $$;

-- 75.6 Final placings use the arena tiebreaks
-- points → wins → fewest losses → fastest win, per the arena rules.
CREATE OR REPLACE FUNCTION public._tournament_complete(p_tournament_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t        public.tournaments%ROWTYPE;
  v_final    public.tournament_matches%ROWTYPE;
  v_champion UUID;
  v_runner   UUID;
  v_semis    UUID[];
  v_third    UUID;
  v_fourth   UUID;
  v_name     TEXT;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND OR v_t.status <> 'live' THEN RETURN; END IF;

  SELECT * INTO v_final
  FROM public.tournament_matches
  WHERE tournament_id = p_tournament_id AND round = v_t.current_round
  ORDER BY slot LIMIT 1;
  IF NOT FOUND OR v_final.winner_id IS NULL THEN RETURN; END IF;

  v_champion := v_final.winner_id;
  v_runner   := CASE WHEN v_final.player1_id = v_champion THEN v_final.player2_id ELSE v_final.player1_id END;

  SELECT COALESCE(array_agg(s.loser
           ORDER BY e.score DESC, e.wins DESC, e.losses ASC,
                    e.fastest_win_ms ASC NULLS LAST), '{}')
  INTO v_semis
  FROM (
    SELECT CASE WHEN m.winner_id = m.player1_id THEN m.player2_id ELSE m.player1_id END AS loser
    FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.round = v_t.current_round - 1
      AND m.status = 'finished'
  ) s
  JOIN public.tournament_entries e ON e.tournament_id = p_tournament_id AND e.user_id = s.loser
  WHERE s.loser IS NOT NULL;
  v_third  := v_semis[1];
  v_fourth := v_semis[2];

  UPDATE public.tournament_entries SET rank = 1, status = 'winner'
  WHERE tournament_id = p_tournament_id AND user_id = v_champion;
  UPDATE public.tournament_entries SET rank = 2, status = 'runner_up'
  WHERE tournament_id = p_tournament_id AND user_id = v_runner;
  UPDATE public.tournament_entries SET rank = 3, status = 'third'
  WHERE tournament_id = p_tournament_id AND user_id = v_third;
  UPDATE public.tournament_entries SET rank = 4, status = 'fourth'
  WHERE tournament_id = p_tournament_id AND user_id = v_fourth;

  UPDATE public.tournament_entries e SET rank = ranked.rnk
  FROM (
    SELECT user_id,
           4 + ROW_NUMBER() OVER (
             ORDER BY score DESC, wins DESC, losses ASC,
                      fastest_win_ms ASC NULLS LAST, joined_at ASC
           ) AS rnk
    FROM public.tournament_entries
    WHERE tournament_id = p_tournament_id
      AND user_id IS DISTINCT FROM v_champion
      AND user_id IS DISTINCT FROM v_runner
      AND user_id IS DISTINCT FROM v_third
      AND user_id IS DISTINCT FROM v_fourth
  ) ranked
  WHERE e.tournament_id = p_tournament_id AND e.user_id = ranked.user_id;

  PERFORM public._tournament_award_prize(v_t, v_champion, v_t.prize_1st, '1st');
  PERFORM public._tournament_award_prize(v_t, v_runner,   v_t.prize_2nd, '2nd');
  PERFORM public._tournament_award_prize(v_t, v_third,    v_t.prize_3rd, '3rd');
  PERFORM public._tournament_award_prize(v_t, v_fourth,   v_t.prize_4th, '4th');

  SELECT username INTO v_name FROM public.profiles WHERE id = v_champion;

  UPDATE public.tournaments SET
    status             = 'completed',
    ends_at            = now(),
    prizes_distributed = true,
    winner_display     = COALESCE(v_name, winner_display)
  WHERE id = p_tournament_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT user_id, 'tournament_finished',
         'Tournament finished',
         COALESCE(v_name, 'The champion') || ' won ' || v_t.name || '. Check the final standings.',
         '/tournament/' || p_tournament_id::text
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id;

  PERFORM public._tournament_log(
    p_tournament_id, 'tournament_finished',
    COALESCE(v_name, 'The champion') || ' is the champion! 🏆',
    v_champion, jsonb_build_object('winner', v_name));
END; $$;

-- 75.7 abort_game — chess.com-style abort
-- Allowed while at most one move has been played
DROP FUNCTION IF EXISTS public.abort_game(UUID);
CREATE OR REPLACE FUNCTION public.abort_game(p_game_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_g    public.games%ROWTYPE;
  v_m    public.tournament_matches%ROWTYPE;
  v_t    public.tournaments%ROWTYPE;
  v_new  UUID;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_g FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_g.status <> 'active' THEN RAISE EXCEPTION 'Game is not active'; END IF;
  IF v_uid <> v_g.white_id AND v_uid <> v_g.black_id THEN
    RAISE EXCEPTION 'Not a player in this game';
  END IF;
  IF v_g.moves_count > 1 THEN
    RAISE EXCEPTION 'Too late to abort — resign instead';
  END IF;

  SELECT * INTO v_m FROM public.tournament_matches
  WHERE game_id = p_game_id AND status = 'active' FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_t FROM public.tournaments WHERE id = v_m.tournament_id FOR UPDATE;
    IF v_t.status <> 'live' THEN RAISE EXCEPTION 'Tournament is not live'; END IF;

    BEGIN
      INSERT INTO public.tournament_match_aborts (match_id, user_id) VALUES (v_m.id, v_uid);
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'You already aborted this match once — resign instead';
    END;

-- Fresh board for the same pairing, re-pointed BEFORE the old game is ended so ...
    v_new := public._tournament_create_game(v_t, v_m.player1_id, v_m.player2_id);
    UPDATE public.tournament_matches SET game_id = v_new WHERE id = v_m.id;

    UPDATE public.games SET
      status = 'finished', result = 'aborted', end_reason = 'aborted', ended_at = now()
    WHERE id = p_game_id;

    SELECT username INTO v_name FROM public.profiles WHERE id = v_uid;
    PERFORM public._tournament_log(
      v_m.tournament_id, 'match_aborted',
      COALESCE(v_name, 'A player') || ' aborted — a fresh board was set up',
      v_uid, jsonb_build_object('round', v_m.round, 'game_id', v_new));

    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT u, 'tournament_round', 'Match restarted',
           'The game was aborted; a fresh board is ready.',
           '/game/' || v_new::text
    FROM unnest(ARRAY[v_m.player1_id, v_m.player2_id]) AS u
    WHERE u IS NOT NULL;

    RETURN v_new;
  ELSE
    UPDATE public.games SET
      status = 'finished', result = 'aborted', end_reason = 'aborted', ended_at = now()
    WHERE id = p_game_id;
    RETURN NULL;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.abort_game(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abort_game(UUID) TO authenticated, service_role;

-- 75.8 decline_draw — explicitly refuse an opponent's draw offer
DROP FUNCTION IF EXISTS public.decline_draw(UUID);
CREATE OR REPLACE FUNCTION public.decline_draw(p_game_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_g   public.games%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_g FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_uid <> v_g.white_id AND v_uid <> v_g.black_id THEN
    RAISE EXCEPTION 'Not a player in this game';
  END IF;
  IF v_g.draw_offered_by IS NULL OR v_g.draw_offered_by = v_uid THEN
    RAISE EXCEPTION 'No draw offer to decline';
  END IF;
  UPDATE public.games SET draw_offered_by = NULL WHERE id = p_game_id;
END; $$;
REVOKE ALL ON FUNCTION public.decline_draw(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_draw(UUID) TO authenticated, service_role;

-- 75.9 Client-safe grants for the cron fallbacks
-- Both functions are idempotent, validate all state transitions inside, and tak...
GRANT EXECUTE ON FUNCTION public.transition_locked_tournaments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_clock_sweep() TO authenticated;

-- 75.10 get_tournament_state v2 — arena ordering + captures feed
DROP FUNCTION IF EXISTS public.get_tournament_state(UUID);
CREATE OR REPLACE FUNCTION public.get_tournament_state(p_tournament_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_t        JSONB;
  v_entries  JSONB;
  v_matches  JSONB;
  v_activity JSONB;
  v_captures JSONB;
BEGIN
  SELECT to_jsonb(t) INTO v_t FROM public.tournaments t WHERE t.id = p_tournament_id;
  IF v_t IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x)
           ORDER BY x.score DESC, x.wins DESC, x.losses ASC,
                    x.fastest_win_ms ASC NULLS LAST, x.joined_at ASC), '[]'::jsonb)
  INTO v_entries
  FROM (
    SELECT e.id, e.user_id, e.score, e.rank, e.wins, e.losses, e.draws,
           e.piece_points, e.time_used_ms, e.fastest_win_ms,
           e.status, e.eliminated_in_round, e.joined_at,
           p.username, p.full_name, p.avatar_url, p.country, p.iq_rating, p.is_online,
           p.premium_active, p.premium_expires_at
    FROM public.tournament_entries e
    LEFT JOIN public.profiles p ON p.id = e.user_id
    WHERE e.tournament_id = p_tournament_id
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.round, m.slot), '[]'::jsonb)
  INTO v_matches
  FROM (
    SELECT tm.id, tm.round, tm.slot, tm.player1_id, tm.player2_id,
           tm.game_id, tm.winner_id, tm.status,
           p1.username AS player1_username, p2.username AS player2_username,
           g.status AS game_status, g.result AS game_result, g.fen, g.turn,
           g.moves_count, g.white_id, g.black_id,
           g.white_username, g.black_username,
           g.white_time_ms, g.black_time_ms, g.last_move_at, g.end_reason,
           g.created_at AS game_created_at, g.ended_at AS game_ended_at
    FROM public.tournament_matches tm
    LEFT JOIN public.profiles p1 ON p1.id = tm.player1_id
    LEFT JOIN public.profiles p2 ON p2.id = tm.player2_id
    LEFT JOIN public.games g ON g.id = tm.game_id
    WHERE tm.tournament_id = p_tournament_id
  ) m;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC, a.id DESC), '[]'::jsonb)
  INTO v_activity
  FROM (
    SELECT id, kind, message, actor_id, meta, created_at
    FROM public.tournament_activity
    WHERE tournament_id = p_tournament_id
    ORDER BY created_at DESC, id DESC
    LIMIT 40
  ) a;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC, c.id DESC), '[]'::jsonb)
  INTO v_captures
  FROM (
    SELECT cp.id, cp.match_id, cp.game_id, cp.user_id, cp.victim_id,
           cp.piece, cp.bonus, cp.ply, cp.created_at,
           pc.username AS capturer_username, pv.username AS victim_username
    FROM public.tournament_captured_pieces cp
    LEFT JOIN public.profiles pc ON pc.id = cp.user_id
    LEFT JOIN public.profiles pv ON pv.id = cp.victim_id
    WHERE cp.tournament_id = p_tournament_id
    ORDER BY cp.created_at DESC, cp.id DESC
    LIMIT 50
  ) c;

  RETURN jsonb_build_object(
    'server_now', now(),
    'viewer_id',  v_uid,
    'tournament', v_t,
    'entries',    v_entries,
    'matches',    v_matches,
    'activity',   v_activity,
    'captures',   v_captures
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_tournament_state(UUID) TO anon, authenticated, service_role;

-- 75.11 Admin TR panel RPCs
DROP FUNCTION IF EXISTS public.admin_tr_overview(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT);
CREATE OR REPLACE FUNCTION public.admin_tr_overview(
  p_status TEXT        DEFAULT NULL,
  p_search TEXT        DEFAULT NULL,
  p_from   TIMESTAMPTZ DEFAULT NULL,
  p_to     TIMESTAMPTZ DEFAULT NULL,
  p_limit  INT         DEFAULT 60,
  p_offset INT         DEFAULT 0
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_out JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT
      t.id, t.name, t.slug, t.status, t.time_control, t.format,
      t.entry_fee_coins, t.player_count, t.max_players,
      t.prize_1st, t.prize_2nd, t.prize_3rd, t.prize_4th,
      t.current_round, t.total_rounds, t.winner_display,
      t.prizes_distributed, t.created_at, t.starts_at, t.ends_at,
      COALESCE(fin.fees_collected, 0)  AS fees_collected,
      COALESCE(fin.refunds_paid, 0)    AS refunds_paid,
      COALESCE(fin.prizes_paid, 0)     AS prizes_paid,
      COALESCE(ms.total_matches, 0)    AS total_matches,
      COALESCE(ms.checkmates, 0)       AS checkmates,
      COALESCE(ms.resigns, 0)          AS resigns,
      COALESCE(ms.timeouts, 0)         AS timeouts,
      COALESCE(ms.no_shows, 0)         AS no_shows,
      COALESCE(ms.draws, 0)            AS draws,
      COALESCE(ab.aborted, 0)          AS aborted,
      COALESCE(cap.captures, 0)        AS captures,
      COALESCE(cap.capture_points, 0)  AS capture_points
    FROM public.tournaments t
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(-sum(amount) FILTER (WHERE type = 'tournament_entry'),  0) AS fees_collected,
        COALESCE( sum(amount) FILTER (WHERE type = 'tournament_refund'), 0) AS refunds_paid,
        COALESCE( sum(amount) FILTER (WHERE type = 'tournament_prize'),  0) AS prizes_paid
      FROM public.wallet_transactions wt
      WHERE wt.reference_id = t.id::text
    ) fin ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*)                                              AS total_matches,
        count(*) FILTER (WHERE g.end_reason = 'checkmate')    AS checkmates,
        count(*) FILTER (WHERE g.end_reason = 'resign')       AS resigns,
        count(*) FILTER (WHERE g.end_reason = 'timeout')      AS timeouts,
        count(*) FILTER (WHERE g.end_reason = 'no_show')      AS no_shows,
        count(*) FILTER (WHERE g.result = 'draw')             AS draws
      FROM public.tournament_matches tm
      LEFT JOIN public.games g ON g.id = tm.game_id
      WHERE tm.tournament_id = t.id
    ) ms ON true
    LEFT JOIN LATERAL (
-- Abort events come from the ledger: an aborted game gets replaced and un-refer...
      SELECT count(*) AS aborted
      FROM public.tournament_match_aborts a
      JOIN public.tournament_matches tm2 ON tm2.id = a.match_id
      WHERE tm2.tournament_id = t.id
    ) ab ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS captures, COALESCE(sum(bonus), 0) AS capture_points
      FROM public.tournament_captured_pieces cp
      WHERE cp.tournament_id = t.id
    ) cap ON true
    WHERE (p_status IS NULL OR t.status = p_status)
      AND (p_search IS NULL OR p_search = ''
           OR t.name ILIKE '%' || p_search || '%'
           OR t.id::text ILIKE p_search || '%'
           OR t.slug ILIKE '%' || p_search || '%')
      AND (p_from IS NULL OR t.created_at >= p_from)
      AND (p_to   IS NULL OR t.created_at <  p_to)
    ORDER BY t.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 200) OFFSET GREATEST(p_offset, 0)
  ) r;

  RETURN v_out;
END; $$;
REVOKE ALL ON FUNCTION public.admin_tr_overview(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_tr_overview(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_tr_finance(UUID);
CREATE OR REPLACE FUNCTION public.admin_tr_finance(p_tournament_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_out JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT wt.id, wt.user_id, p.username, wt.type, wt.amount,
           wt.balance_after, wt.description, wt.created_at
    FROM public.wallet_transactions wt
    LEFT JOIN public.profiles p ON p.id = wt.user_id
    WHERE wt.reference_id = p_tournament_id::text
      AND wt.type IN ('tournament_entry', 'tournament_refund', 'tournament_prize')
    ORDER BY wt.created_at DESC
    LIMIT 500
  ) r;

  RETURN v_out;
END; $$;
REVOKE ALL ON FUNCTION public.admin_tr_finance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_tr_finance(UUID) TO authenticated, service_role;
-- 3
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
    COALESCE(p.display_name, p.full_name) as display_name,
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



DROP FUNCTION IF EXISTS public.get_dynamic_leaderboard(text, text, text, text, text, text, boolean, integer, integer);


-- Section 28: CLAN SYSTEM V3 — PRODUCTION REBUILD
-- Ground-up hardening of the clan backend (frontend rebuilt in the same pass)

-- 28.1  STRUCTURE — clans
ALTER TABLE public.clans DROP CONSTRAINT IF EXISTS clans_max_members_check;
ALTER TABLE public.clans ALTER COLUMN max_members SET DEFAULT 50;
UPDATE public.clans SET max_members = 50 WHERE max_members <> 50;
ALTER TABLE public.clans ADD CONSTRAINT clans_max_members_check CHECK (max_members BETWEEN 1 AND 50);

ALTER TABLE public.clans ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.clans ADD COLUMN IF NOT EXISTS member_count INT NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clans_name_len') THEN
    ALTER TABLE public.clans ADD CONSTRAINT clans_name_len CHECK (char_length(name) BETWEEN 3 AND 20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clans_tag_format') THEN
    ALTER TABLE public.clans ADD CONSTRAINT clans_tag_format CHECK (tag ~ '^[A-Z0-9]{3,5}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clans_description_len') THEN
    ALTER TABLE public.clans ADD CONSTRAINT clans_description_len CHECK (char_length(COALESCE(description, '')) <= 500);
  END IF;
END $$;

-- Unique clan names, case-insensitive (slug/tag were already unique).
DROP INDEX IF EXISTS idx_clans_name_lower;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clans_name_lower ON public.clans (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_clans_rank ON public.clans (clan_score DESC, war_wins DESC, clan_rating DESC);

-- 28.2  STRUCTURE — members / requests / messages (FKs repointed to profiles so...
ALTER TABLE public.clan_members DROP CONSTRAINT IF EXISTS clan_members_user_id_fkey;
ALTER TABLE public.clan_members
  ADD CONSTRAINT clan_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.clan_members ADD COLUMN IF NOT EXISTS war_points INT NOT NULL DEFAULT 0;
ALTER TABLE public.clan_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.clan_join_requests DROP CONSTRAINT IF EXISTS clan_join_requests_user_id_fkey;
ALTER TABLE public.clan_join_requests
  ADD CONSTRAINT clan_join_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.clan_join_requests ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';
ALTER TABLE public.clan_join_requests ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.clan_join_requests ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_clan_join_requests_pending_clan ON public.clan_join_requests (clan_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_clan_join_requests_pending_user ON public.clan_join_requests (user_id) WHERE status = 'pending';

ALTER TABLE public.clan_join_requests DROP CONSTRAINT IF EXISTS clan_join_requests_user_id_fkey;
ALTER TABLE public.clan_join_requests
  ADD CONSTRAINT clan_join_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.clan_invites DROP CONSTRAINT IF EXISTS clan_invites_inviter_id_fkey;
ALTER TABLE public.clan_invites DROP CONSTRAINT IF EXISTS clan_invites_invitee_id_fkey;
ALTER TABLE public.clan_invites
  ADD CONSTRAINT clan_invites_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.clan_invites
  ADD CONSTRAINT clan_invites_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.clan_messages DROP CONSTRAINT IF EXISTS clan_messages_sender_id_fkey;
ALTER TABLE public.clan_messages
  ADD CONSTRAINT clan_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.clan_messages ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES public.clan_messages(id) ON DELETE SET NULL;
ALTER TABLE public.clan_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.clan_messages ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clan_messages_content_len') THEN
    ALTER TABLE public.clan_messages ADD CONSTRAINT clan_messages_content_len CHECK (char_length(content) BETWEEN 1 AND 2000);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_clan_messages_clan_time ON public.clan_messages (clan_id, created_at DESC);

-- 28.3  NEW TABLES — activity trail + deletion log
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
CREATE INDEX IF NOT EXISTS idx_clan_activity_clan_time ON public.clan_activity (clan_id, created_at DESC);

GRANT SELECT ON public.clan_activity TO authenticated;
GRANT ALL ON public.clan_activity TO service_role;
ALTER TABLE public.clan_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clan activity viewable by members" ON public.clan_activity;
CREATE POLICY "Clan activity viewable by members" ON public.clan_activity FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.clan_members WHERE clan_id = public.clan_activity.clan_id AND user_id = auth.uid()
  )
);

-- Survives clan deletion so admins can audit disbands ("Deleted Clans").
CREATE TABLE IF NOT EXISTS public.clan_deletion_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id      UUID NOT NULL,
  name         TEXT NOT NULL,
  tag          TEXT NOT NULL,
  member_count INT NOT NULL DEFAULT 0,
  deleted_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason       TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clan_deletion_log TO authenticated;
GRANT ALL ON public.clan_deletion_log TO service_role;
ALTER TABLE public.clan_deletion_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view clan deletion log" ON public.clan_deletion_log;
CREATE POLICY "Admins view clan deletion log" ON public.clan_deletion_log FOR SELECT USING (public.is_admin());

-- 28.4  TRIGGERS — live member_count + message integrity
CREATE OR REPLACE FUNCTION public._clan_sync_member_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.clans SET member_count = member_count + 1 WHERE id = NEW.clan_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.clans SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.clan_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_clan_member_count ON public.clan_members;
CREATE TRIGGER trg_clan_member_count
  AFTER INSERT OR DELETE ON public.clan_members
  FOR EACH ROW EXECUTE FUNCTION public._clan_sync_member_count();

UPDATE public.clans c
SET member_count = (SELECT COUNT(*) FROM public.clan_members m WHERE m.clan_id = c.id);

-- Replies must stay inside the same clan.
CREATE OR REPLACE FUNCTION public._clan_message_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clan_messages m WHERE m.id = NEW.reply_to AND m.clan_id = NEW.clan_id
  ) THEN
    RAISE EXCEPTION 'Reply target not found in this clan';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_clan_message_guard ON public.clan_messages;
CREATE TRIGGER trg_clan_message_guard
  BEFORE INSERT ON public.clan_messages
  FOR EACH ROW EXECUTE FUNCTION public._clan_message_guard();

-- 28.5  LEADERBOARD VIEW — counter column + global rank
DROP VIEW IF EXISTS public.clan_leaderboard;
CREATE VIEW public.clan_leaderboard AS
SELECT
  c.id, c.slug, c.name, c.tag, c.description, c.logo_url, c.banner_url,
  c.country, c.language, c.privacy, c.max_members, c.member_count,
  c.clan_rating, c.clan_score, c.war_wins, c.war_losses, c.war_draws,
  c.total_wars, c.clan_level, c.clan_xp, c.created_at,
  RANK() OVER (ORDER BY c.clan_score DESC, c.war_wins DESC, c.clan_rating DESC, c.created_at ASC) AS global_rank
FROM public.clans c;
GRANT SELECT ON public.clan_leaderboard TO authenticated, anon;

-- 28.6  RLS — reads stay open where public, privileged writes RPC-only
-- Join requests: admins can audit; approve/reject now go through RPCs so the di...
DROP POLICY IF EXISTS "Officers manage join requests" ON public.clan_join_requests;
DROP POLICY IF EXISTS "View own join requests" ON public.clan_join_requests;
CREATE POLICY "View own join requests" ON public.clan_join_requests FOR SELECT USING (
  auth.uid() = user_id OR public.is_admin() OR EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE clan_id = public.clan_join_requests.clan_id AND user_id = auth.uid() AND role IN ('leader', 'co_leader')
  )
);