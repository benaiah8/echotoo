-- M2B — Per-member conversation notification mute.
-- Leave/rejoin: existing reactivation UPDATEs do not touch notifications_muted → preserved.
-- Do NOT apply during Build Locally without explicit approval.

-- ---------------------------------------------------------------------------
-- 1) Column
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS notifications_muted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.conversation_members.notifications_muted IS
  'Per-member push mute for this conversation. Does not affect unread, Realtime, or visibility. Preserved across soft-leave/rejoin.';

-- ---------------------------------------------------------------------------
-- 2) Outbox status: skipped_muted
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
      'skipped_muted'
    )
  );

-- ---------------------------------------------------------------------------
-- 3) finish allowlist includes skipped_muted
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
    'skipped_muted'
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

-- ---------------------------------------------------------------------------
-- 4) Enqueue: skip muted recipients (preserve leave/rejoin mute preference)
-- ---------------------------------------------------------------------------
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
      AND m.notifications_muted = false
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
-- 5) Mute toggle RPC (caller row only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_conversation_notifications_muted(
  p_conversation_id uuid,
  p_muted boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_muted boolean;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
  END IF;

  IF p_muted IS NULL THEN
    RAISE EXCEPTION 'Missing muted flag';
  END IF;

  UPDATE public.conversation_members m
  SET notifications_muted = p_muted
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_me
    AND m.left_at IS NULL
  RETURNING m.notifications_muted INTO v_muted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'notifications_muted', v_muted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_conversation_notifications_muted(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_conversation_notifications_muted(uuid, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.set_conversation_notifications_muted(uuid, boolean) IS
  'Toggle push mute for the caller''s active membership only (direct + group).';

-- ---------------------------------------------------------------------------
-- 6) list_my_conversations — additive notifications_muted
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
  'Inbox rows; is_request when other→viewer access_mode=request; excludes blocked directs; includes notifications_muted.';
