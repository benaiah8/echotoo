-- Group Up request and approval push outbox.
-- Local only. Do not apply without explicit approval.
--
-- New pending group_up_requests INSERT enqueues one organizer notice.
-- First membership grant on accept enqueues one requester notice.
-- Repeat Join, race recovery, repeat Accept, decline, and withdraw do not enqueue.
-- Drain kick (net.http_post) is best-effort only.

-- ---------------------------------------------------------------------------
-- 1) Outbox
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_up_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_kind text NOT NULL,
  recipient_user_id uuid NOT NULL,
  request_id uuid NOT NULL
    REFERENCES public.group_up_requests (id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL
    REFERENCES public.social_opportunities (id) ON DELETE CASCADE,
  conversation_id uuid,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  devices_sent integer NOT NULL DEFAULT 0,
  last_error text,
  processing_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_up_push_outbox_event_uniq UNIQUE (request_id, event_kind),
  CONSTRAINT group_up_push_outbox_event_kind_check CHECK (
    event_kind IN ('request', 'accepted')
  ),
  CONSTRAINT group_up_push_outbox_status_check CHECK (
    status IN (
      'pending',
      'processing',
      'sent',
      'failed',
      'skipped_no_tokens',
      'skipped_muted',
      'skipped_stale'
    )
  )
);

CREATE INDEX IF NOT EXISTS group_up_push_outbox_pending_idx
  ON public.group_up_push_outbox (created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS group_up_push_outbox_recipient_idx
  ON public.group_up_push_outbox (recipient_user_id, created_at DESC);

COMMENT ON TABLE public.group_up_push_outbox IS
  'Queue for send-group-up-push. One row per request event kind. Bodies are generic and contain no requester identity.';

ALTER TABLE public.group_up_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.group_up_push_outbox
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Enqueue (durable; caller owns the transaction)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_group_up_push(
  p_request_id uuid,
  p_event_kind text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_recipient uuid;
  v_opportunity_id uuid;
  v_conversation_id uuid;
  v_body text;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Missing request';
  END IF;

  IF p_event_kind = 'request' THEN
    SELECT o.creator_id, o.id, o.conversation_id
    INTO v_recipient, v_opportunity_id, v_conversation_id
    FROM public.group_up_requests r
    JOIN public.social_opportunities o ON o.id = r.opportunity_id
    WHERE r.id = p_request_id
      AND r.status = 'pending'
      AND o.kind = 'group_up';
    v_body := 'Someone wants to join your group.';
  ELSIF p_event_kind = 'accepted' THEN
    SELECT r.requester_id, o.id, o.conversation_id
    INTO v_recipient, v_opportunity_id, v_conversation_id
    FROM public.group_up_requests r
    JOIN public.social_opportunities o ON o.id = r.opportunity_id
    WHERE r.id = p_request_id
      AND r.status = 'accepted'
      AND o.kind = 'group_up'
      AND o.conversation_id IS NOT NULL;
    v_body := 'You''re in! Your Group Up request was accepted.';
  ELSE
    RAISE EXCEPTION 'Invalid Group Up push event kind: %', p_event_kind;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up request not found for push enqueue';
  END IF;

  IF v_recipient IS NULL OR v_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Group Up opportunity incomplete for push enqueue';
  END IF;

  IF p_event_kind = 'accepted' AND v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Group Up conversation missing for approval push';
  END IF;

  INSERT INTO public.group_up_push_outbox (
    event_kind,
    recipient_user_id,
    request_id,
    opportunity_id,
    conversation_id,
    body
  )
  VALUES (
    p_event_kind,
    v_recipient,
    p_request_id,
    v_opportunity_id,
    CASE WHEN p_event_kind = 'accepted' THEN v_conversation_id ELSE NULL END,
    v_body
  )
  ON CONFLICT (request_id, event_kind) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_group_up_push(uuid, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enqueue_group_up_push(uuid, text) IS
  'Insert one Group Up push outbox row. UNIQUE(request_id, event_kind). Generic body only.';

-- ---------------------------------------------------------------------------
-- 3) Claim / finish
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_group_up_push_outbox_batch(
  p_limit integer DEFAULT 25
)
RETURNS SETOF public.group_up_push_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT o.id
    FROM public.group_up_push_outbox o
    WHERE (
      o.status = 'pending'
      OR (
        o.status = 'processing'
        AND o.processing_at IS NOT NULL
        AND o.processing_at < now() - interval '5 minutes'
      )
    )
    ORDER BY o.created_at ASC
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 25), 100), 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.group_up_push_outbox o
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

