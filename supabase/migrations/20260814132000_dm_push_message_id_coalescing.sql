-- DM push coalescing + message_id patch (apply after Migration A/B on production).
-- Does not enable cron. Safe to apply before automatic outbox drain.

-- ---------------------------------------------------------------------------
-- 1) message_id column + indexes
-- ---------------------------------------------------------------------------
ALTER TABLE public.dm_push_outbox
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS dm_push_outbox_message_id_idx
  ON public.dm_push_outbox (message_id)
  WHERE message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS dm_push_outbox_recipient_message_uniq
  ON public.dm_push_outbox (recipient_user_id, message_id)
  WHERE message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Extend status check with superseded
-- ---------------------------------------------------------------------------
ALTER TABLE public.dm_push_outbox
  DROP CONSTRAINT IF EXISTS dm_push_outbox_status_check;

ALTER TABLE public.dm_push_outbox
  ADD CONSTRAINT dm_push_outbox_status_check CHECK (
    status IN (
      'pending',
      'processing',
      'sent',
      'failed',
      'skipped_no_tokens',
      'superseded'
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Enqueue helper with message_id
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.enqueue_dm_push_outbox_for_message(uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.enqueue_dm_push_outbox_for_message(
  p_message_id uuid,
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
      message_id,
      body,
      sender_name,
      conversation_kind,
      group_name
    )
    VALUES (
      v_recipient,
      p_conversation_id,
      p_sender_user_id,
      p_message_id,
      p_preview,
      v_sender_name,
      p_conversation_kind,
      CASE WHEN p_conversation_kind = 'group' THEN p_group_name ELSE NULL END
    )
    ON CONFLICT (recipient_user_id, message_id)
      WHERE message_id IS NOT NULL
    DO NOTHING;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_dm_push_outbox_for_message(uuid, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) send_message passes message id; enqueue failures do not roll back send
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
  'Send DM/group message; bumps unread + best-effort dm_push_outbox enqueue (failures do not roll back send).';

-- ---------------------------------------------------------------------------
-- 5) Coalescing claim: latest pending per recipient+conversation only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_dm_push_outbox_batch(p_limit integer DEFAULT 25)
RETURNS SETOF public.dm_push_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  -- Supersede older claimable rows in the same recipient/conversation group.
  WITH claimable AS (
    SELECT o.id, o.recipient_user_id, o.conversation_id, o.created_at, o.status
    FROM public.dm_push_outbox o
    WHERE o.status = 'pending'
      OR (
        o.status = 'processing'
        AND o.processing_at IS NOT NULL
        AND o.processing_at < now() - interval '5 minutes'
      )
  ),
  latest_per_group AS (
    SELECT DISTINCT ON (c.recipient_user_id, c.conversation_id)
      c.id
    FROM claimable c
    ORDER BY c.recipient_user_id, c.conversation_id, c.created_at DESC
  ),
  supersede_targets AS (
    SELECT c.id
    FROM claimable c
    WHERE c.id NOT IN (SELECT id FROM latest_per_group)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.dm_push_outbox o
  SET
    status = 'superseded',
    last_error = 'superseded by newer message',
    processing_at = NULL,
    updated_at = now()
  FROM supersede_targets s
  WHERE o.id = s.id;

  RETURN QUERY
  WITH claimable AS (
    SELECT o.id, o.recipient_user_id, o.conversation_id, o.created_at, o.status, o.processing_at
    FROM public.dm_push_outbox o
    WHERE o.status = 'pending'
      OR (
        o.status = 'processing'
        AND o.processing_at IS NOT NULL
        AND o.processing_at < now() - interval '5 minutes'
      )
  ),
  latest_per_group AS (
    SELECT DISTINCT ON (c.recipient_user_id, c.conversation_id)
      c.id,
      c.created_at
    FROM claimable c
    ORDER BY c.recipient_user_id, c.conversation_id, c.created_at DESC
  ),
  picked AS (
    SELECT l.id
    FROM latest_per_group l
    JOIN public.dm_push_outbox o ON o.id = l.id
    ORDER BY l.created_at ASC
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 25), 100), 1)
    FOR UPDATE OF o SKIP LOCKED
  )
  UPDATE public.dm_push_outbox o
  SET
    status = 'processing',
    processing_at = now(),
    attempts = o.attempts + 1,
    updated_at = now()
  FROM picked
  WHERE o.id = picked.id
  RETURNING o.*;
END;
$function$;

COMMENT ON FUNCTION public.claim_dm_push_outbox_batch(integer) IS
  'Service-role drain helper: supersede older pending rows per recipient/conversation, claim latest only.';
