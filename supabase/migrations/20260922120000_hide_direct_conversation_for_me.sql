-- Viewer-local DM "Delete chat" (hide + history cutoff).
-- LOCAL ONLY until explicitly applied. Do not auto-apply / deploy.
--
-- Semantics:
-- - Hides the conversation from the caller's inbox only
-- - Does not soft-leave or delete shared messages
-- - history_visible_after hides prior history for this viewer
-- - New message clears inbox_hidden_at (reappear) but keeps history_visible_after
-- - Does not implement Delete group / Group Up changes

-- ---------------------------------------------------------------------------
-- 1) Member-level fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS inbox_hidden_at timestamptz NULL;

ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS history_visible_after timestamptz NULL;

COMMENT ON COLUMN public.conversation_members.inbox_hidden_at IS
  'Viewer-local inbox hide (DM Delete chat). NULL = visible in list_my_conversations. Cleared on new message activity; does not set left_at.';

COMMENT ON COLUMN public.conversation_members.history_visible_after IS
  'Viewer-local message cutoff. list_messages returns only rows with created_at >= this. Preserved when inbox_hidden_at is cleared on new activity.';

-- ---------------------------------------------------------------------------
-- 2) hide_direct_conversation_for_me
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hide_direct_conversation_for_me(
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

  IF v_kind <> 'direct' THEN
    RAISE EXCEPTION 'Not a direct conversation';
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

REVOKE ALL ON FUNCTION public.hide_direct_conversation_for_me(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hide_direct_conversation_for_me(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.hide_direct_conversation_for_me(uuid) IS
  'DM Delete chat: viewer-local inbox hide + history cutoff; does not leave or delete messages.';

-- ---------------------------------------------------------------------------
-- 3) list_my_conversations — exclude inbox_hidden_at
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
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at DESC, t.created_at DESC),
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
      COALESCE(c.last_message_at, c.created_at) AS sort_at,
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
        WHEN c.kind = 'group' THEN (
          SELECT COALESCE(
            jsonb_agg(preview.row_json ORDER BY preview.ord),
            '[]'::jsonb
          )
          FROM (
            SELECT
              jsonb_build_object(
                'user_id', cm.user_id,
                'avatar_url', p.avatar_url,
                'display_name', p.display_name,
                'username', p.username,
                'joined_at', cm.joined_at
              ) AS row_json,
              ROW_NUMBER() OVER (
                ORDER BY cm.joined_at DESC NULLS LAST, cm.user_id ASC
              ) AS ord
            FROM public.conversation_members cm
            -- Live profiles only so deleted/missing users do not consume top-3 slots.
            INNER JOIN public.profiles p
              ON p.user_id = cm.user_id
              AND p.deleted_at IS NULL
            WHERE cm.conversation_id = c.id
              AND cm.left_at IS NULL
          ) preview
          WHERE preview.ord <= 3
        )
        ELSE NULL
      END AS member_preview,
      CASE
        WHEN c.kind <> 'direct' THEN false
        WHEN c.last_message_at IS NULL THEN false
        WHEN CASE
          WHEN c.direct_user_low = v_me THEN c.direct_user_high
          WHEN c.direct_user_high = v_me THEN c.direct_user_low
          ELSE NULL
        END IS NULL THEN false
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
        WHEN public.dm_direct_access_mode(
          CASE
            WHEN c.direct_user_low = v_me THEN c.direct_user_high
            ELSE c.direct_user_low
          END,
          v_me,
          c.id
        ) = 'request' THEN true
        ELSE false
      END AS is_request,
      m.notifications_muted
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
      AND m.inbox_hidden_at IS NULL
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
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'conversations', v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_conversations(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_conversations(integer) TO authenticated;

COMMENT ON FUNCTION public.list_my_conversations(integer) IS
  'Inbox rows; excludes viewer inbox_hidden_at; group member_preview = latest 3 joined (active).';

-- ---------------------------------------------------------------------------
-- 4) list_messages — honor history_visible_after
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_messages(
  p_conversation_id uuid,
  p_limit integer DEFAULT 20,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
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
  v_fetch integer;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor jsonb := NULL;
  v_oldest jsonb;
  v_history_visible_after timestamptz;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
  END IF;

  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid cursor: created_at and id are both required';
  END IF;

  SELECT m.history_visible_after
  INTO v_history_visible_after
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_me
    AND m.left_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_fetch := v_limit + 1;

  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC, t.id DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      m.id,
      m.conversation_id,
      m.sender_user_id,
      m.body,
      m.client_message_id,
      m.created_at,
      m.message_kind,
      m.reference_type,
      m.reference_id,
      m.reference_snapshot
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND (
        v_history_visible_after IS NULL
        OR m.created_at >= v_history_visible_after
      )
      AND (
        p_before_created_at IS NULL
        OR m.created_at < p_before_created_at
        OR (
          m.created_at = p_before_created_at
          AND m.id < p_before_id
        )
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_fetch
  ) t;

  IF jsonb_array_length(v_rows) > v_limit THEN
    v_has_more := true;
    v_rows := (
      SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(elem, ord)
      WHERE ord <= v_limit
    );
  END IF;

  IF jsonb_array_length(v_rows) > 0 THEN
    v_oldest := v_rows -> (jsonb_array_length(v_rows) - 1);
    v_next_cursor := jsonb_build_object(
      'created_at', v_oldest ->> 'created_at',
      'id', v_oldest ->> 'id'
    );
  END IF;

  IF NOT v_has_more THEN
    v_next_cursor := NULL;
  END IF;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'messages', v_rows,
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_messages(uuid, integer, timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_messages(uuid, integer, timestamptz, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.list_messages(uuid, integer, timestamptz, uuid) IS
  'Newest-first keyset page; respects viewer history_visible_after cutoff when set.';

-- ---------------------------------------------------------------------------
-- 5) send_message — clear inbox_hidden_at on new insert (keep history cutoff)
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

    -- Reappear deleted DMs for active members; keep history_visible_after.
    IF v_kind = 'direct' THEN
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
  'Send text; clears inbox_hidden_at on insert (keeps history_visible_after); direct access_mode + push drain.';

-- ---------------------------------------------------------------------------
-- 6) send_shared_post_message — same unhide on insert
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

    IF v_kind = 'direct' THEN
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
  'Shared_post send; clears inbox_hidden_at on insert (keeps history_visible_after).';
