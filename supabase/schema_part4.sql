
-- Messages: members read their clan's chat (admins can audit, incl
DROP POLICY IF EXISTS "Clan members can chat" ON public.clan_messages;
CREATE POLICY "Clan members can chat" ON public.clan_messages FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.clan_members WHERE clan_id = public.clan_messages.clan_id AND user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "Clan members can send messages" ON public.clan_messages;
CREATE POLICY "Clan members can send messages" ON public.clan_messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id
  AND content_type = 'text'
  AND deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = public.clan_messages.clan_id AND user_id = auth.uid())
);
DROP POLICY IF EXISTS "Clan members/mods can delete messages" ON public.clan_messages;

-- Wars: declaring/responding are leader-only RPCs now.
DROP POLICY IF EXISTS "Clan officers can declare war" ON public.clan_wars;
DROP POLICY IF EXISTS "Clan officers can update war status" ON public.clan_wars;

-- Realtime for the activity feed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clan_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clan_activity;
  END IF;
END $$;

-- 28.7  INTERNAL HELPERS (not client-callable)
CREATE OR REPLACE FUNCTION public._clan_notify(p_user_id UUID, p_kind TEXT, p_title TEXT, p_body TEXT, p_link TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, kind, title, message, body, link)
  VALUES (p_user_id, p_kind, p_kind, p_title, COALESCE(p_body, ''), p_body, p_link);
EXCEPTION WHEN OTHERS THEN
  NULL; -- a notification failure must never roll back the action itself
