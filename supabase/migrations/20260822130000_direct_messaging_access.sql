-- R1B: read-only get_direct_messaging_access for proactive stranger composer UI.
-- LOCAL only until explicitly applied. Does not replace send/list RPCs or push.
--
-- Depends on: R1A dm_direct_is_unlocked + qualifying message index.

CREATE OR REPLACE FUNCTION public.get_direct_messaging_access(
  p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_kind text;
  v_low uuid;
  v_high uuid;
  v_other uuid;
  v_unlocked boolean;
  v_count integer;
  v_can_send boolean;
  v_remaining integer;
  v_restriction text;
  v_is_request boolean;
  v_has_any_qualifying boolean;
  v_other_has_qualifying boolean;
  v_viewer_has_qualifying boolean;
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

  SELECT c.kind, c.direct_user_low, c.direct_user_high
  INTO v_kind, v_low, v_high
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  -- Defense in depth: client should not call for groups.
  IF v_kind IS DISTINCT FROM 'direct' THEN
    RETURN jsonb_build_object(
      'conversation_id', p_conversation_id,
      'kind', COALESCE(v_kind, 'group'),
      'unlocked', true,
      'can_send', true,
      'qualifying_sent_count', 0,
      'messages_remaining', NULL,
      'restriction', NULL,
      'is_request', false
    );
  END IF;

  IF v_low = v_me THEN
    v_other := v_high;
  ELSIF v_high = v_me THEN
    v_other := v_low;
  ELSE
    RAISE EXCEPTION 'Invalid direct conversation';
  END IF;

  IF v_other IS NULL THEN
    RAISE EXCEPTION 'Invalid direct conversation';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_other) THEN
    RETURN jsonb_build_object(
      'conversation_id', p_conversation_id,
      'kind', 'direct',
      'unlocked', false,
      'can_send', false,
      'qualifying_sent_count', 0,
      'messages_remaining', NULL,
      'restriction', 'blocked',
      'is_request', false
    );
  END IF;

  v_unlocked := public.dm_direct_is_unlocked(p_conversation_id, v_me, v_other);

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_user_id = v_me
    AND m.message_kind IN ('text', 'shared_post');

  v_count := COALESCE(v_count, 0);

  IF v_unlocked THEN
    v_can_send := true;
    v_remaining := NULL;
    v_restriction := NULL;
  ELSE
    v_can_send := v_count < 2;
    v_remaining := GREATEST(0, 2 - v_count);
    IF v_count >= 2 THEN
      v_restriction := 'waiting_for_reply';
    ELSE
      v_restriction := NULL;
    END IF;
  END IF;

  -- Same R1A list_my_conversations is_request semantics (viewer-relative).
  SELECT EXISTS (
    SELECT 1
    FROM public.messages msg
    WHERE msg.conversation_id = p_conversation_id
      AND msg.message_kind IN ('text', 'shared_post')
  )
  INTO v_has_any_qualifying;

  SELECT EXISTS (
    SELECT 1
    FROM public.messages msg
    WHERE msg.conversation_id = p_conversation_id
      AND msg.sender_user_id = v_other
      AND msg.message_kind IN ('text', 'shared_post')
  )
  INTO v_other_has_qualifying;

  SELECT EXISTS (
    SELECT 1
    FROM public.messages msg
    WHERE msg.conversation_id = p_conversation_id
      AND msg.sender_user_id = v_me
      AND msg.message_kind IN ('text', 'shared_post')
  )
  INTO v_viewer_has_qualifying;

  -- R1A uses last_message_at IS NULL as empty; qualify via messages for cold open.
  v_is_request :=
    (NOT v_unlocked)
    AND COALESCE(v_has_any_qualifying, false)
    AND COALESCE(v_other_has_qualifying, false)
    AND NOT COALESCE(v_viewer_has_qualifying, false);

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'kind', 'direct',
    'unlocked', v_unlocked,
    'can_send', v_can_send,
    'qualifying_sent_count', v_count,
    'messages_remaining', v_remaining,
    'restriction', v_restriction,
    'is_request', v_is_request
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_direct_messaging_access(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_direct_messaging_access(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_direct_messaging_access(uuid) IS
  'R1B: read-only direct DM access for composer UI (unlocked/can_send/count/restriction/is_request).';
