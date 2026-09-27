-- Viewer-local Group "Delete chat" (hide + history cutoff).
-- LOCAL ONLY until explicitly applied. Do not auto-apply / deploy.
--
-- Does NOT modify the already-applied DM hide migration.
-- Reuses conversation_members.inbox_hidden_at / history_visible_after.
-- Does NOT leave membership, dissolve groups, or change Group Up.
--
-- Intentional deltas vs live send_* bodies (from hide_direct migration):
-- - unhide inbox_hidden_at on NEW insert for kind IN ('direct', 'group')
-- - keep history_visible_after unchanged on unhide

-- ---------------------------------------------------------------------------
-- 1) Column comments (shared viewer-local Delete chat)
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.conversation_members.inbox_hidden_at IS
  'Viewer-local inbox hide (Delete chat for direct or group). NULL = visible in list_my_conversations. Cleared on new text/shared_post activity; does not set left_at.';

COMMENT ON COLUMN public.conversation_members.history_visible_after IS
  'Viewer-local message cutoff. list_messages returns only rows with created_at >= this. Preserved when inbox_hidden_at is cleared on new activity.';

-- ---------------------------------------------------------------------------
-- 2) hide_group_conversation_for_me
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hide_group_conversation_for_me(
  p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_kind text;
  v_hidden_at timestamptz;
  v_now timestamptz := now();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
  END IF;

  SELECT c.kind
  INTO v_kind
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_kind <> 'group' THEN
    RAISE EXCEPTION 'Not a group conversation';
  END IF;

  SELECT m.inbox_hidden_at
  INTO v_hidden_at
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_me
    AND m.left_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  -- Idempotent while still hidden: do not advance history cutoff.
  IF v_hidden_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'conversation_id', p_conversation_id,
      'hidden', true
    );
  END IF;

  UPDATE public.conversation_members m
  SET
    inbox_hidden_at = v_now,
    history_visible_after = v_now,
    unread_count = 0
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_me
    AND m.left_at IS NULL;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'hidden', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.hide_group_conversation_for_me(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hide_group_conversation_for_me(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.hide_group_conversation_for_me(uuid) IS
  'Group Delete chat: viewer-local inbox hide + history cutoff; does not leave, dissolve, or delete messages.';

-- ---------------------------------------------------------------------------
-- 3) send_message — unhide for direct + group (keep history cutoff)
--     Body matches live hide_direct migration except unhide kind guard.
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
  v_group_name text;
  v_msg public.messages%ROWTYPE;
  v_inserted boolean := false;
  v_mode text;
  v_push_secret text;
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
  END IF;

  -- Idempotent short-circuit before mutable gates.
  SELECT m.*
  INTO v_msg
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_user_id = v_me
    AND m.client_message_id = p_client_message_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'message', jsonb_build_object(
        'id', v_msg.id,
        'conversation_id', v_msg.conversation_id,
        'sender_user_id', v_msg.sender_user_id,
        'body', v_msg.body,
        'client_message_id', v_msg.client_message_id,
        'created_at', v_msg.created_at
      ),
      'created', false
    );
  END IF;

  IF v_kind = 'direct' THEN
    IF public.users_are_blocked_pair(v_me, v_other) THEN
      RAISE EXCEPTION 'Cannot message this user';
    END IF;

    v_mode := public.dm_direct_access_mode(v_me, v_other, p_conversation_id);

    IF v_mode = 'denied' THEN
      RAISE EXCEPTION 'DM_DIRECT_ACCESS_DENIED';
    ELSIF v_mode = 'request' THEN
      PERFORM public.dm_direct_assert_can_send_new(
        p_conversation_id,
        v_me,
        v_other
      );
    END IF;
    -- full: unrestricted
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

    -- Reappear deleted chats for active members; keep history_visible_after.
    IF v_kind IN ('direct', 'group') THEN
      UPDATE public.conversation_members m
      SET inbox_hidden_at = NULL
      WHERE m.conversation_id = p_conversation_id
        AND m.left_at IS NULL
        AND m.inbox_hidden_at IS NOT NULL;
    END IF;

    UPDATE public.conversation_members m
    SET unread_count = m.unread_count + 1
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id <> v_me
      AND m.left_at IS NULL;

    BEGIN
      PERFORM public.enqueue_dm_push_outbox_for_message(
        v_msg.id,
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

    -- Fire-and-forget drain. Cron remains fallback if this no-ops or fails.
    BEGIN
      SELECT ds.decrypted_secret
      INTO v_push_secret
      FROM vault.decrypted_secrets ds
      WHERE ds.name = 'internal_push_secret'
      LIMIT 1;

      IF v_push_secret IS NOT NULL AND btrim(v_push_secret) <> '' THEN
        PERFORM net.http_post(
          url := 'https://otfbgcvxevwtybfltvuf.supabase.co/functions/v1/send-dm-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-internal-push-secret', btrim(v_push_secret)
          ),
          body := '{"drain_outbox":true,"limit":25}'::jsonb
        );
      ELSE
        RAISE WARNING
          'dm_push drain kick skipped for conversation %: internal_push_secret missing',
          p_conversation_id;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING
          'dm_push drain kick failed for conversation %: %',
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
  'Send text; clears inbox_hidden_at on insert for direct+group (keeps history_visible_after); push drain.';

