-- Shared-post inbox and push preview wording.
--
-- Replaces the body of the deployed five-argument send_shared_post_message.
-- Does not drop the function, so existing grants stay in place and are
-- restated below. Four named arguments still omit p_duo_comment.
-- Does not rewrite existing messages or outbox rows.
--
-- Inbox and push previews are separate. Duo push text never includes the note.
-- The note remains messages.body. Snapshot and reference_id are unchanged.

CREATE OR REPLACE FUNCTION public.send_shared_post_message(
  p_conversation_id uuid,
  p_post_id uuid,
  p_note text,
  p_client_message_id uuid,
  p_duo_comment boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_note text;
  v_inbox_preview text;
  v_push_preview text;
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
  v_constraint text;
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

  -- Idempotent retry: same client id returns the stored row before gates.
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

  IF COALESCE(p_duo_comment, false) THEN
    IF v_kind IS DISTINCT FROM 'direct' OR v_other IS NULL THEN
      RAISE EXCEPTION 'DUO_COMMENT_NOT_AVAILABLE';
    END IF;

    -- Any historical pair_up row counts. Leave/rejoin does not reset the rule.
    -- No status or discoverable_until filter. Does not write interest.
    IF NOT EXISTS (
      SELECT 1
      FROM public.social_opportunities o
      WHERE o.kind = 'pair_up'
        AND o.creator_id = v_other
        AND o.source_post_id = p_post_id
    ) THEN
      RAISE EXCEPTION 'DUO_COMMENT_NOT_AVAILABLE';
    END IF;

    v_snapshot := jsonb_build_object(
      'v', 1,
      'post_type', v_post_type,
      'origin', 'duo'
    );
  ELSE
    v_snapshot := jsonb_build_object(
      'v', 1,
      'post_type', v_post_type
    );
  END IF;

  BEGIN
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
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'messages_duo_comment_per_post_uniq' THEN
        RAISE EXCEPTION 'DUO_COMMENT_ALREADY_SENT';
      END IF;
      RAISE;
  END;

  IF NOT v_inserted THEN
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
    IF COALESCE(p_duo_comment, false) THEN
      v_push_preview := 'Sent you a Duo comment';
      IF length(v_note) > 0 THEN
        v_inbox_preview := left('Duo comment · ' || v_note, 200);
      ELSE
        v_inbox_preview := 'Duo comment';
      END IF;
    ELSIF v_post_type = 'hangout' THEN
      IF length(v_note) > 0 THEN
        v_inbox_preview := left('Shared an event · ' || v_note, 200);
      ELSE
        v_inbox_preview := 'Shared an event';
      END IF;
      v_push_preview := v_inbox_preview;
    ELSE
      IF length(v_note) > 0 THEN
        v_inbox_preview := left('Shared a post · ' || v_note, 200);
      ELSE
        v_inbox_preview := 'Shared a post';
      END IF;
      v_push_preview := v_inbox_preview;
    END IF;

    UPDATE public.conversations c
    SET
      last_message_at = v_msg.created_at,
      last_message_preview = v_inbox_preview,
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
        v_push_preview,
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

REVOKE ALL ON FUNCTION public.send_shared_post_message(uuid, uuid, text, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_shared_post_message(uuid, uuid, text, uuid, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.send_shared_post_message(uuid, uuid, text, uuid, boolean) IS
  'Shared_post send. p_duo_comment defaults false. Duo inbox preview may include the note; Duo push is Sent you a Duo comment without the note. Ordinary inbox and push use Shared an event or Shared a post. Does not join or express Pair Up interest.';