END;
$$;
REVOKE ALL ON FUNCTION public._clan_notify(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._clan_notify_officers(p_clan_id UUID, p_kind TEXT, p_title TEXT, p_body TEXT, p_link TEXT, p_exclude UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_officer UUID;
BEGIN
  FOR v_officer IN
    SELECT user_id FROM public.clan_members
    WHERE clan_id = p_clan_id AND role IN ('leader', 'co_leader')
      AND (p_exclude IS NULL OR user_id <> p_exclude)
  LOOP
    PERFORM public._clan_notify(v_officer, p_kind, p_title, p_body, p_link);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._clan_notify_officers(UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._clan_log(p_clan_id UUID, p_actor UUID, p_target UUID, p_type TEXT, p_meta JSONB DEFAULT '{}'::jsonb)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.clan_activity (clan_id, actor_id, target_id, type, meta)
  VALUES (p_clan_id, p_actor, p_target, p_type, COALESCE(p_meta, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public._clan_log(UUID, UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._clan_system_message(p_clan_id UUID, p_actor UUID, p_text TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.clan_messages (clan_id, sender_id, content, content_type)
  VALUES (p_clan_id, p_actor, p_text, 'system');
EXCEPTION WHEN OTHERS THEN
  NULL; -- system chat lines are best-effort
END;
$$;
REVOKE ALL ON FUNCTION public._clan_system_message(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- 28.8  RPCs — lifecycle (create / join / requests)
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
  v_user_id UUID := auth.uid();
  v_name TEXT := trim(p_name);
  v_tag TEXT := UPPER(trim(p_tag));
  v_slug TEXT;
  v_clan_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF v_name IS NULL OR char_length(v_name) < 3 OR char_length(v_name) > 20 THEN
    RAISE EXCEPTION 'Clan name must be between 3 and 20 characters';
  END IF;
  IF v_tag IS NULL OR v_tag !~ '^[A-Z0-9]{3,5}$' THEN
    RAISE EXCEPTION 'Clan tag must be 3-5 letters or numbers';
  END IF;
  IF char_length(COALESCE(p_description, '')) > 500 THEN
    RAISE EXCEPTION 'Description must be 500 characters or fewer';
  END IF;
  IF p_privacy NOT IN ('public', 'private', 'invite_only') THEN
    RAISE EXCEPTION 'Invalid privacy setting';
  END IF;

  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'You are already in a clan';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clans WHERE LOWER(name) = LOWER(v_name)) THEN
    RAISE EXCEPTION 'Clan name is already taken';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clans WHERE tag = v_tag) THEN
    RAISE EXCEPTION 'Clan tag is already taken';
  END IF;

  v_slug := trim(both '-' from LOWER(REGEXP_REPLACE(v_name, '[^a-zA-Z0-9]+', '-', 'g')));
  IF v_slug = '' THEN v_slug := 'clan'; END IF;
  v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6);

  INSERT INTO public.clans (slug, name, tag, description, country, language, privacy, logo_url, banner_url, created_by)
  VALUES (
    v_slug, v_name, v_tag, COALESCE(p_description, ''),
    COALESCE(NULLIF(trim(p_country), ''), 'International'),
    COALESCE(NULLIF(trim(p_language), ''), 'English'),
    p_privacy::public.clan_privacy, NULLIF(p_logo_url, ''), NULLIF(p_banner_url, ''), v_user_id
  ) RETURNING id INTO v_clan_id;

  INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (v_clan_id, v_user_id, 'leader');

  -- Creator is in a clan now; withdraw their pending requests everywhere.
  DELETE FROM public.clan_join_requests WHERE user_id = v_user_id AND status = 'pending';

  PERFORM public._clan_log(v_clan_id, v_user_id, NULL, 'created', jsonb_build_object('name', v_name, 'tag', v_tag));
  PERFORM public._clan_system_message(v_clan_id, v_user_id, 'Clan founded. Welcome!');

  RETURN v_clan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_create(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_request_join(UUID);
CREATE OR REPLACE FUNCTION public.clan_request_join(p_clan_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'You are already in a clan';
  END IF;

  -- Row lock serializes concurrent joins against the member cap.
  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clan not found'; END IF;

  IF v_clan.member_count >= v_clan.max_members THEN
    RAISE EXCEPTION 'Clan is full';
  END IF;
  IF v_clan.privacy = 'invite_only' THEN
    RAISE EXCEPTION 'This clan is invite only';
  END IF;

  IF v_clan.privacy = 'public' THEN
    INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (p_clan_id, v_user_id, 'member');
    DELETE FROM public.clan_join_requests WHERE user_id = v_user_id AND status = 'pending';
    PERFORM public._clan_log(p_clan_id, v_user_id, v_user_id, 'joined');
    SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;
    PERFORM public._clan_system_message(p_clan_id, v_user_id, COALESCE(v_username, 'A player') || ' joined the clan');
    RETURN 'joined';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clan_join_requests
    WHERE clan_id = p_clan_id AND user_id = v_user_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Your join request is already pending';
  END IF;

  INSERT INTO public.clan_join_requests (clan_id, user_id, status)
  VALUES (p_clan_id, v_user_id, 'pending')
  ON CONFLICT (clan_id, user_id)
  DO UPDATE SET status = 'pending', created_at = now(), resolved_by = NULL, resolved_at = NULL;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;
  PERFORM public._clan_notify_officers(
    p_clan_id, 'clan_request', 'New join request',
    COALESCE(v_username, 'A player') || ' wants to join ' || v_clan.name,
    '/clan/' || v_clan.slug
  );
  RETURN 'requested';
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_request_join(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clan_cancel_join_request(p_clan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.clan_join_requests
  WHERE clan_id = p_clan_id AND user_id = v_user_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'No pending request to cancel'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_cancel_join_request(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_approve_join(UUID);
CREATE OR REPLACE FUNCTION public.clan_approve_join(p_request_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req public.clan_join_requests;
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM public.clan_join_requests WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already handled'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE clan_id = v_req.clan_id AND user_id = v_user_id AND role IN ('leader', 'co_leader')
  ) THEN
    RAISE EXCEPTION 'Only the leader or a co-leader can approve requests';
  END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = v_req.clan_id FOR UPDATE;
  IF v_clan.member_count >= v_clan.max_members THEN
    RAISE EXCEPTION 'Clan is full';
  END IF;

  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = v_req.user_id) THEN
    UPDATE public.clan_join_requests
    SET status = 'rejected', resolved_by = v_user_id, resolved_at = now()
    WHERE id = p_request_id;
    RAISE EXCEPTION 'This player already joined another clan';
  END IF;

  UPDATE public.clan_join_requests
  SET status = 'accepted', resolved_by = v_user_id, resolved_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (v_req.clan_id, v_req.user_id, 'member');

  -- One clan per player: withdraw their other pending requests.
  DELETE FROM public.clan_join_requests
  WHERE user_id = v_req.user_id AND status = 'pending' AND id <> p_request_id;

  PERFORM public._clan_log(v_req.clan_id, v_user_id, v_req.user_id, 'request_approved');
  PERFORM public._clan_log(v_req.clan_id, v_req.user_id, v_req.user_id, 'joined');
  SELECT username INTO v_username FROM public.profiles WHERE id = v_req.user_id;
  PERFORM public._clan_system_message(v_req.clan_id, v_req.user_id, COALESCE(v_username, 'A player') || ' joined the clan');
  PERFORM public._clan_notify(
    v_req.user_id, 'clan_accepted', 'Join request accepted',
    'Welcome to ' || v_clan.name || ' [' || v_clan.tag || ']',
    '/clan/' || v_clan.slug
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_approve_join(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clan_reject_join(p_request_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req public.clan_join_requests;
  v_clan_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM public.clan_join_requests WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already handled'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE clan_id = v_req.clan_id AND user_id = v_user_id AND role IN ('leader', 'co_leader')
  ) THEN
    RAISE EXCEPTION 'Only the leader or a co-leader can reject requests';
  END IF;

  UPDATE public.clan_join_requests
  SET status = 'rejected', resolved_by = v_user_id, resolved_at = now()
  WHERE id = p_request_id;

  SELECT name INTO v_clan_name FROM public.clans WHERE id = v_req.clan_id;
  PERFORM public._clan_log(v_req.clan_id, v_user_id, v_req.user_id, 'request_rejected');
  PERFORM public._clan_notify(
    v_req.user_id, 'clan_rejected', 'Join request declined',
    'Your request to join ' || COALESCE(v_clan_name, 'the clan') || ' was declined', '/clans'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_reject_join(UUID) TO authenticated;

-- 28.9  RPCs — membership management
DROP FUNCTION IF EXISTS public.clan_promote_member(UUID, UUID);
CREATE OR REPLACE FUNCTION public.clan_promote_member(p_clan_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_caller_id AND role = 'leader') THEN
    RAISE EXCEPTION 'Only the leader can promote members';
  END IF;

  UPDATE public.clan_members SET role = 'co_leader'
  WHERE clan_id = p_clan_id AND user_id = p_user_id AND role = 'member';
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found or already a co-leader'; END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id;
  SELECT username INTO v_username FROM public.profiles WHERE id = p_user_id;
  PERFORM public._clan_log(p_clan_id, v_caller_id, p_user_id, 'promoted');
  PERFORM public._clan_system_message(p_clan_id, p_user_id, COALESCE(v_username, 'A player') || ' was promoted to Co-Leader');
  PERFORM public._clan_notify(p_user_id, 'clan_promotion', 'You were promoted',
    'You are now a Co-Leader of ' || v_clan.name, '/clan/' || v_clan.slug);
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_promote_member(UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_demote_member(UUID, UUID);
CREATE OR REPLACE FUNCTION public.clan_demote_member(p_clan_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_caller_id AND role = 'leader') THEN
    RAISE EXCEPTION 'Only the leader can demote co-leaders';
  END IF;

  UPDATE public.clan_members SET role = 'member'
  WHERE clan_id = p_clan_id AND user_id = p_user_id AND role = 'co_leader';
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found or not a co-leader'; END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id;
  SELECT username INTO v_username FROM public.profiles WHERE id = p_user_id;
  PERFORM public._clan_log(p_clan_id, v_caller_id, p_user_id, 'demoted');
  PERFORM public._clan_system_message(p_clan_id, p_user_id, COALESCE(v_username, 'A player') || ' was demoted to Member');
  PERFORM public._clan_notify(p_user_id, 'clan_demotion', 'Role changed',
    'You are now a Member of ' || v_clan.name, '/clan/' || v_clan.slug);
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_demote_member(UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_kick_member(UUID, UUID);
CREATE OR REPLACE FUNCTION public.clan_kick_member(p_clan_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role public.clan_role;
  v_target_role public.clan_role;
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_caller_id = p_user_id THEN RAISE EXCEPTION 'Use Leave Clan instead of kicking yourself'; END IF;

  SELECT role INTO v_caller_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role = 'member' THEN RAISE EXCEPTION 'Not authorized to kick'; END IF;

  SELECT role INTO v_target_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = p_user_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'Player is not in this clan'; END IF;
  IF v_target_role = 'leader' THEN RAISE EXCEPTION 'The leader cannot be kicked'; END IF;
  IF v_target_role = 'co_leader' AND v_caller_role <> 'leader' THEN
    RAISE EXCEPTION 'Only the leader can kick a co-leader';
  END IF;

  DELETE FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = p_user_id;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id;
  SELECT username INTO v_username FROM public.profiles WHERE id = p_user_id;
  PERFORM public._clan_log(p_clan_id, v_caller_id, p_user_id, 'kicked');
  PERFORM public._clan_system_message(p_clan_id, v_caller_id, COALESCE(v_username, 'A player') || ' was removed from the clan');
  PERFORM public._clan_notify(p_user_id, 'clan_kick', 'Removed from clan',
    'You were removed from ' || v_clan.name, '/clans');
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_kick_member(UUID, UUID) TO authenticated;

-- Spec: the leader must transfer leadership before leaving
DROP FUNCTION IF EXISTS public.clan_leave(UUID);
CREATE OR REPLACE FUNCTION public.clan_leave(p_clan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role public.clan_role;
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id;
  IF v_role IS NULL THEN RAISE EXCEPTION 'You are not a member of this clan'; END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id FOR UPDATE;

  IF v_role = 'leader' AND v_clan.member_count > 1 THEN
    RAISE EXCEPTION 'Transfer leadership before leaving the clan';
  END IF;

  DELETE FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id;

  IF v_clan.member_count <= 1 THEN
    INSERT INTO public.clan_deletion_log (clan_id, name, tag, member_count, deleted_by, reason)
    VALUES (v_clan.id, v_clan.name, v_clan.tag, 0, v_user_id, 'Last member left');
    DELETE FROM public.clans WHERE id = p_clan_id;
  ELSE
    SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;
    PERFORM public._clan_log(p_clan_id, v_user_id, v_user_id, 'left');
    PERFORM public._clan_system_message(p_clan_id, v_user_id, COALESCE(v_username, 'A player') || ' left the clan');
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_leave(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_transfer_leadership(UUID, UUID);
CREATE OR REPLACE FUNCTION public.clan_transfer_leadership(p_clan_id UUID, p_new_leader_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_user_id = p_new_leader_id THEN RAISE EXCEPTION 'You are already the leader'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id AND role = 'leader') THEN
    RAISE EXCEPTION 'Only the leader can transfer leadership';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = p_new_leader_id) THEN
    RAISE EXCEPTION 'Target player is not in this clan';
  END IF;

  UPDATE public.clan_members SET role = 'co_leader' WHERE clan_id = p_clan_id AND user_id = v_user_id;
  UPDATE public.clan_members SET role = 'leader' WHERE clan_id = p_clan_id AND user_id = p_new_leader_id;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id;
  SELECT username INTO v_username FROM public.profiles WHERE id = p_new_leader_id;
  PERFORM public._clan_log(p_clan_id, v_user_id, p_new_leader_id, 'transferred');
  PERFORM public._clan_system_message(p_clan_id, p_new_leader_id, COALESCE(v_username, 'A player') || ' is the new clan Leader');
  PERFORM public._clan_notify(p_new_leader_id, 'clan_transfer', 'You are the new Leader',
    'Leadership of ' || v_clan.name || ' was transferred to you', '/clan/' || v_clan.slug);
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_transfer_leadership(UUID, UUID) TO authenticated;

-- 28.10  RPCs — clan settings / disband (leader only, per spec)
DROP FUNCTION IF EXISTS public.clan_update_details(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
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
  v_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id AND role = 'leader') THEN
    RAISE EXCEPTION 'Only the leader can edit clan details';
  END IF;

  IF v_name IS NOT NULL THEN
    IF char_length(v_name) < 3 OR char_length(v_name) > 20 THEN
      RAISE EXCEPTION 'Clan name must be between 3 and 20 characters';
    END IF;
    IF EXISTS (SELECT 1 FROM public.clans WHERE LOWER(name) = LOWER(v_name) AND id <> p_clan_id) THEN
      RAISE EXCEPTION 'Clan name is already taken';
    END IF;
  END IF;
  IF p_description IS NOT NULL AND char_length(p_description) > 500 THEN
    RAISE EXCEPTION 'Description must be 500 characters or fewer';
  END IF;
  IF p_privacy IS NOT NULL AND p_privacy NOT IN ('public', 'private', 'invite_only') THEN
    RAISE EXCEPTION 'Invalid privacy setting';
  END IF;

  UPDATE public.clans SET
    name        = COALESCE(v_name, name),
    description = COALESCE(p_description, description),
    country     = COALESCE(NULLIF(trim(p_country), ''), country),
    language    = COALESCE(NULLIF(trim(p_language), ''), language),
    privacy     = COALESCE(NULLIF(p_privacy, '')::public.clan_privacy, privacy),
    logo_url    = COALESCE(NULLIF(p_logo_url, ''), logo_url),
    banner_url  = COALESCE(NULLIF(p_banner_url, ''), banner_url)
  WHERE id = p_clan_id;

  PERFORM public._clan_log(p_clan_id, v_user_id, NULL, 'edited');
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_update_details(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_disband(UUID);
CREATE OR REPLACE FUNCTION public.clan_disband(p_clan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clan public.clans;
  v_member UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id AND role = 'leader') THEN
    RAISE EXCEPTION 'Only the leader can disband the clan';
  END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id FOR UPDATE;

  FOR v_member IN SELECT user_id FROM public.clan_members WHERE clan_id = p_clan_id AND user_id <> v_user_id LOOP
    PERFORM public._clan_notify(v_member, 'clan_disband', 'Clan disbanded',
      v_clan.name || ' [' || v_clan.tag || '] was disbanded by its leader', '/clans');
  END LOOP;

  INSERT INTO public.clan_deletion_log (clan_id, name, tag, member_count, deleted_by, reason)
  VALUES (v_clan.id, v_clan.name, v_clan.tag, v_clan.member_count, v_user_id, 'Disbanded by leader');

  DELETE FROM public.clans WHERE id = p_clan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_disband(UUID) TO authenticated;

-- 28.11  RPCs — chat (soft delete + read status)
CREATE OR REPLACE FUNCTION public.clan_delete_message(p_message_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_msg public.clan_messages;
  v_can BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_msg FROM public.clan_messages WHERE id = p_message_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message not found'; END IF;

  v_can := v_msg.sender_id = v_user_id
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.clan_members
      WHERE clan_id = v_msg.clan_id AND user_id = v_user_id AND role IN ('leader', 'co_leader')
    );
  IF NOT v_can THEN RAISE EXCEPTION 'You can only delete your own messages'; END IF;

  UPDATE public.clan_messages SET deleted_at = now(), deleted_by = v_user_id WHERE id = p_message_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_delete_message(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clan_mark_read(p_clan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.clan_members SET last_read_at = now()
  WHERE clan_id = p_clan_id AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_mark_read(UUID) TO authenticated;

-- 28.12  RPCs — wars (declare: leader only; respond: defender leader)
CREATE OR REPLACE FUNCTION public.clan_declare_war(p_defender_clan_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_my_clan_id UUID;
  v_war_id UUID;
  v_my_clan public.clans;
  v_defender public.clans;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT clan_id INTO v_my_clan_id FROM public.clan_members WHERE user_id = v_user_id AND role = 'leader';
  IF v_my_clan_id IS NULL THEN RAISE EXCEPTION 'Only the clan leader can start wars'; END IF;
  IF v_my_clan_id = p_defender_clan_id THEN RAISE EXCEPTION 'You cannot declare war on your own clan'; END IF;

  SELECT * INTO v_defender FROM public.clans WHERE id = p_defender_clan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clan not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.clan_wars
    WHERE status IN ('pending', 'accepted', 'active')
      AND ((challenger_clan_id = v_my_clan_id AND defender_clan_id = p_defender_clan_id)
        OR (challenger_clan_id = p_defender_clan_id AND defender_clan_id = v_my_clan_id))
  ) THEN
    RAISE EXCEPTION 'A war with this clan is already in progress';
  END IF;

  INSERT INTO public.clan_wars (challenger_clan_id, defender_clan_id, status)
  VALUES (v_my_clan_id, p_defender_clan_id, 'pending')
  RETURNING id INTO v_war_id;

  SELECT * INTO v_my_clan FROM public.clans WHERE id = v_my_clan_id;
  PERFORM public._clan_log(v_my_clan_id, v_user_id, NULL, 'war_declared', jsonb_build_object('opponent', v_defender.name));
  PERFORM public._clan_notify_officers(
    p_defender_clan_id, 'clan_war', 'War declaration',
    v_my_clan.name || ' [' || v_my_clan.tag || '] declared war on your clan',
    '/clan/' || v_defender.slug
  );
  RETURN v_war_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_declare_war(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clan_respond_war(p_war_id UUID, p_accept BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_war public.clan_wars;
  v_challenger public.clans;
  v_defender public.clans;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'War not found or already answered'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE clan_id = v_war.defender_clan_id AND user_id = v_user_id AND role = 'leader'
  ) THEN
    RAISE EXCEPTION 'Only the defending clan leader can respond';
  END IF;

  SELECT * INTO v_challenger FROM public.clans WHERE id = v_war.challenger_clan_id;
  SELECT * INTO v_defender FROM public.clans WHERE id = v_war.defender_clan_id;

  IF p_accept THEN
    UPDATE public.clan_wars SET status = 'active', starts_at = now() WHERE id = p_war_id;
    PERFORM public._clan_log(v_war.challenger_clan_id, v_user_id, NULL, 'war_started', jsonb_build_object('opponent', v_defender.name));
    PERFORM public._clan_log(v_war.defender_clan_id, v_user_id, NULL, 'war_started', jsonb_build_object('opponent', v_challenger.name));
    PERFORM public._clan_notify_officers(v_war.challenger_clan_id, 'clan_war', 'War accepted',
      v_defender.name || ' accepted your war declaration', '/clan/' || v_challenger.slug);
  ELSE
    DELETE FROM public.clan_wars WHERE id = p_war_id;
    PERFORM public._clan_log(v_war.defender_clan_id, v_user_id, NULL, 'war_declined', jsonb_build_object('opponent', v_challenger.name));
    PERFORM public._clan_notify_officers(v_war.challenger_clan_id, 'clan_war', 'War declined',
      v_defender.name || ' declined your war declaration', '/clan/' || v_challenger.slug);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_respond_war(UUID, BOOLEAN) TO authenticated;

-- 28.13  RPC — admin clan removal (audited)
CREATE OR REPLACE FUNCTION public.admin_delete_clan(p_clan_id UUID, p_reason TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clan public.clans;
  v_member UUID;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clan not found'; END IF;

  FOR v_member IN SELECT user_id FROM public.clan_members WHERE clan_id = p_clan_id LOOP
    PERFORM public._clan_notify(v_member, 'clan_disband', 'Clan removed',
      v_clan.name || ' [' || v_clan.tag || '] was removed by moderation'
      || CASE WHEN COALESCE(p_reason, '') <> '' THEN ': ' || p_reason ELSE '' END, '/clans');
  END LOOP;

  INSERT INTO public.clan_deletion_log (clan_id, name, tag, member_count, deleted_by, reason)
  VALUES (v_clan.id, v_clan.name, v_clan.tag, v_clan.member_count, v_user_id,
    'Removed by admin' || CASE WHEN COALESCE(p_reason, '') <> '' THEN ': ' || p_reason ELSE '' END);

  DELETE FROM public.clans WHERE id = p_clan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_clan(UUID, TEXT) TO authenticated;


-- Section 29: CLAN SYSTEM V3 — HARDENING PASS
-- 1) Postgres grants EXECUTE on new functions to PUBLIC by default, so every cl...

DROP FUNCTION IF EXISTS public.increment_clan_wars(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.update_clan_war_scores(UUID, INT, INT);
DROP TRIGGER IF EXISTS trg_start_clan_war_matches ON public.clan_wars;
DROP FUNCTION IF EXISTS public.start_clan_war_matches();
DROP FUNCTION IF EXISTS public.update_clan_member_count(UUID, INT);

REVOKE ALL ON FUNCTION public._clan_sync_member_count() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'clan_create','clan_request_join','clan_cancel_join_request','clan_approve_join',
        'clan_reject_join','clan_promote_member','clan_demote_member','clan_kick_member',
        'clan_leave','clan_transfer_leadership','clan_update_details','clan_disband',
        'clan_delete_message','clan_mark_read','clan_declare_war','clan_respond_war',
        'admin_delete_clan'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', r.sig);
  END LOOP;
END $$;





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

-- Messages: members read their clan's chat (admins can audit, incl
DROP POLICY IF EXISTS "Clan members can chat" ON public.clan_messages;
CREATE POLICY "Clan members can chat" ON public.clan_messages FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.clan_members WHERE clan_id = public.clan_messages.clan_id AND user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "Clan members can send messages" ON public.clan_messages;
CREATE POLICY "Clan members can send messages" ON public.clan_messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id
  AND content_type = 'text'
  AND deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = public.clan_messages.clan_id AND user_id = auth.uid())
);
DROP POLICY IF EXISTS "Clan members/mods can delete messages" ON public.clan_messages;

-- Wars: declaring/responding are leader-only RPCs now.
DROP POLICY IF EXISTS "Clan officers can declare war" ON public.clan_wars;
DROP POLICY IF EXISTS "Clan officers can update war status" ON public.clan_wars;

-- Realtime for the activity feed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clan_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clan_activity;
  END IF;
END $$;

-- 28.7  INTERNAL HELPERS (not client-callable)
CREATE OR REPLACE FUNCTION public._clan_notify(p_user_id UUID, p_kind TEXT, p_title TEXT, p_body TEXT, p_link TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (p_user_id, p_kind, p_title, p_body, p_link);
EXCEPTION WHEN OTHERS THEN
  NULL; -- a notification failure must never roll back the action itself
END;
$$;
REVOKE ALL ON FUNCTION public._clan_notify(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._clan_notify_officers(p_clan_id UUID, p_kind TEXT, p_title TEXT, p_body TEXT, p_link TEXT, p_exclude UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_officer UUID;
BEGIN
  FOR v_officer IN
    SELECT user_id FROM public.clan_members
    WHERE clan_id = p_clan_id AND role IN ('leader', 'co_leader')
      AND (p_exclude IS NULL OR user_id <> p_exclude)
  LOOP
    PERFORM public._clan_notify(v_officer, p_kind, p_title, p_body, p_link);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._clan_notify_officers(UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._clan_log(p_clan_id UUID, p_actor UUID, p_target UUID, p_type TEXT, p_meta JSONB DEFAULT '{}'::jsonb)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.clan_activity (clan_id, actor_id, target_id, type, meta)
  VALUES (p_clan_id, p_actor, p_target, p_type, COALESCE(p_meta, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public._clan_log(UUID, UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._clan_system_message(p_clan_id UUID, p_actor UUID, p_text TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.clan_messages (clan_id, sender_id, content, content_type)
  VALUES (p_clan_id, p_actor, p_text, 'system');
EXCEPTION WHEN OTHERS THEN
  NULL; -- system chat lines are best-effort
END;
$$;
REVOKE ALL ON FUNCTION public._clan_system_message(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- 28.8  RPCs — lifecycle (create / join / requests)
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
  v_user_id UUID := auth.uid();
  v_name TEXT := trim(p_name);
  v_tag TEXT := UPPER(trim(p_tag));
  v_slug TEXT;
  v_clan_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF v_name IS NULL OR char_length(v_name) < 3 OR char_length(v_name) > 20 THEN
    RAISE EXCEPTION 'Clan name must be between 3 and 20 characters';
  END IF;
  IF v_tag IS NULL OR v_tag !~ '^[A-Z0-9]{3,5}$' THEN
    RAISE EXCEPTION 'Clan tag must be 3-5 letters or numbers';
  END IF;
  IF char_length(COALESCE(p_description, '')) > 500 THEN
    RAISE EXCEPTION 'Description must be 500 characters or fewer';
  END IF;
  IF p_privacy NOT IN ('public', 'private', 'invite_only') THEN
    RAISE EXCEPTION 'Invalid privacy setting';
  END IF;

  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'You are already in a clan';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clans WHERE LOWER(name) = LOWER(v_name)) THEN
    RAISE EXCEPTION 'Clan name is already taken';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clans WHERE tag = v_tag) THEN
    RAISE EXCEPTION 'Clan tag is already taken';
  END IF;

  v_slug := trim(both '-' from LOWER(REGEXP_REPLACE(v_name, '[^a-zA-Z0-9]+', '-', 'g')));
  IF v_slug = '' THEN v_slug := 'clan'; END IF;
  v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6);

  INSERT INTO public.clans (slug, name, tag, description, country, language, privacy, logo_url, banner_url, created_by)
  VALUES (
    v_slug, v_name, v_tag, COALESCE(p_description, ''),
    COALESCE(NULLIF(trim(p_country), ''), 'International'),
    COALESCE(NULLIF(trim(p_language), ''), 'English'),
    p_privacy::public.clan_privacy, NULLIF(p_logo_url, ''), NULLIF(p_banner_url, ''), v_user_id
  ) RETURNING id INTO v_clan_id;

  INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (v_clan_id, v_user_id, 'leader');

  -- Creator is in a clan now; withdraw their pending requests everywhere.
  DELETE FROM public.clan_join_requests WHERE user_id = v_user_id AND status = 'pending';

  PERFORM public._clan_log(v_clan_id, v_user_id, NULL, 'created', jsonb_build_object('name', v_name, 'tag', v_tag));
  PERFORM public._clan_system_message(v_clan_id, v_user_id, 'Clan founded. Welcome!');

  RETURN v_clan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_create(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_request_join(UUID);
CREATE OR REPLACE FUNCTION public.clan_request_join(p_clan_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'You are already in a clan';
  END IF;

  -- Row lock serializes concurrent joins against the member cap.
  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clan not found'; END IF;

  IF v_clan.member_count >= v_clan.max_members THEN
    RAISE EXCEPTION 'Clan is full';
  END IF;
  IF v_clan.privacy = 'invite_only' THEN
    RAISE EXCEPTION 'This clan is invite only';
  END IF;

  IF v_clan.privacy = 'public' THEN
    INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (p_clan_id, v_user_id, 'member');
    DELETE FROM public.clan_join_requests WHERE user_id = v_user_id AND status = 'pending';
    PERFORM public._clan_log(p_clan_id, v_user_id, v_user_id, 'joined');
    SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;
    PERFORM public._clan_system_message(p_clan_id, v_user_id, COALESCE(v_username, 'A player') || ' joined the clan');
    RETURN 'joined';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clan_join_requests
    WHERE clan_id = p_clan_id AND user_id = v_user_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Your join request is already pending';
  END IF;

  INSERT INTO public.clan_join_requests (clan_id, user_id, status)
  VALUES (p_clan_id, v_user_id, 'pending')
  ON CONFLICT (clan_id, user_id)
  DO UPDATE SET status = 'pending', created_at = now(), resolved_by = NULL, resolved_at = NULL;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;
  PERFORM public._clan_notify_officers(
    p_clan_id, 'clan_request', 'New join request',
    COALESCE(v_username, 'A player') || ' wants to join ' || v_clan.name,
    '/clan/' || v_clan.slug
  );
  RETURN 'requested';
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_request_join(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clan_cancel_join_request(p_clan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.clan_join_requests
  WHERE clan_id = p_clan_id AND user_id = v_user_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'No pending request to cancel'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_cancel_join_request(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_approve_join(UUID);
CREATE OR REPLACE FUNCTION public.clan_approve_join(p_request_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req public.clan_join_requests;
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM public.clan_join_requests WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already handled'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE clan_id = v_req.clan_id AND user_id = v_user_id AND role IN ('leader', 'co_leader')
  ) THEN
    RAISE EXCEPTION 'Only the leader or a co-leader can approve requests';
  END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = v_req.clan_id FOR UPDATE;
  IF v_clan.member_count >= v_clan.max_members THEN
    RAISE EXCEPTION 'Clan is full';
  END IF;

  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = v_req.user_id) THEN
    UPDATE public.clan_join_requests
    SET status = 'rejected', resolved_by = v_user_id, resolved_at = now()
    WHERE id = p_request_id;
    RAISE EXCEPTION 'This player already joined another clan';
  END IF;

  UPDATE public.clan_join_requests
  SET status = 'accepted', resolved_by = v_user_id, resolved_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (v_req.clan_id, v_req.user_id, 'member');

  -- One clan per player: withdraw their other pending requests.
  DELETE FROM public.clan_join_requests
  WHERE user_id = v_req.user_id AND status = 'pending' AND id <> p_request_id;

  PERFORM public._clan_log(v_req.clan_id, v_user_id, v_req.user_id, 'request_approved');
  PERFORM public._clan_log(v_req.clan_id, v_req.user_id, v_req.user_id, 'joined');
  SELECT username INTO v_username FROM public.profiles WHERE id = v_req.user_id;
  PERFORM public._clan_system_message(v_req.clan_id, v_req.user_id, COALESCE(v_username, 'A player') || ' joined the clan');
  PERFORM public._clan_notify(
    v_req.user_id, 'clan_accepted', 'Join request accepted',
    'Welcome to ' || v_clan.name || ' [' || v_clan.tag || ']',
    '/clan/' || v_clan.slug
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_approve_join(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clan_reject_join(p_request_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req public.clan_join_requests;
  v_clan_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM public.clan_join_requests WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already handled'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE clan_id = v_req.clan_id AND user_id = v_user_id AND role IN ('leader', 'co_leader')
  ) THEN
    RAISE EXCEPTION 'Only the leader or a co-leader can reject requests';
  END IF;

  UPDATE public.clan_join_requests
  SET status = 'rejected', resolved_by = v_user_id, resolved_at = now()
  WHERE id = p_request_id;

  SELECT name INTO v_clan_name FROM public.clans WHERE id = v_req.clan_id;
  PERFORM public._clan_log(v_req.clan_id, v_user_id, v_req.user_id, 'request_rejected');
  PERFORM public._clan_notify(
    v_req.user_id, 'clan_rejected', 'Join request declined',
    'Your request to join ' || COALESCE(v_clan_name, 'the clan') || ' was declined', '/clans'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_reject_join(UUID) TO authenticated;

-- 28.9  RPCs — membership management
DROP FUNCTION IF EXISTS public.clan_promote_member(UUID, UUID);
CREATE OR REPLACE FUNCTION public.clan_promote_member(p_clan_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_caller_id AND role = 'leader') THEN
    RAISE EXCEPTION 'Only the leader can promote members';
  END IF;

  UPDATE public.clan_members SET role = 'co_leader'
  WHERE clan_id = p_clan_id AND user_id = p_user_id AND role = 'member';
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found or already a co-leader'; END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id;
  SELECT username INTO v_username FROM public.profiles WHERE id = p_user_id;
  PERFORM public._clan_log(p_clan_id, v_caller_id, p_user_id, 'promoted');
  PERFORM public._clan_system_message(p_clan_id, p_user_id, COALESCE(v_username, 'A player') || ' was promoted to Co-Leader');
  PERFORM public._clan_notify(p_user_id, 'clan_promotion', 'You were promoted',
    'You are now a Co-Leader of ' || v_clan.name, '/clan/' || v_clan.slug);
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_promote_member(UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_demote_member(UUID, UUID);
CREATE OR REPLACE FUNCTION public.clan_demote_member(p_clan_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_caller_id AND role = 'leader') THEN
    RAISE EXCEPTION 'Only the leader can demote co-leaders';
  END IF;

  UPDATE public.clan_members SET role = 'member'
  WHERE clan_id = p_clan_id AND user_id = p_user_id AND role = 'co_leader';
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found or not a co-leader'; END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id;
  SELECT username INTO v_username FROM public.profiles WHERE id = p_user_id;
  PERFORM public._clan_log(p_clan_id, v_caller_id, p_user_id, 'demoted');
  PERFORM public._clan_system_message(p_clan_id, p_user_id, COALESCE(v_username, 'A player') || ' was demoted to Member');
  PERFORM public._clan_notify(p_user_id, 'clan_demotion', 'Role changed',
    'You are now a Member of ' || v_clan.name, '/clan/' || v_clan.slug);
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_demote_member(UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_kick_member(UUID, UUID);
CREATE OR REPLACE FUNCTION public.clan_kick_member(p_clan_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role public.clan_role;
  v_target_role public.clan_role;
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_caller_id = p_user_id THEN RAISE EXCEPTION 'Use Leave Clan instead of kicking yourself'; END IF;

  SELECT role INTO v_caller_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role = 'member' THEN RAISE EXCEPTION 'Not authorized to kick'; END IF;

  SELECT role INTO v_target_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = p_user_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'Player is not in this clan'; END IF;
  IF v_target_role = 'leader' THEN RAISE EXCEPTION 'The leader cannot be kicked'; END IF;
  IF v_target_role = 'co_leader' AND v_caller_role <> 'leader' THEN
    RAISE EXCEPTION 'Only the leader can kick a co-leader';
  END IF;

  DELETE FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = p_user_id;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id;
  SELECT username INTO v_username FROM public.profiles WHERE id = p_user_id;
  PERFORM public._clan_log(p_clan_id, v_caller_id, p_user_id, 'kicked');
  PERFORM public._clan_system_message(p_clan_id, v_caller_id, COALESCE(v_username, 'A player') || ' was removed from the clan');
  PERFORM public._clan_notify(p_user_id, 'clan_kick', 'Removed from clan',
    'You were removed from ' || v_clan.name, '/clans');
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_kick_member(UUID, UUID) TO authenticated;

-- Spec: the leader must transfer leadership before leaving
DROP FUNCTION IF EXISTS public.clan_leave(UUID);
CREATE OR REPLACE FUNCTION public.clan_leave(p_clan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role public.clan_role;
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id;
  IF v_role IS NULL THEN RAISE EXCEPTION 'You are not a member of this clan'; END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id FOR UPDATE;

  IF v_role = 'leader' AND v_clan.member_count > 1 THEN
    RAISE EXCEPTION 'Transfer leadership before leaving the clan';
  END IF;

  DELETE FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id;

  IF v_clan.member_count <= 1 THEN
    INSERT INTO public.clan_deletion_log (clan_id, name, tag, member_count, deleted_by, reason)
    VALUES (v_clan.id, v_clan.name, v_clan.tag, 0, v_user_id, 'Last member left');
    DELETE FROM public.clans WHERE id = p_clan_id;
  ELSE
    SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;
    PERFORM public._clan_log(p_clan_id, v_user_id, v_user_id, 'left');
    PERFORM public._clan_system_message(p_clan_id, v_user_id, COALESCE(v_username, 'A player') || ' left the clan');
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_leave(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_transfer_leadership(UUID, UUID);
CREATE OR REPLACE FUNCTION public.clan_transfer_leadership(p_clan_id UUID, p_new_leader_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clan public.clans;
  v_username TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_user_id = p_new_leader_id THEN RAISE EXCEPTION 'You are already the leader'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id AND role = 'leader') THEN
    RAISE EXCEPTION 'Only the leader can transfer leadership';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = p_new_leader_id) THEN
    RAISE EXCEPTION 'Target player is not in this clan';
  END IF;

  UPDATE public.clan_members SET role = 'co_leader' WHERE clan_id = p_clan_id AND user_id = v_user_id;
  UPDATE public.clan_members SET role = 'leader' WHERE clan_id = p_clan_id AND user_id = p_new_leader_id;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id;
  SELECT username INTO v_username FROM public.profiles WHERE id = p_new_leader_id;
  PERFORM public._clan_log(p_clan_id, v_user_id, p_new_leader_id, 'transferred');
  PERFORM public._clan_system_message(p_clan_id, p_new_leader_id, COALESCE(v_username, 'A player') || ' is the new clan Leader');
  PERFORM public._clan_notify(p_new_leader_id, 'clan_transfer', 'You are the new Leader',
    'Leadership of ' || v_clan.name || ' was transferred to you', '/clan/' || v_clan.slug);
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_transfer_leadership(UUID, UUID) TO authenticated;

-- 28.10  RPCs — clan settings / disband (leader only, per spec)
DROP FUNCTION IF EXISTS public.clan_update_details(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
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
  v_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id AND role = 'leader') THEN
    RAISE EXCEPTION 'Only the leader can edit clan details';
  END IF;

  IF v_name IS NOT NULL THEN
    IF char_length(v_name) < 3 OR char_length(v_name) > 20 THEN
      RAISE EXCEPTION 'Clan name must be between 3 and 20 characters';
    END IF;
    IF EXISTS (SELECT 1 FROM public.clans WHERE LOWER(name) = LOWER(v_name) AND id <> p_clan_id) THEN
      RAISE EXCEPTION 'Clan name is already taken';
    END IF;
  END IF;
  IF p_description IS NOT NULL AND char_length(p_description) > 500 THEN
    RAISE EXCEPTION 'Description must be 500 characters or fewer';
  END IF;
  IF p_privacy IS NOT NULL AND p_privacy NOT IN ('public', 'private', 'invite_only') THEN
    RAISE EXCEPTION 'Invalid privacy setting';
  END IF;

  UPDATE public.clans SET
    name        = COALESCE(v_name, name),
    description = COALESCE(p_description, description),
    country     = COALESCE(NULLIF(trim(p_country), ''), country),
    language    = COALESCE(NULLIF(trim(p_language), ''), language),
    privacy     = COALESCE(NULLIF(p_privacy, '')::public.clan_privacy, privacy),
    logo_url    = COALESCE(NULLIF(p_logo_url, ''), logo_url),
    banner_url  = COALESCE(NULLIF(p_banner_url, ''), banner_url)
  WHERE id = p_clan_id;

  PERFORM public._clan_log(p_clan_id, v_user_id, NULL, 'edited');
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_update_details(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.clan_disband(UUID);
CREATE OR REPLACE FUNCTION public.clan_disband(p_clan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clan public.clans;
  v_member UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id AND role = 'leader') THEN
    RAISE EXCEPTION 'Only the leader can disband the clan';
  END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id FOR UPDATE;

  FOR v_member IN SELECT user_id FROM public.clan_members WHERE clan_id = p_clan_id AND user_id <> v_user_id LOOP
    PERFORM public._clan_notify(v_member, 'clan_disband', 'Clan disbanded',
      v_clan.name || ' [' || v_clan.tag || '] was disbanded by its leader', '/clans');
  END LOOP;

  INSERT INTO public.clan_deletion_log (clan_id, name, tag, member_count, deleted_by, reason)
  VALUES (v_clan.id, v_clan.name, v_clan.tag, v_clan.member_count, v_user_id, 'Disbanded by leader');

  DELETE FROM public.clans WHERE id = p_clan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_disband(UUID) TO authenticated;

-- 28.11  RPCs — chat (soft delete + read status)
CREATE OR REPLACE FUNCTION public.clan_delete_message(p_message_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_msg public.clan_messages;
  v_can BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_msg FROM public.clan_messages WHERE id = p_message_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message not found'; END IF;

  v_can := v_msg.sender_id = v_user_id
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.clan_members
      WHERE clan_id = v_msg.clan_id AND user_id = v_user_id AND role IN ('leader', 'co_leader')
    );
  IF NOT v_can THEN RAISE EXCEPTION 'You can only delete your own messages'; END IF;

  UPDATE public.clan_messages SET deleted_at = now(), deleted_by = v_user_id WHERE id = p_message_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_delete_message(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clan_mark_read(p_clan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.clan_members SET last_read_at = now()
  WHERE clan_id = p_clan_id AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_mark_read(UUID) TO authenticated;

-- 28.12  RPCs — wars (declare: leader only; respond: defender leader)
CREATE OR REPLACE FUNCTION public.clan_declare_war(p_defender_clan_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_my_clan_id UUID;
  v_war_id UUID;
  v_my_clan public.clans;
  v_defender public.clans;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT clan_id INTO v_my_clan_id FROM public.clan_members WHERE user_id = v_user_id AND role = 'leader';
  IF v_my_clan_id IS NULL THEN RAISE EXCEPTION 'Only the clan leader can start wars'; END IF;
  IF v_my_clan_id = p_defender_clan_id THEN RAISE EXCEPTION 'You cannot declare war on your own clan'; END IF;

  SELECT * INTO v_defender FROM public.clans WHERE id = p_defender_clan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clan not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.clan_wars
    WHERE status IN ('pending', 'accepted', 'active')
      AND ((challenger_clan_id = v_my_clan_id AND defender_clan_id = p_defender_clan_id)
        OR (challenger_clan_id = p_defender_clan_id AND defender_clan_id = v_my_clan_id))
  ) THEN
    RAISE EXCEPTION 'A war with this clan is already in progress';
  END IF;

  INSERT INTO public.clan_wars (challenger_clan_id, defender_clan_id, status)
  VALUES (v_my_clan_id, p_defender_clan_id, 'pending')
  RETURNING id INTO v_war_id;

  SELECT * INTO v_my_clan FROM public.clans WHERE id = v_my_clan_id;
  PERFORM public._clan_log(v_my_clan_id, v_user_id, NULL, 'war_declared', jsonb_build_object('opponent', v_defender.name));
  PERFORM public._clan_notify_officers(
    p_defender_clan_id, 'clan_war', 'War declaration',
    v_my_clan.name || ' [' || v_my_clan.tag || '] declared war on your clan',
    '/clan/' || v_defender.slug
  );
  RETURN v_war_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_declare_war(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clan_respond_war(p_war_id UUID, p_accept BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_war public.clan_wars;
  v_challenger public.clans;
  v_defender public.clans;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'War not found or already answered'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE clan_id = v_war.defender_clan_id AND user_id = v_user_id AND role = 'leader'
  ) THEN
    RAISE EXCEPTION 'Only the defending clan leader can respond';
  END IF;

  SELECT * INTO v_challenger FROM public.clans WHERE id = v_war.challenger_clan_id;
  SELECT * INTO v_defender FROM public.clans WHERE id = v_war.defender_clan_id;

  IF p_accept THEN
    UPDATE public.clan_wars SET status = 'active', starts_at = now() WHERE id = p_war_id;
    PERFORM public._clan_log(v_war.challenger_clan_id, v_user_id, NULL, 'war_started', jsonb_build_object('opponent', v_defender.name));
    PERFORM public._clan_log(v_war.defender_clan_id, v_user_id, NULL, 'war_started', jsonb_build_object('opponent', v_challenger.name));
    PERFORM public._clan_notify_officers(v_war.challenger_clan_id, 'clan_war', 'War accepted',
      v_defender.name || ' accepted your war declaration', '/clan/' || v_challenger.slug);
  ELSE
    DELETE FROM public.clan_wars WHERE id = p_war_id;
    PERFORM public._clan_log(v_war.defender_clan_id, v_user_id, NULL, 'war_declined', jsonb_build_object('opponent', v_challenger.name));
    PERFORM public._clan_notify_officers(v_war.challenger_clan_id, 'clan_war', 'War declined',
      v_defender.name || ' declined your war declaration', '/clan/' || v_challenger.slug);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clan_respond_war(UUID, BOOLEAN) TO authenticated;

-- 28.13  RPC — admin clan removal (audited)
CREATE OR REPLACE FUNCTION public.admin_delete_clan(p_clan_id UUID, p_reason TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clan public.clans;
  v_member UUID;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clan not found'; END IF;

  FOR v_member IN SELECT user_id FROM public.clan_members WHERE clan_id = p_clan_id LOOP
    PERFORM public._clan_notify(v_member, 'clan_disband', 'Clan removed',
      v_clan.name || ' [' || v_clan.tag || '] was removed by moderation'
      || CASE WHEN COALESCE(p_reason, '') <> '' THEN ': ' || p_reason ELSE '' END, '/clans');
  END LOOP;

  INSERT INTO public.clan_deletion_log (clan_id, name, tag, member_count, deleted_by, reason)
  VALUES (v_clan.id, v_clan.name, v_clan.tag, v_clan.member_count, v_user_id,
    'Removed by admin' || CASE WHEN COALESCE(p_reason, '') <> '' THEN ': ' || p_reason ELSE '' END);

  DELETE FROM public.clans WHERE id = p_clan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_clan(UUID, TEXT) TO authenticated;
-- Section 29: CLAN SYSTEM V3 — HARDENING PASS
-- 1) Postgres grants EXECUTE on new functions to PUBLIC by default, so every cl...

DROP FUNCTION IF EXISTS public.increment_clan_wars(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.update_clan_war_scores(UUID, INT, INT);
DROP TRIGGER IF EXISTS trg_start_clan_war_matches ON public.clan_wars;
DROP FUNCTION IF EXISTS public.start_clan_war_matches();
DROP FUNCTION IF EXISTS public.update_clan_member_count(UUID, INT);

REVOKE ALL ON FUNCTION public._clan_sync_member_count() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'clan_create','clan_request_join','clan_cancel_join_request','clan_approve_join',
        'clan_reject_join','clan_promote_member','clan_demote_member','clan_kick_member',
        'clan_leave','clan_transfer_leadership','clan_update_details','clan_disband',
        'clan_delete_message','clan_mark_read','clan_declare_war','clan_respond_war',
        'admin_delete_clan'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', r.sig);
  END LOOP;
END $$;
-- Section 30: CLAN INVITE LINKS

CREATE TABLE IF NOT EXISTS public.clan_invite_links (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clan_invite_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.clan_invite_links TO authenticated;
GRANT ALL ON public.clan_invite_links TO service_role;

DROP POLICY IF EXISTS "View invite links for own clan" ON public.clan_invite_links;
CREATE POLICY "View invite links for own clan" ON public.clan_invite_links 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.clan_members 
    WHERE clan_id = public.clan_invite_links.clan_id 
    AND user_id = auth.uid() 
    AND role IN ('leader', 'co_leader')
  )
);

CREATE OR REPLACE FUNCTION public.generate_clan_invite_link(p_clan_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clan public.clans;
  v_role public.clan_role;
  v_token UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clan not found'; END IF;
  
  IF v_clan.privacy != 'invite_only' THEN 
    RAISE EXCEPTION 'Clan is not invite-only'; 
  END IF;
  
  SELECT role INTO v_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id;
  IF v_role NOT IN ('leader', 'co_leader') THEN 
    RAISE EXCEPTION 'Only leaders and co-leaders can generate invite links'; 
  END IF;
  
  INSERT INTO public.clan_invite_links (clan_id, created_by) 
  VALUES (p_clan_id, v_user_id) 
  RETURNING token INTO v_token;
  
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_clan_invite_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_clan_invite_link(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_clan_invite_link(p_token UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_link public.clan_invite_links;
  v_clan public.clans;
  v_existing_clan UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  -- Check if user is already in a clan
  SELECT clan_id INTO v_existing_clan FROM public.clan_members WHERE user_id = v_user_id;
  IF v_existing_clan IS NOT NULL THEN RAISE EXCEPTION 'You are already in a clan'; END IF;
  
  SELECT * INTO v_link FROM public.clan_invite_links WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite link'; END IF;
  
  IF v_link.is_used THEN RAISE EXCEPTION 'This invite link has expired'; END IF;
  
  SELECT * INTO v_clan FROM public.clans WHERE id = v_link.clan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clan not found'; END IF;
  
  IF (SELECT COUNT(*) FROM public.clan_members WHERE clan_id = v_clan.id) >= v_clan.max_members THEN
    RAISE EXCEPTION 'Clan is full';
  END IF;
  
  -- Mark as used
  UPDATE public.clan_invite_links SET is_used = true, used_by = v_user_id WHERE token = p_token;
  
  -- Join the clan
  INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (v_clan.id, v_user_id, 'member');
  
  -- Log activity
  PERFORM public._clan_log(v_clan.id, v_user_id, NULL, 'joined', '{}'::jsonb);
  PERFORM public._clan_sync_member_count(v_clan.id);
  
  -- Remove any pending requests
  DELETE FROM public.clan_join_requests WHERE user_id = v_user_id;
  
  RETURN v_clan.slug;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_clan_invite_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_clan_invite_link(UUID) TO authenticated;



-- Section 30: CLAN INVITE LINKS

CREATE TABLE IF NOT EXISTS public.clan_invite_links (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clan_invite_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.clan_invite_links TO authenticated;
GRANT ALL ON public.clan_invite_links TO service_role;

DROP POLICY IF EXISTS "View invite links for own clan" ON public.clan_invite_links;
CREATE POLICY "View invite links for own clan" ON public.clan_invite_links 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.clan_members 
    WHERE clan_id = public.clan_invite_links.clan_id 
    AND user_id = auth.uid() 
    AND role IN ('leader', 'co_leader')
  )
);

CREATE OR REPLACE FUNCTION public.generate_clan_invite_link(p_clan_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clan public.clans;
  v_role public.clan_role;
  v_token UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clan not found'; END IF;
  
  IF v_clan.privacy != 'invite_only' THEN 
    RAISE EXCEPTION 'Clan is not invite-only'; 
  END IF;
  
  SELECT role INTO v_role FROM public.clan_members WHERE clan_id = p_clan_id AND user_id = v_user_id;
  IF v_role NOT IN ('leader', 'co_leader') THEN 
    RAISE EXCEPTION 'Only leaders and co-leaders can generate invite links'; 
  END IF;
  
  INSERT INTO public.clan_invite_links (clan_id, created_by) 
  VALUES (p_clan_id, v_user_id) 
  RETURNING token INTO v_token;
  
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_clan_invite_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_clan_invite_link(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_clan_invite_link(p_token UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_link public.clan_invite_links;
  v_clan public.clans;
  v_existing_clan UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  -- Check if user is already in a clan
  SELECT clan_id INTO v_existing_clan FROM public.clan_members WHERE user_id = v_user_id;
  IF v_existing_clan IS NOT NULL THEN RAISE EXCEPTION 'You are already in a clan'; END IF;
  
  SELECT * INTO v_link FROM public.clan_invite_links WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite link'; END IF;
  
  IF v_link.is_used THEN RAISE EXCEPTION 'This invite link has expired'; END IF;
  
  SELECT * INTO v_clan FROM public.clans WHERE id = v_link.clan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clan not found'; END IF;
  
  IF (SELECT COUNT(*) FROM public.clan_members WHERE clan_id = v_clan.id) >= v_clan.max_members THEN
    RAISE EXCEPTION 'Clan is full';
  END IF;
  
  -- Mark as used
  UPDATE public.clan_invite_links SET is_used = true, used_by = v_user_id WHERE token = p_token;
  
  -- Join the clan
  INSERT INTO public.clan_members (clan_id, user_id, role) VALUES (v_clan.id, v_user_id, 'member');
  
  -- Log activity
  PERFORM public._clan_log(v_clan.id, v_user_id, NULL, 'joined', '{}'::jsonb);
  
  -- Remove any pending requests
  DELETE FROM public.clan_join_requests WHERE user_id = v_user_id;
  
  RETURN v_clan.slug;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_clan_invite_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_clan_invite_link(UUID) TO authenticated;


-- FIX FOR WORLD CHAT AUTO-JOIN

-- 1
UPDATE public.chat_channels 
SET type = 'global', is_private = false, is_permanent = true 
WHERE slug = 'global';

-- 2. Force update the chat_send_message function to ensure the correct auto-join logic is applied.
DROP FUNCTION IF EXISTS public.chat_send_message(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.chat_send_message(UUID, TEXT);

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


-- Section 76: KNOCKOUT V3 — RANDOM RE-PAIRING, PLATFORM REVENUE,
--             FIRST-MOVE CLOCK RULE (2026-07-19)
-- Pure-knockout upgrades layered on SECTIONS 74/75

-- 76.1 _tournament_start_round v3 — pure random pairing every round
-- Same contract and locking as v1 (74.4): caller holds the tournament row lock;...
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

-- 76.2 Platform revenue ledger
-- One row per completed paid tournament
CREATE TABLE IF NOT EXISTS public.tournament_platform_revenue (
  id            BIGSERIAL PRIMARY KEY,
  tournament_id UUID NOT NULL UNIQUE REFERENCES public.tournaments(id) ON DELETE CASCADE,
  gross_pool    INT NOT NULL,
  prizes_paid   INT NOT NULL,
  amount        INT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tournament_platform_revenue TO authenticated;
GRANT ALL ON public.tournament_platform_revenue TO service_role;
ALTER TABLE public.tournament_platform_revenue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Platform revenue admin read" ON public.tournament_platform_revenue;
CREATE POLICY "Platform revenue admin read"
  ON public.tournament_platform_revenue FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
-- No INSERT/UPDATE policies on purpose: only the SECURITY DEFINER completion pa...

-- 76.3 _tournament_complete v3 — prizes + platform revenue booking
-- SECTION 75's arena-tiebreak version plus: • gross pool measured from the wall...
CREATE OR REPLACE FUNCTION public._tournament_complete(p_tournament_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t           public.tournaments%ROWTYPE;
  v_final       public.tournament_matches%ROWTYPE;
  v_champion    UUID;
  v_runner      UUID;
  v_semis       UUID[];
  v_third       UUID;
  v_fourth      UUID;
  v_name        TEXT;
  v_gross       INT := 0;
  v_prizes_paid INT := 0;
  v_platform    INT := 0;
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

  -- Semifinal losers take 3rd/4th on the arena tiebreaks.
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

-- Gross pool from the ledger: entry fees are negative amounts, refunds positive...
  SELECT COALESCE(-SUM(amount), 0) INTO v_gross
  FROM public.wallet_transactions
  WHERE reference_id = p_tournament_id::text
    AND type IN ('tournament_entry', 'tournament_refund');
  v_gross := GREATEST(0, v_gross);

  -- Paid tournament with no prize configuration → 40/25/15 of gross.
  IF v_gross > 0
     AND (COALESCE(v_t.prize_1st, 0) + COALESCE(v_t.prize_2nd, 0)
          + COALESCE(v_t.prize_3rd, 0) + COALESCE(v_t.prize_4th, 0)) = 0 THEN
    v_t.prize_1st := floor(v_gross * 0.40)::INT;
    v_t.prize_2nd := floor(v_gross * 0.25)::INT;
    v_t.prize_3rd := floor(v_gross * 0.15)::INT;
    UPDATE public.tournaments SET
      prize_1st = v_t.prize_1st,
      prize_2nd = v_t.prize_2nd,
      prize_3rd = v_t.prize_3rd
    WHERE id = p_tournament_id;
  END IF;

  PERFORM public._tournament_award_prize(v_t, v_champion, v_t.prize_1st, '1st');
  PERFORM public._tournament_award_prize(v_t, v_runner,   v_t.prize_2nd, '2nd');
  PERFORM public._tournament_award_prize(v_t, v_third,    v_t.prize_3rd, '3rd');
  PERFORM public._tournament_award_prize(v_t, v_fourth,   v_t.prize_4th, '4th');

-- Book the platform's cut once
  IF v_gross > 0 THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_prizes_paid
    FROM public.wallet_transactions
    WHERE reference_id = p_tournament_id::text AND type = 'tournament_prize';
    v_platform := GREATEST(0, v_gross - v_prizes_paid);

    INSERT INTO public.tournament_platform_revenue
      (tournament_id, gross_pool, prizes_paid, amount)
    VALUES (p_tournament_id, v_gross, v_prizes_paid, v_platform)
    ON CONFLICT (tournament_id) DO NOTHING;

    IF FOUND THEN
      PERFORM public._tournament_log(
        p_tournament_id, 'platform_fee',
        'Platform fee collected: ' || v_platform || ' coins ('
          || CASE WHEN v_gross > 0 THEN round(v_platform * 100.0 / v_gross)::INT ELSE 0 END
          || '% of ' || v_gross || ')',
        NULL,
        jsonb_build_object('gross', v_gross, 'prizes', v_prizes_paid, 'platform', v_platform));
    END IF;
  END IF;

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

-- 76.4 tournament_clock_sweep v2 — fast no-show settlement
-- The TS move handler now gives White's first move for free, so White's clock n...
CREATE OR REPLACE FUNCTION public.tournament_clock_sweep()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_g      RECORD;
  v_winner UUID;
  v_result public.game_result;
  v_reason TEXT;
BEGIN
  FOR v_g IN
    SELECT g.*
    FROM public.games g
    JOIN public.tournament_matches tm ON tm.game_id = g.id AND tm.status = 'active'
    WHERE g.status = 'active'
      AND (
        (g.moves_count = 0 AND g.created_at + interval '2 minutes' < now())
        OR (
          g.moves_count > 0
          AND g.last_move_at IS NOT NULL
          AND (
            (g.turn = 'w' AND g.last_move_at + make_interval(secs => g.white_time_ms / 1000.0) < now()) OR
            (g.turn = 'b' AND g.last_move_at + make_interval(secs => g.black_time_ms / 1000.0) < now())
          )
        )
      )
    FOR UPDATE OF g SKIP LOCKED
  LOOP
    IF v_g.moves_count = 0 THEN
      -- White never opened the board: Black advances.
      v_result := 'black'; v_winner := v_g.black_id; v_reason := 'no_show';
    ELSIF v_g.turn = 'w' THEN
      v_result := 'black'; v_winner := v_g.black_id; v_reason := 'timeout';
    ELSE
      v_result := 'white'; v_winner := v_g.white_id; v_reason := 'timeout';
    END IF;

    UPDATE public.games SET
      status        = 'finished',
      result        = v_result,
      winner_id     = v_winner,
      end_reason    = v_reason,
      ended_at      = now(),
      white_time_ms = CASE WHEN v_result = 'black' THEN 0 ELSE white_time_ms END,
      black_time_ms = CASE WHEN v_result = 'white' THEN 0 ELSE black_time_ms END
    WHERE id = v_g.id AND status = 'active';

    -- Rating only when an actual game happened (0-move no-shows stay unrated).
    IF v_g.is_rated AND v_g.moves_count > 0 THEN
      PERFORM public.apply_elo_change(v_g.id);
    END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.tournament_clock_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_clock_sweep() TO service_role, authenticated;

-- 76.5 admin_tr_overview v2 — platform revenue column
-- Identical to SECTION 75's version plus platform_revenue joined from the SECTI...
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
      COALESCE(pr.amount, 0)           AS platform_revenue,
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
    LEFT JOIN public.tournament_platform_revenue pr ON pr.tournament_id = t.id
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

-- 76.6 Round-by-round progression: the 10-second intermission
-- The next round must NOT start the instant the last board finishes
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS next_round_at TIMESTAMPTZ;

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
  v_next_at     TIMESTAMPTZ;
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









-- Section 76: KNOCKOUT V3 — RANDOM RE-PAIRING, PLATFORM REVENUE,
--             FIRST-MOVE CLOCK RULE (2026-07-19)
-- Pure-knockout upgrades layered on SECTIONS 74/75

-- 76.1 _tournament_start_round v3 — pure random pairing every round
-- Same contract and locking as v1 (74.4): caller holds the tournament row lock;...
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

-- 76.2 Platform revenue ledger
-- One row per completed paid tournament
CREATE TABLE IF NOT EXISTS public.tournament_platform_revenue (
  id            BIGSERIAL PRIMARY KEY,
  tournament_id UUID NOT NULL UNIQUE REFERENCES public.tournaments(id) ON DELETE CASCADE,
  gross_pool    INT NOT NULL,
  prizes_paid   INT NOT NULL,
  amount        INT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tournament_platform_revenue TO authenticated;
GRANT ALL ON public.tournament_platform_revenue TO service_role;
ALTER TABLE public.tournament_platform_revenue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Platform revenue admin read" ON public.tournament_platform_revenue;
CREATE POLICY "Platform revenue admin read"
  ON public.tournament_platform_revenue FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
-- No INSERT/UPDATE policies on purpose: only the SECURITY DEFINER completion pa...

-- 76.3 _tournament_complete v3 — prizes + platform revenue booking
-- SECTION 75's arena-tiebreak version plus: • gross pool measured from the wall...
CREATE OR REPLACE FUNCTION public._tournament_complete(p_tournament_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t           public.tournaments%ROWTYPE;
  v_final       public.tournament_matches%ROWTYPE;
  v_champion    UUID;
  v_runner      UUID;
  v_semis       UUID[];
  v_third       UUID;
  v_fourth      UUID;
  v_name        TEXT;
  v_gross       INT := 0;
  v_prizes_paid INT := 0;
  v_platform    INT := 0;
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

  -- Semifinal losers take 3rd/4th on the arena tiebreaks.
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

-- Gross pool from the ledger: entry fees are negative amounts, refunds positive...
  SELECT COALESCE(-SUM(amount), 0) INTO v_gross
  FROM public.wallet_transactions
  WHERE reference_id = p_tournament_id::text
    AND type IN ('tournament_entry', 'tournament_refund');
  v_gross := GREATEST(0, v_gross);

  -- Paid tournament with no prize configuration → 40/25/15 of gross.
  IF v_gross > 0
     AND (COALESCE(v_t.prize_1st, 0) + COALESCE(v_t.prize_2nd, 0)
          + COALESCE(v_t.prize_3rd, 0) + COALESCE(v_t.prize_4th, 0)) = 0 THEN
    v_t.prize_1st := floor(v_gross * 0.40)::INT;
    v_t.prize_2nd := floor(v_gross * 0.25)::INT;
    v_t.prize_3rd := floor(v_gross * 0.15)::INT;
    UPDATE public.tournaments SET
      prize_1st = v_t.prize_1st,
      prize_2nd = v_t.prize_2nd,
      prize_3rd = v_t.prize_3rd
    WHERE id = p_tournament_id;
  END IF;

  PERFORM public._tournament_award_prize(v_t, v_champion, v_t.prize_1st, '1st');
  PERFORM public._tournament_award_prize(v_t, v_runner,   v_t.prize_2nd, '2nd');
  PERFORM public._tournament_award_prize(v_t, v_third,    v_t.prize_3rd, '3rd');
  PERFORM public._tournament_award_prize(v_t, v_fourth,   v_t.prize_4th, '4th');

-- Book the platform's cut once
  IF v_gross > 0 THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_prizes_paid
    FROM public.wallet_transactions
    WHERE reference_id = p_tournament_id::text AND type = 'tournament_prize';
    v_platform := GREATEST(0, v_gross - v_prizes_paid);

    INSERT INTO public.tournament_platform_revenue
      (tournament_id, gross_pool, prizes_paid, amount)
    VALUES (p_tournament_id, v_gross, v_prizes_paid, v_platform)
    ON CONFLICT (tournament_id) DO NOTHING;

    IF FOUND THEN
      PERFORM public._tournament_log(
        p_tournament_id, 'platform_fee',
        'Platform fee collected: ' || v_platform || ' coins ('
          || CASE WHEN v_gross > 0 THEN round(v_platform * 100.0 / v_gross)::INT ELSE 0 END
          || '% of ' || v_gross || ')',
        NULL,
        jsonb_build_object('gross', v_gross, 'prizes', v_prizes_paid, 'platform', v_platform));
    END IF;
  END IF;

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

-- 76.4 tournament_clock_sweep v2 — fast no-show settlement
-- The TS move handler now gives White's first move for free, so White's clock n...
CREATE OR REPLACE FUNCTION public.tournament_clock_sweep()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_g      RECORD;
  v_winner UUID;
  v_result public.game_result;
  v_reason TEXT;
BEGIN
  FOR v_g IN
    SELECT g.*
    FROM public.games g
    JOIN public.tournament_matches tm ON tm.game_id = g.id AND tm.status = 'active'
    WHERE g.status = 'active'
      AND (
        (g.moves_count = 0 AND g.created_at + interval '2 minutes' < now())
        OR (
          g.moves_count > 0
          AND g.last_move_at IS NOT NULL
          AND (
            (g.turn = 'w' AND g.last_move_at + make_interval(secs => g.white_time_ms / 1000.0) < now()) OR
            (g.turn = 'b' AND g.last_move_at + make_interval(secs => g.black_time_ms / 1000.0) < now())
          )
        )
      )
    FOR UPDATE OF g SKIP LOCKED
  LOOP
    IF v_g.moves_count = 0 THEN
      -- White never opened the board: Black advances.
      v_result := 'black'; v_winner := v_g.black_id; v_reason := 'no_show';
    ELSIF v_g.turn = 'w' THEN
      v_result := 'black'; v_winner := v_g.black_id; v_reason := 'timeout';
    ELSE
      v_result := 'white'; v_winner := v_g.white_id; v_reason := 'timeout';
    END IF;

    UPDATE public.games SET
      status        = 'finished',
      result        = v_result,
      winner_id     = v_winner,
      end_reason    = v_reason,
      ended_at      = now(),
      white_time_ms = CASE WHEN v_result = 'black' THEN 0 ELSE white_time_ms END,
      black_time_ms = CASE WHEN v_result = 'white' THEN 0 ELSE black_time_ms END
    WHERE id = v_g.id AND status = 'active';

    -- Rating only when an actual game happened (0-move no-shows stay unrated).
    IF v_g.is_rated AND v_g.moves_count > 0 THEN
      PERFORM public.apply_elo_change(v_g.id);
    END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.tournament_clock_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_clock_sweep() TO service_role, authenticated;

-- 76.5 admin_tr_overview v2 — platform revenue column
-- Identical to SECTION 75's version plus platform_revenue joined from the SECTI...
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
      COALESCE(pr.amount, 0)           AS platform_revenue,
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
    LEFT JOIN public.tournament_platform_revenue pr ON pr.tournament_id = t.id
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

-- 76.6 Round-by-round progression: the 10-second intermission
-- The next round must NOT start the instant the last board finishes
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS next_round_at TIMESTAMPTZ;

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
  v_next_at     TIMESTAMPTZ;
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






-- 76.6 Round-by-round progression: the 10-second intermission
-- The next round must NOT start the instant the last board finishes
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS next_round_at TIMESTAMPTZ;

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
  v_next_at     TIMESTAMPTZ;
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