-- Phase 1A: persistent 1:1 DM backend RPCs (additive).
-- Requires Phase 0 tables: conversations, conversation_members, messages.
-- No table DDL changes, no Realtime, no notifications/push, no groups UI.

-- ---------------------------------------------------------------------------
-- get_or_create_direct_conversation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(
  p_other_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_conv_id uuid;
  v_created boolean := false;
  v_row public.conversations%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_other_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing other user';
  END IF;

  IF p_other_user_id = v_me THEN
    RAISE EXCEPTION 'Cannot create a direct conversation with yourself';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = p_other_user_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF public.users_are_blocked_pair(v_me, p_other_user_id) THEN
    RAISE EXCEPTION 'Cannot message this user';
  END IF;

  IF v_me < p_other_user_id THEN
    v_low := v_me;
    v_high := p_other_user_id;
  ELSE
    v_low := p_other_user_id;
    v_high := v_me;
  END IF;

  INSERT INTO public.conversations (
    kind,
    created_by,
    direct_user_low,
    direct_user_high
  )
  VALUES (
    'direct',
    v_me,
    v_low,
    v_high
  )
  ON CONFLICT (direct_user_low, direct_user_high) DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NOT NULL THEN
    v_created := true;

    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES
      (v_conv_id, v_me),
      (v_conv_id, p_other_user_id);
  ELSE
    SELECT c.id
    INTO v_conv_id
    FROM public.conversations c
    WHERE c.kind = 'direct'
      AND c.direct_user_low = v_low
      AND c.direct_user_high = v_high;

    IF v_conv_id IS NULL THEN
      RAISE EXCEPTION 'Failed to resolve direct conversation';
    END IF;

    -- Caller rejoining: clear their left_at. Do not force-reactivate the other party.
    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (v_conv_id, v_me)
    ON CONFLICT (conversation_id, user_id) DO UPDATE
    SET left_at = NULL;

    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (v_conv_id, p_other_user_id)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  SELECT c.*
  INTO v_row
  FROM public.conversations c
  WHERE c.id = v_conv_id;

  RETURN jsonb_build_object(
    'conversation_id', v_row.id,
    'kind', v_row.kind,
    'other_user_id', p_other_user_id,
    'created', v_created,
    'created_at', v_row.created_at,
    'last_message_at', v_row.last_message_at,
    'last_message_preview', v_row.last_message_preview,
    'last_message_sender_id', v_row.last_message_sender_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_or_create_direct_conversation(uuid) IS
  'Phase 1A: get or create the unique direct conversation for auth.uid() and p_other_user_id.';

-- ---------------------------------------------------------------------------
-- send_message (text only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_body text;
  v_preview text;
  v_kind text;
  v_low uuid;
  v_high uuid;
  v_other uuid;
  v_msg public.messages%ROWTYPE;
  v_inserted boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL OR p_client_message_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation or client_message_id';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN
    RAISE EXCEPTION 'Message body is empty';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = v_me
      AND m.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  SELECT c.kind, c.direct_user_low, c.direct_user_high
  INTO v_kind, v_low, v_high
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_kind = 'direct' THEN
    IF v_low IS NULL OR v_high IS NULL THEN
      RAISE EXCEPTION 'Invalid direct conversation';
    END IF;

    IF v_me = v_low THEN
      v_other := v_high;
    ELSIF v_me = v_high THEN
      v_other := v_low;
    ELSE
      RAISE EXCEPTION 'Not a participant of this direct conversation';
    END IF;

    IF public.users_are_blocked_pair(v_me, v_other) THEN
      RAISE EXCEPTION 'Cannot message this user';
    END IF;
  END IF;

  INSERT INTO public.messages (
    conversation_id,
    sender_user_id,
    body,
    client_message_id
  )
  VALUES (
    p_conversation_id,
    v_me,
    v_body,
    p_client_message_id
  )
  ON CONFLICT (conversation_id, sender_user_id, client_message_id) DO NOTHING
  RETURNING * INTO v_msg;

  IF FOUND THEN
    v_inserted := true;
  ELSE
    SELECT m.*
    INTO v_msg
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_user_id = v_me
      AND m.client_message_id = p_client_message_id;

    IF v_msg.id IS NULL THEN
      RAISE EXCEPTION 'Failed to resolve message after conflict';
    END IF;
  END IF;

  -- Only bump summary/unread on a newly inserted message (idempotent retries safe).
  IF v_inserted THEN
    v_preview := left(v_body, 200);

    UPDATE public.conversations c
    SET
      last_message_at = v_msg.created_at,
      last_message_preview = v_preview,
      last_message_sender_id = v_me,
      updated_at = now()
    WHERE c.id = p_conversation_id
      AND (
        c.last_message_at IS NULL
        OR c.last_message_at <= v_msg.created_at
      );

    UPDATE public.conversation_members m
    SET unread_count = m.unread_count + 1
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id <> v_me
      AND m.left_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'message', jsonb_build_object(
      'id', v_msg.id,
      'conversation_id', v_msg.conversation_id,
      'sender_user_id', v_msg.sender_user_id,
      'body', v_msg.body,
      'client_message_id', v_msg.client_message_id,
      'created_at', v_msg.created_at
    ),
    'created', v_inserted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.send_message(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.send_message(uuid, text, uuid) IS
  'Phase 1A: send a text message with client_message_id idempotency; updates last-message + recipient unread.';

-- ---------------------------------------------------------------------------
-- list_messages (newest page only; no cursor yet)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_messages(
  p_conversation_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_limit integer;
  v_messages jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = v_me
      AND m.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC, t.id DESC),
    '[]'::jsonb
  )
  INTO v_messages
  FROM (
    SELECT
      m.id,
      m.conversation_id,
      m.sender_user_id,
      m.body,
      m.client_message_id,
      m.created_at
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'messages', v_messages
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_messages(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_messages(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.list_messages(uuid, integer) IS
  'Phase 1A: newest messages for a conversation (default 20, max 50). Cursor pagination comes in Phase 2.';
