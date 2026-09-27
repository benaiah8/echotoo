-- Phase 3: inbox list + concurrency-safe mark-read RPCs.
-- LOCAL only until explicitly applied. No table DDL / Realtime / notifications.

-- ---------------------------------------------------------------------------
-- list_my_conversations
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
      c.last_message_at AS sort_last_message_at
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
    ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
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
  'Phase 3: viewer inbox rows with partner profile peek, unread, and last-message summary. No message bodies.';

-- ---------------------------------------------------------------------------
-- mark_conversation_read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_conversation_read(
  p_conversation_id uuid,
  p_seen_through_created_at timestamptz DEFAULT NULL,
  p_seen_through_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_unread integer;
  v_recount integer;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
  END IF;

  IF (p_seen_through_created_at IS NULL) <> (p_seen_through_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid cursor: created_at and id are both required';
  END IF;

  -- Lock member row before recount (serializes vs send_message unread +1).
  SELECT m.unread_count
  INTO v_unread
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_me
    AND m.left_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  -- Both null: no mutation (client must not mark-read with nothing seen).
  IF p_seen_through_created_at IS NULL AND p_seen_through_id IS NULL THEN
    RETURN jsonb_build_object(
      'conversation_id', p_conversation_id,
      'unread_count', v_unread,
      'updated', false
    );
  END IF;

  SELECT COUNT(*)::integer
  INTO v_recount
  FROM public.messages msg
  WHERE msg.conversation_id = p_conversation_id
    AND msg.sender_user_id <> v_me
    AND (
      msg.created_at > p_seen_through_created_at
      OR (
        msg.created_at = p_seen_through_created_at
        AND msg.id > p_seen_through_id
      )
    );

  UPDATE public.conversation_members m
  SET unread_count = LEAST(m.unread_count, v_recount)
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_me
    AND m.left_at IS NULL
  RETURNING m.unread_count INTO v_unread;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'unread_count', v_unread,
    'updated', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid, timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid, timestamptz, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.mark_conversation_read(uuid, timestamptz, uuid) IS
  'Phase 3: lock member row, recount unread after seen-through tip, LEAST decrease only. Null cursor = noop.';
