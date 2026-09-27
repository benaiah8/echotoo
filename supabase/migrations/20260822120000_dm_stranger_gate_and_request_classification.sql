-- R1A: DM stranger two-message gate + list is_request classification.
-- LOCAL only until explicitly applied. Does not modify push Edge, Pair Up match,
-- Invite, or group stranger semantics.
--
-- Depends on: messaging foundation, message_kind, send_message outbox,
-- send_shared_post_message, list_my_conversations (member_count).

-- ---------------------------------------------------------------------------
-- 1) Index for qualifying sender EXISTS / COUNT
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS messages_conversation_sender_qualifying_idx
  ON public.messages (conversation_id, sender_user_id)
  WHERE message_kind IN ('text', 'shared_post');

-- ---------------------------------------------------------------------------
-- 2) dm_direct_is_unlocked — private helper (auth user ids)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dm_direct_is_unlocked(
  p_conversation_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_pa uuid;
  v_pb uuid;
BEGIN
  IF p_conversation_id IS NULL
     OR p_user_a IS NULL
     OR p_user_b IS NULL
     OR p_user_a = p_user_b THEN
    RETURN false;
  END IF;

  -- Mutual approved follows (profile ids).
  SELECT pr.id
  INTO v_pa
  FROM public.profiles pr
  WHERE pr.user_id = p_user_a
    AND pr.deleted_at IS NULL
  LIMIT 1;

  SELECT pr.id
  INTO v_pb
  FROM public.profiles pr
  WHERE pr.user_id = p_user_b
    AND pr.deleted_at IS NULL
  LIMIT 1;

  IF v_pa IS NOT NULL AND v_pb IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = v_pa
        AND f.following_id = v_pb
        AND f.status = 'approved'
    ) AND EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = v_pb
        AND f.following_id = v_pa
        AND f.status = 'approved'
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- Reply unlock: both participants authored >=1 qualifying message.
  IF EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_user_id = p_user_a
      AND m.message_kind IN ('text', 'shared_post')
  ) AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_user_id = p_user_b
      AND m.message_kind IN ('text', 'shared_post')
  ) THEN
    RETURN true;
  END IF;

  -- Future durable Pair Up unlock (do NOT derive from expiring interests):
  -- OR EXISTS (SELECT 1 FROM public.dm_direct_unlocks u
  --            WHERE u.user_low = least(p_user_a, p_user_b)
  --              AND u.user_high = greatest(p_user_a, p_user_b))
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.dm_direct_is_unlocked(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.dm_direct_is_unlocked(uuid, uuid, uuid) IS
  'R1A: direct DM unlocked via mutual approved follows, both-sides qualifying messages, or future Pair Up unlock. Auth user ids.';

-- ---------------------------------------------------------------------------
-- 3) dm_direct_assert_can_send_new — stranger cap (caller already checked block)
--    VOLATILE: locks sender membership row so concurrent text/shared_post sends
--    serialize per conversation+sender before rechecking unlock/count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dm_direct_assert_can_send_new(
  p_conversation_id uuid,
  p_sender uuid,
  p_other uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- Serialize concurrent restricted sends for this conversation+sender.
  PERFORM 1
  FROM public.conversation_members cm
  WHERE cm.conversation_id = p_conversation_id
    AND cm.user_id = p_sender
    AND cm.left_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  -- Post-lock unlock / count (sees commits that held the lock before us).
  IF public.dm_direct_is_unlocked(p_conversation_id, p_sender, p_other) THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_user_id = p_sender
    AND m.message_kind IN ('text', 'shared_post');

  IF COALESCE(v_count, 0) >= 2 THEN
    RAISE EXCEPTION 'DM_STRANGER_LIMIT_REACHED';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.dm_direct_assert_can_send_new(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.dm_direct_assert_can_send_new(uuid, uuid, uuid) IS
  'R1A: FOR UPDATE sender membership; raise DM_STRANGER_LIMIT_REACHED when restricted sender already has 2 qualifying messages.';

-- ---------------------------------------------------------------------------
-- 4) send_message — idempotent-first + direct block + stranger gate
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

    PERFORM public.dm_direct_assert_can_send_new(
      p_conversation_id,
      v_me,
      v_other
    );
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
      'created_at', v_msg.created_at
    ),
    'created', v_inserted
  );