CREATE OR REPLACE FUNCTION public.finish_group_up_push_outbox_row(
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
    'skipped_muted',
    'skipped_stale',
    'pending'
  ) THEN
    RAISE EXCEPTION
      'Invalid group_up_push_outbox finish status: %',
      p_status;
  END IF;

  UPDATE public.group_up_push_outbox o
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

REVOKE ALL ON FUNCTION public.claim_group_up_push_outbox_batch(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_group_up_push_outbox_row(
  uuid, text, integer, text
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_group_up_push_outbox_batch(integer)
  TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.finish_group_up_push_outbox_row(
  uuid, text, integer, text
)
  TO postgres, service_role;

COMMENT ON FUNCTION public.claim_group_up_push_outbox_batch(integer) IS
  'Service-role drain: claim pending rows, or processing rows older than 5 minutes, with FOR UPDATE SKIP LOCKED. sent, failed, skipped_no_tokens, skipped_muted, and skipped_stale are not reclaimed.';
COMMENT ON FUNCTION public.finish_group_up_push_outbox_row(uuid, text, integer, text) IS
  'Service-role drain: set a claimed Group Up push row. pending is retryable. skipped_stale is terminal.';

-- ---------------------------------------------------------------------------
-- 3b) Freshness check immediately before dispatch. Service role only.
-- A confirmed missing or inactive row is stale. This function raises on
-- unexpected database errors so the drain can retry instead of skipping.
-- Checking here is not atomic with FCM: a withdraw or removal after this
-- read can still be delivered once. A finish failure after FCM success can
-- be claimed again after 5 minutes, so delivery is not exactly-once.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_up_push_delivery_state(
  p_request_id uuid,
  p_event_kind text,
  p_recipient_user_id uuid,
  p_conversation_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_status text;
  v_requester uuid;
  v_creator uuid;
  v_conversation uuid;
  v_active boolean;
BEGIN
  IF p_event_kind IS DISTINCT FROM 'request'
     AND p_event_kind IS DISTINCT FROM 'accepted' THEN
    RETURN 'stale';
  END IF;

  SELECT r.status, r.requester_id, o.creator_id, o.conversation_id
  INTO v_status, v_requester, v_creator, v_conversation
  FROM public.group_up_requests r
  JOIN public.social_opportunities o ON o.id = r.opportunity_id
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RETURN 'stale';
  END IF;

  IF p_event_kind = 'request' THEN
    IF v_status = 'pending' AND v_creator = p_recipient_user_id THEN
      RETURN 'current';
    END IF;
    RETURN 'stale';
  END IF;

  IF v_status IS DISTINCT FROM 'accepted'
     OR v_requester IS DISTINCT FROM p_recipient_user_id
     OR v_conversation IS NULL
     OR p_conversation_id IS NULL
     OR v_conversation IS DISTINCT FROM p_conversation_id THEN
    RETURN 'stale';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = v_conversation
      AND cm.user_id = p_recipient_user_id
      AND cm.left_at IS NULL
  )
  INTO v_active;

  IF v_active THEN
    RETURN 'current';
  END IF;
  RETURN 'stale';
END;
$function$;

REVOKE ALL ON FUNCTION public.group_up_push_delivery_state(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_up_push_delivery_state(uuid, text, uuid, uuid)
  TO postgres, service_role;

COMMENT ON FUNCTION public.group_up_push_delivery_state(uuid, text, uuid, uuid) IS
  'Service-role drain only. Returns current or stale. Does not return account names or member lists.';

-- ---------------------------------------------------------------------------
-- 4) Best-effort drain kick
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kick_group_up_push_drain(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_push_secret text;
BEGIN
  BEGIN
    SELECT ds.decrypted_secret
    INTO v_push_secret
    FROM vault.decrypted_secrets ds
    WHERE ds.name = 'internal_push_secret'
    LIMIT 1;

    IF v_push_secret IS NOT NULL AND btrim(v_push_secret) <> '' THEN
      PERFORM net.http_post(
        url := 'https://otfbgcvxevwtybfltvuf.supabase.co/functions/v1/send-group-up-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-push-secret', btrim(v_push_secret)
        ),
        body := '{"drain_outbox":true,"limit":25}'::jsonb
      );
    ELSE
      RAISE WARNING
        'group_up push drain kick skipped for request %: internal_push_secret missing',
        p_request_id;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING
        'group_up push drain kick failed for request %: %',
        p_request_id,
        SQLERRM;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.kick_group_up_push_drain(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) request_group_up — enqueue only after a new pending INSERT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_group_up(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_opp public.social_opportunities%ROWTYPE;
  v_post public.posts%ROWTYPE;
  v_req public.group_up_requests%ROWTYPE;
  v_member_count integer;
  v_created boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing opportunity';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_me
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  SELECT *
  INTO v_opp
  FROM public.social_opportunities o
  WHERE o.id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up not found';
  END IF;

  IF v_opp.kind <> 'group_up'
     OR v_opp.status <> 'active'
     OR v_opp.discoverable_until <= now() THEN
    RAISE EXCEPTION 'Group Up is not available';
  END IF;

  IF NOT public.group_up_source_is_eligible(v_opp.source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  IF v_opp.creator_id = v_me THEN
    RAISE EXCEPTION 'Cannot request your own Group Up';
  END IF;

  SELECT *
  INTO v_post
  FROM public.posts p
  WHERE p.id = v_opp.source_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = v_opp.conversation_id
      AND cm.user_id = v_me
      AND cm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Already a group member';
  END IF;

  v_member_count := public._count_active_members(v_opp.conversation_id);
  IF v_member_count >= 200 THEN
    RAISE EXCEPTION 'Group member limit is 200';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_opp.creator_id) THEN
    RAISE EXCEPTION 'Cannot request this Group Up';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_post.author_id) THEN
    RAISE EXCEPTION 'Cannot request this Group Up';
  END IF;

  SELECT *
  INTO v_req
  FROM public.group_up_requests r
  WHERE r.opportunity_id = p_opportunity_id
    AND r.requester_id = v_me
  ORDER BY
    CASE r.status
      WHEN 'pending' THEN 0
      WHEN 'accepted' THEN 1
      WHEN 'declined' THEN 2
      WHEN 'withdrawn' THEN 3
      ELSE 4
    END,
    r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_req.status = 'pending' OR v_req.status = 'accepted' THEN
      RETURN jsonb_build_object(
        'request', jsonb_build_object(
          'id', v_req.id,
          'opportunity_id', v_req.opportunity_id,
          'status', v_req.status,
          'created_at', v_req.created_at
        )
      );
    END IF;

    IF v_req.status = 'declined' THEN
      RAISE EXCEPTION 'Cannot request this Group Up';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.group_up_requests (
      opportunity_id,
      requester_id,
      status
    )
    VALUES (
      p_opportunity_id,
      v_me,
      'pending'
    )
    RETURNING * INTO v_req;
    v_created := true;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO v_req
      FROM public.group_up_requests r
      WHERE r.opportunity_id = p_opportunity_id
        AND r.requester_id = v_me
        AND r.status IN ('pending', 'accepted')
      ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE;
      END IF;
      v_created := false;
  END;

  IF v_created THEN
    PERFORM public.enqueue_group_up_push(v_req.id, 'request');
    PERFORM public.kick_group_up_push_drain(v_req.id);
  END IF;

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_req.id,
      'opportunity_id', v_req.opportunity_id,
      'status', v_req.status,
      'created_at', v_req.created_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_group_up(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_group_up(uuid)
  TO authenticated, postgres, service_role;

COMMENT ON FUNCTION public.request_group_up(uuid) IS
  'Requester Join for Group Up. Refuses when conversation already has 200 active members. Does not add membership. New pending INSERT enqueues one organizer push.';

-- ---------------------------------------------------------------------------
-- 6) accept_group_up_request — enqueue only when this call grants membership
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_group_up_request(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  c_max_active_members integer := 200;
  v_me uuid := auth.uid();
  v_opp_id uuid;
  v_opp public.social_opportunities%ROWTYPE;
  v_req public.group_up_requests%ROWTYPE;
  v_other uuid;
  v_conv_id uuid;
  v_left_at timestamptz;
  v_active integer;
  v_membership_granted boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Missing request';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_me
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  SELECT r.opportunity_id
  INTO v_opp_id
  FROM public.group_up_requests r
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up request not found';
  END IF;

  SELECT *
  INTO v_opp
  FROM public.social_opportunities o
  WHERE o.id = v_opp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up not found';
  END IF;

  SELECT *
  INTO v_req
  FROM public.group_up_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up request not found';
  END IF;

  IF v_req.opportunity_id <> v_opp.id THEN
    RAISE EXCEPTION 'Group Up request not found';
  END IF;

  IF v_opp.kind <> 'group_up' THEN
    RAISE EXCEPTION 'Not a Group Up';
  END IF;

  IF v_opp.creator_id <> v_me THEN
    RAISE EXCEPTION 'Not the Group Up owner';
  END IF;

  IF v_opp.conversation_id IS NULL THEN
    RAISE EXCEPTION 'Group Up conversation missing';
  END IF;

  v_conv_id := v_opp.conversation_id;
  v_other := v_req.requester_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = v_conv_id
      AND c.kind = 'group'
  ) THEN
    RAISE EXCEPTION 'Group Up conversation missing';
  END IF;

  IF v_req.status = 'accepted'
     AND EXISTS (
       SELECT 1
       FROM public.conversation_members cm
       WHERE cm.conversation_id = v_conv_id
         AND cm.user_id = v_other
         AND cm.left_at IS NULL
     ) THEN
    RETURN jsonb_build_object(
      'accepted', true,
      'reason', NULL,
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'updated_at', v_req.updated_at,
        'resolved_at', v_req.resolved_at
      ),
      'opportunity_id', v_opp.id,
      'conversation_id', v_conv_id,
      'requester_user_id', v_other
    );
  END IF;

  IF v_req.status IN ('withdrawn', 'declined', 'closed') THEN
    RAISE EXCEPTION 'Group Up request is not pending';
  END IF;

  IF v_req.status <> 'pending' AND v_req.status <> 'accepted' THEN
    RAISE EXCEPTION 'Group Up request is not pending';
  END IF;

  IF v_opp.status <> 'active' THEN
    IF v_req.status = 'pending' THEN
      UPDATE public.group_up_requests
      SET status = 'closed',
          resolved_at = now(),
          updated_at = now()
      WHERE id = v_req.id
      RETURNING * INTO v_req;
    END IF;

    RETURN jsonb_build_object(
      'accepted', false,
      'reason', 'group_unavailable',
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'updated_at', v_req.updated_at,
        'resolved_at', v_req.resolved_at
      ),
      'opportunity_id', v_opp.id,
      'conversation_id', v_conv_id,
      'requester_user_id', v_other
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_other
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_other) THEN
    RAISE EXCEPTION 'Cannot include blocked users in this group';
  END IF;

  PERFORM public._lock_group_conversation(v_conv_id);

  IF EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = v_conv_id
      AND cm.user_id = v_other
      AND cm.left_at IS NULL
  ) THEN
    UPDATE public.group_up_requests
    SET status = 'accepted',
        resolved_at = COALESCE(resolved_at, now()),
        updated_at = now()
    WHERE id = v_req.id
    RETURNING * INTO v_req;

    RETURN jsonb_build_object(
      'accepted', true,
      'reason', NULL,
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'updated_at', v_req.updated_at,
        'resolved_at', v_req.resolved_at
      ),
      'opportunity_id', v_opp.id,
      'conversation_id', v_conv_id,
      'requester_user_id', v_other
    );
  END IF;

  v_active := public._count_active_members(v_conv_id);
  IF v_active >= c_max_active_members THEN
    RAISE EXCEPTION 'Group member limit is %', c_max_active_members;
  END IF;

  SELECT m.left_at
  INTO v_left_at
  FROM public.conversation_members m
  WHERE m.conversation_id = v_conv_id
    AND m.user_id = v_other;

  IF FOUND THEN
    UPDATE public.conversation_members m
    SET
      left_at = NULL,
      role = 'member',
      unread_count = 0,
      joined_at = now()
    WHERE m.conversation_id = v_conv_id
      AND m.user_id = v_other
      AND m.left_at IS NOT NULL;
    v_membership_granted := true;
  ELSE
    INSERT INTO public.conversation_members (
      conversation_id,
      user_id,
      role,
      unread_count,
      joined_at
    )
    VALUES (
      v_conv_id,
      v_other,
      'member',
      0,
      now()
    );
    v_membership_granted := true;
  END IF;

  UPDATE public.group_up_requests
  SET status = 'accepted',
      resolved_at = COALESCE(resolved_at, now()),
      updated_at = now()
  WHERE id = v_req.id
  RETURNING * INTO v_req;

  IF v_membership_granted THEN
    PERFORM public.enqueue_group_up_push(v_req.id, 'accepted');
    PERFORM public.kick_group_up_push_drain(v_req.id);
  END IF;

  RETURN jsonb_build_object(
    'accepted', true,
    'reason', NULL,
    'request', jsonb_build_object(
      'id', v_req.id,
      'opportunity_id', v_req.opportunity_id,
      'status', v_req.status,
      'created_at', v_req.created_at,
      'updated_at', v_req.updated_at,
      'resolved_at', v_req.resolved_at
    ),
    'opportunity_id', v_opp.id,
    'conversation_id', v_conv_id,
    'requester_user_id', v_other
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_group_up_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_group_up_request(uuid)
  TO authenticated, postgres, service_role;

COMMENT ON FUNCTION public.accept_group_up_request(uuid) IS
  'Host Accept → add/reactivate requester as member on EXISTING group conversation. Cap 200 under conversation lock. First membership grant enqueues one requester push.';

-- ---------------------------------------------------------------------------
-- 7) Scheduled outbox fallback. Terminal failed/skipped rows stay unreclaimed.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(j.jobid)
  FROM cron.job j
  WHERE j.jobname = 'flush-group-up-push-outbox';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron.job missing; skip unschedule for flush-group-up-push-outbox';
  WHEN OTHERS THEN
    RAISE NOTICE 'cron unschedule skipped for flush-group-up-push-outbox: %', SQLERRM;
END $$;

SELECT cron.schedule(
  'flush-group-up-push-outbox',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://otfbgcvxevwtybfltvuf.supabase.co/functions/v1/send-group-up-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-push-secret', (
        SELECT btrim(ds.decrypted_secret)
        FROM vault.decrypted_secrets ds
        WHERE ds.name = 'internal_push_secret'
        LIMIT 1
      )
    ),
    body := '{"drain_outbox":true,"limit":25}'::jsonb
  );
  $$
);