-- ---------------------------------------------------------------------------
-- 4) send_shared_post_message — same group unhide
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_shared_post_message(
  p_conversation_id uuid,
  p_post_id uuid,
  p_note text,
  p_client_message_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_note text;
  v_preview text;
  v_kind text;
  v_low uuid;
  v_high uuid;
  v_other uuid;
  v_group_name text;
  v_post_type text;
  v_snapshot jsonb;
  v_msg public.messages%ROWTYPE;
  v_inserted boolean := false;
  v_mode text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL
     OR p_post_id IS NULL
     OR p_client_message_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation, post, or client_message_id';
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
  END IF;

  SELECT m.*
  INTO v_msg
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_user_id = v_me
    AND m.client_message_id = p_client_message_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'message', jsonb_build_object(
        'id', v_msg.id,
        'conversation_id', v_msg.conversation_id,
        'sender_user_id', v_msg.sender_user_id,
        'body', v_msg.body,
        'client_message_id', v_msg.client_message_id,
        'created_at', v_msg.created_at,
        'message_kind', v_msg.message_kind,
        'reference_type', v_msg.reference_type,
        'reference_id', v_msg.reference_id,
        'reference_snapshot', v_msg.reference_snapshot
      ),
      'created', false
    );
  END IF;

  IF v_kind = 'direct' THEN
    IF public.users_are_blocked_pair(v_me, v_other) THEN
      RAISE EXCEPTION 'Cannot message this user';
    END IF;

    v_mode := public.dm_direct_access_mode(v_me, v_other, p_conversation_id);

    IF v_mode = 'denied' THEN
      RAISE EXCEPTION 'DM_DIRECT_ACCESS_DENIED';
    ELSIF v_mode = 'request' THEN
      PERFORM public.dm_direct_assert_can_send_new(
        p_conversation_id,
        v_me,
        v_other
      );
    END IF;
  END IF;

  v_note := btrim(COALESCE(p_note, ''));
  IF char_length(v_note) > 200 THEN
    RAISE EXCEPTION 'Note is too long';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.left_at IS NULL
      AND NOT public.can_view_post_as(m.user_id, p_post_id)
  ) THEN
    RAISE EXCEPTION 'This post can''t be shared with everyone in this conversation';
  END IF;

  SELECT p.type::text
  INTO v_post_type
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF v_post_type IS NULL THEN
    RAISE EXCEPTION 'This post can''t be shared with everyone in this conversation';
  END IF;

  IF v_post_type NOT IN ('hangout', 'experience') THEN
    RAISE EXCEPTION 'This post can''t be shared with everyone in this conversation';
  END IF;

  v_snapshot := jsonb_build_object(
    'v', 1,
    'post_type', v_post_type
  );

  INSERT INTO public.messages (
    conversation_id,
    sender_user_id,
    body,
    client_message_id,
    message_kind,
    reference_type,
    reference_id,
    reference_snapshot
  )
  VALUES (
    p_conversation_id,
    v_me,
    v_note,
    p_client_message_id,
    'shared_post',
    'post',
    p_post_id,
    v_snapshot
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
    IF length(v_note) > 0 THEN
      IF v_post_type = 'hangout' THEN
        v_preview := left('Shared a hangout · ' || v_note, 200);
      ELSE
        v_preview := left('Shared an experience · ' || v_note, 200);
      END IF;
    ELSE
      IF v_post_type = 'hangout' THEN
        v_preview := 'Shared a hangout';
      ELSE
        v_preview := 'Shared an experience';
      END IF;
    END IF;

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

    IF v_kind IN ('direct', 'group') THEN
      UPDATE public.conversation_members m
      SET inbox_hidden_at = NULL
      WHERE m.conversation_id = p_conversation_id
        AND m.left_at IS NULL
        AND m.inbox_hidden_at IS NOT NULL;
    END IF;

    UPDATE public.conversation_members m
    SET unread_count = m.unread_count + 1
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id <> v_me
      AND m.left_at IS NULL;

    BEGIN
      PERFORM public.enqueue_dm_push_outbox_for_message(
        v_msg.id,
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
      'created_at', v_msg.created_at,
      'message_kind', v_msg.message_kind,
      'reference_type', v_msg.reference_type,
      'reference_id', v_msg.reference_id,
      'reference_snapshot', v_msg.reference_snapshot
    ),
    'created', v_inserted
  );
END;
$function$;

COMMENT ON FUNCTION public.send_shared_post_message(uuid, uuid, text, uuid) IS
  'Shared_post send; clears inbox_hidden_at on insert for direct+group (keeps history_visible_after).';
