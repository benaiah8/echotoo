-- DM push: skipped_read terminal status + best-effort fast drain after enqueue.
-- Cron flush-dm-push-outbox (*/2) is unchanged and remains the reliability fallback.
-- Do NOT apply during Build Locally without explicit approval.

-- ---------------------------------------------------------------------------
-- 1) Outbox status: skipped_read
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
      'superseded',
      'skipped_muted',
      'skipped_read'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) finish allowlist includes skipped_read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finish_dm_push_outbox_row(
  p_id uuid,
  p_status text,
  p_devices_sent integer DEFAULT 0,
  p_last_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF p_status NOT IN (
    'sent',
    'failed',
    'skipped_no_tokens',
    'pending',
    'skipped_muted',
    'skipped_read'
  ) THEN
    RAISE EXCEPTION 'Invalid dm_push_outbox finish status: %', p_status;
  END IF;

  UPDATE public.dm_push_outbox o
  SET
    status = p_status,
    devices_sent = GREATEST(COALESCE(p_devices_sent, 0), 0),
    last_error = NULLIF(btrim(COALESCE(p_last_error, '')), ''),
    sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE o.sent_at END,
    processing_at = NULL,
    updated_at = now()
  WHERE o.id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finish_dm_push_outbox_row(uuid, text, integer, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.finish_dm_push_outbox_row(uuid, text, integer, text) IS
  'Service-role drain helper: terminal status for a claimed outbox row (includes skipped_read).';

-- ---------------------------------------------------------------------------
-- 3) send_message — same access/unread/enqueue path; best-effort drain kick
-- Kick is a separate subtransaction from enqueue so a failed http_post cannot
-- roll back a successful outbox insert.
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
  'Send text; direct access_mode denied|request|full; request uses 2-message assert; idempotent-first; best-effort outbox enqueue + drain kick.';
