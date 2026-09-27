-- Phase 2: keyset pagination for list_messages (created_at, id).
-- Uses existing index messages_conversation_created_id_desc_idx.
-- LOCAL migration only until explicitly applied to production.

DROP FUNCTION IF EXISTS public.list_messages(uuid, integer);

CREATE FUNCTION public.list_messages(
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
      m.created_at
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
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
  'Phase 2: newest-first keyset page (default 20, max 50). Optional before(created_at,id) loads older. has_more via limit+1; next_cursor is oldest row of the page.';
