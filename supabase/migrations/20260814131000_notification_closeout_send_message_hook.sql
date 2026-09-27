-- Notification closeout (stage B): send_message outbox enqueue after tables exist.
-- Outbox failures must NOT roll back message send — wrapped in exception handler.
-- Apply only after 20260814130000 and Edge drain smoke test.

CREATE OR REPLACE FUNCTION public.enqueue_dm_push_outbox_for_message(
  p_conversation_id uuid,
  p_sender_user_id uuid,
  p_preview text,
  p_conversation_kind text,
  p_group_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_recipient uuid;
  v_sender_name text;
BEGIN
  SELECT coalesce(p.display_name, p.username, 'Someone')
  INTO v_sender_name
  FROM public.profiles p
  WHERE p.user_id = p_sender_user_id
  LIMIT 1;

  FOR v_recipient IN
    SELECT m.user_id
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id <> p_sender_user_id
      AND m.left_at IS NULL
  LOOP
    INSERT INTO public.dm_push_outbox (
      recipient_user_id,
      conversation_id,
      sender_user_id,
      body,
      sender_name,
      conversation_kind,
      group_name
    )
    VALUES (
      v_recipient,
      p_conversation_id,
      p_sender_user_id,
      p_preview,
      v_sender_name,
      p_conversation_kind,
      CASE WHEN p_conversation_kind = 'group' THEN p_group_name ELSE NULL END
    );
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_dm_push_outbox_for_message(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;

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
  v_group_name text;
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

  SELECT c.kind, c.direct_user_low, c.direct_user_high, c.title
  INTO v_kind, v_low, v_high, v_group_name
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

    BEGIN
      PERFORM public.enqueue_dm_push_outbox_for_message(
        p_conversation_id,
        v_me,
        v_preview,
        v_kind,
        v_group_name
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING
          'dm_push_outbox enqueue failed for conversation %: %',
          p_conversation_id,
          SQLERRM;
    END;
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

COMMENT ON FUNCTION public.send_message(uuid, text, uuid) IS
  'Send DM/group message; bumps unread + best-effort dm_push_outbox enqueue (failures do not roll back send).';