END;
$function$;

COMMENT ON FUNCTION public.send_message(uuid, text, uuid) IS
  'R1A: send text; direct stranger 2-message gate; idempotent-first; unread + best-effort outbox.';

-- ---------------------------------------------------------------------------
-- 5) send_shared_post_message — same direct gate; shared_post counts as slot
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

    PERFORM public.dm_direct_assert_can_send_new(
      p_conversation_id,
      v_me,
      v_other
    );
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
  'R1A: shared_post send; direct stranger gate; idempotent-first; visibility + snapshot + outbox.';

-- ---------------------------------------------------------------------------
-- 6) list_my_conversations — is_request + exclude blocked directs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_conversations(
  p_limit integer DEFAULT 40
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
  v_rows jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 50);

  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_last_message_at DESC NULLS LAST, t.created_at DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      c.id AS conversation_id,
      c.kind,
      CASE
        WHEN c.kind = 'direct' AND c.direct_user_low = v_me THEN c.direct_user_high
        WHEN c.kind = 'direct' AND c.direct_user_high = v_me THEN c.direct_user_low
        ELSE NULL
      END AS other_user_id,
      pr.display_name,
      pr.username,
      pr.avatar_url,
      c.title,
      c.last_message_at,
      c.last_message_preview,
      c.last_message_sender_id,
      m.unread_count,
      (c.last_message_sender_id IS NOT NULL AND c.last_message_sender_id = v_me) AS is_last_from_me,
      c.created_at,
      c.last_message_at AS sort_last_message_at,
      CASE
        WHEN c.kind = 'group' THEN (
          SELECT COUNT(*)::integer
          FROM public.conversation_members cm
          WHERE cm.conversation_id = c.id
            AND cm.left_at IS NULL
        )
        ELSE NULL
      END AS member_count,
      CASE
        WHEN c.kind <> 'direct' THEN false
        WHEN c.last_message_at IS NULL THEN false
        WHEN CASE
          WHEN c.direct_user_low = v_me THEN c.direct_user_high
          WHEN c.direct_user_high = v_me THEN c.direct_user_low
          ELSE NULL
        END IS NULL THEN false
        WHEN public.dm_direct_is_unlocked(
          c.id,
          v_me,
          CASE
            WHEN c.direct_user_low = v_me THEN c.direct_user_high
            ELSE c.direct_user_low
          END
        ) THEN false
        WHEN NOT EXISTS (
          SELECT 1
          FROM public.messages msg
          WHERE msg.conversation_id = c.id
            AND msg.sender_user_id = CASE
              WHEN c.direct_user_low = v_me THEN c.direct_user_high
              ELSE c.direct_user_low
            END
            AND msg.message_kind IN ('text', 'shared_post')
        ) THEN false
        WHEN EXISTS (
          SELECT 1
          FROM public.messages msg
          WHERE msg.conversation_id = c.id
            AND msg.sender_user_id = v_me
            AND msg.message_kind IN ('text', 'shared_post')
        ) THEN false
        ELSE true
      END AS is_request
    FROM public.conversation_members m
    JOIN public.conversations c ON c.id = m.conversation_id
    LEFT JOIN public.profiles pr
      ON pr.user_id = CASE
        WHEN c.kind = 'direct' AND c.direct_user_low = v_me THEN c.direct_user_high
        WHEN c.kind = 'direct' AND c.direct_user_high = v_me THEN c.direct_user_low
        ELSE NULL
      END
      AND pr.deleted_at IS NULL
    WHERE m.user_id = v_me
      AND m.left_at IS NULL
      AND NOT (
        c.kind = 'direct'
        AND public.users_are_blocked_pair(
          v_me,
          CASE
            WHEN c.direct_user_low = v_me THEN c.direct_user_high
            WHEN c.direct_user_high = v_me THEN c.direct_user_low
            ELSE NULL
          END
        )
      )
    ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'conversations', v_rows
  );
END;
$function$;

COMMENT ON FUNCTION public.list_my_conversations(integer) IS
  'R1A: inbox rows + is_request; excludes blocked directs; group member_count.';
