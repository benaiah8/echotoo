-- Phase 8F.2 — Open Plan request push outbox (local only).
-- Do NOT apply during Build without explicit approval.
--
-- New pending open_plan_requests INSERT and outbox enqueue are atomic.
-- Drain kick (net.http_post) is best-effort only.

-- ---------------------------------------------------------------------------
-- 1) Outbox table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.open_plan_request_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  request_id uuid NOT NULL
    REFERENCES public.open_plan_requests (id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL
    REFERENCES public.social_opportunities (id) ON DELETE CASCADE,
  source_post_id uuid NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  devices_sent integer NOT NULL DEFAULT 0,
  last_error text,
  processing_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT open_plan_request_push_outbox_request_uniq UNIQUE (request_id),
  CONSTRAINT open_plan_request_push_outbox_status_check CHECK (
    status IN (
      'pending',
      'processing',
      'sent',
      'failed',
      'skipped_no_tokens'
    )
  )
);

CREATE INDEX IF NOT EXISTS open_plan_request_push_outbox_pending_idx
  ON public.open_plan_request_push_outbox (created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS open_plan_request_push_outbox_recipient_idx
  ON public.open_plan_request_push_outbox (recipient_user_id, created_at DESC);

COMMENT ON TABLE public.open_plan_request_push_outbox IS
  'Queue for send-open-plan-request-push; one row per new Open Plan request (creator notify). No requester identity.';

ALTER TABLE public.open_plan_request_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.open_plan_request_push_outbox
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Enqueue (durable; caller owns transaction)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_open_plan_request_push(
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_recipient uuid;
  v_opportunity_id uuid;
  v_source_post_id uuid;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Missing request';
  END IF;

  SELECT
    o.creator_id,
    o.id,
    o.source_post_id
  INTO
    v_recipient,
    v_opportunity_id,
    v_source_post_id
  FROM public.open_plan_requests r
  JOIN public.social_opportunities o ON o.id = r.opportunity_id
  WHERE r.id = p_request_id
    AND r.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open Plan request not found for push enqueue';
  END IF;

  IF v_recipient IS NULL OR v_opportunity_id IS NULL OR v_source_post_id IS NULL THEN
    RAISE EXCEPTION 'Open Plan opportunity incomplete for push enqueue';
  END IF;

  INSERT INTO public.open_plan_request_push_outbox (
    recipient_user_id,
    request_id,
    opportunity_id,
    source_post_id,
    body
  )
  VALUES (
    v_recipient,
    p_request_id,
    v_opportunity_id,
    v_source_post_id,
    'Someone is interested in your open plan.'
  )
  ON CONFLICT (request_id) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_open_plan_request_push(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enqueue_open_plan_request_push(uuid) IS
  'Insert Open Plan request push outbox row for creator. UNIQUE(request_id). No requester identity.';

-- ---------------------------------------------------------------------------
-- 3) Claim / finish
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_open_plan_request_push_outbox_batch(
  p_limit integer DEFAULT 25
)
RETURNS SETOF public.open_plan_request_push_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT o.id
    FROM public.open_plan_request_push_outbox o
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
  UPDATE public.open_plan_request_push_outbox o
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

CREATE OR REPLACE FUNCTION public.finish_open_plan_request_push_outbox_row(
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
  IF p_status NOT IN ('sent', 'failed', 'skipped_no_tokens', 'pending') THEN
    RAISE EXCEPTION
      'Invalid open_plan_request_push_outbox finish status: %',
      p_status;
  END IF;

  UPDATE public.open_plan_request_push_outbox o
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

REVOKE ALL ON FUNCTION public.claim_open_plan_request_push_outbox_batch(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_open_plan_request_push_outbox_row(
  uuid, text, integer, text
)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.claim_open_plan_request_push_outbox_batch(integer) IS
  'Service-role drain: claim open_plan_request_push_outbox with FOR UPDATE SKIP LOCKED.';
COMMENT ON FUNCTION public.finish_open_plan_request_push_outbox_row(uuid, text, integer, text) IS
  'Service-role drain: terminal status for a claimed Open Plan request push row.';

-- ---------------------------------------------------------------------------
-- 4) request_open_plan — atomic enqueue on new INSERT only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_open_plan(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_opp public.social_opportunities%ROWTYPE;
  v_req public.open_plan_requests%ROWTYPE;
  v_created boolean := false;
  v_push_secret text;
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

  -- 1) Lock opportunity first
  SELECT *
  INTO v_opp
  FROM public.social_opportunities o
  WHERE o.id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open Plan not found';
  END IF;

  IF v_opp.kind <> 'open_plan'
     OR v_opp.status <> 'active'
     OR v_opp.discoverable_until <= now()
     OR v_opp.occurs_at IS NULL
     OR v_opp.occurs_at <= now() THEN
    RAISE EXCEPTION 'Open Plan is not available';
  END IF;

  IF v_opp.creator_id = v_me THEN
    RAISE EXCEPTION 'Cannot request your own Open Plan';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_opp.creator_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_opp.creator_id) THEN
    RAISE EXCEPTION 'Cannot request this Open Plan';
  END IF;

  IF NOT public.open_plan_source_is_eligible(v_opp.source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  -- 2) Existing unresolved request (pending or accepted) — no notify
  SELECT *
  INTO v_req
  FROM public.open_plan_requests r
  WHERE r.opportunity_id = p_opportunity_id
    AND r.requester_id = v_me
    AND r.status IN ('pending', 'accepted')
  ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'updated_at', v_req.updated_at,
        'resolved_at', v_req.resolved_at
      )
    );
  END IF;

  BEGIN
    INSERT INTO public.open_plan_requests (
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
      -- Race recovery: reuse existing unresolved row — no notify
      SELECT *
      INTO v_req
      FROM public.open_plan_requests r
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

  -- 3) New request only: durable outbox in same transaction (do not swallow)
  IF v_created THEN
    PERFORM public.enqueue_open_plan_request_push(v_req.id);

    -- Fire-and-forget drain. Outbox remains pending if kick fails.
    BEGIN
      SELECT ds.decrypted_secret
      INTO v_push_secret
      FROM vault.decrypted_secrets ds
      WHERE ds.name = 'internal_push_secret'
      LIMIT 1;

      IF v_push_secret IS NOT NULL AND btrim(v_push_secret) <> '' THEN
        PERFORM net.http_post(
          url := 'https://otfbgcvxevwtybfltvuf.supabase.co/functions/v1/send-open-plan-request-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-internal-push-secret', btrim(v_push_secret)
          ),
          body := '{"drain_outbox":true,"limit":25}'::jsonb
        );
      ELSE
        RAISE WARNING
          'open_plan_request push drain kick skipped for request %: internal_push_secret missing',
          v_req.id;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING
          'open_plan_request push drain kick failed for request %: %',
          v_req.id,
          SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_req.id,
      'opportunity_id', v_req.opportunity_id,
      'status', v_req.status,
      'created_at', v_req.created_at,
      'updated_at', v_req.updated_at,
      'resolved_at', v_req.resolved_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_open_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_open_plan(uuid) TO authenticated;

COMMENT ON FUNCTION public.request_open_plan(uuid) IS
  'I''m down: create or reuse pending/accepted Open Plan request. New INSERT atomically enqueues creator push outbox; drain kick best-effort.';

-- Scheduled outbox fallback (DM-style flush-dm-push-outbox */2).
-- Covers failed immediate net.http_post kicks; terminal failed rows stay non-retried.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(j.jobid)
  FROM cron.job j
  WHERE j.jobname = 'flush-open-plan-request-push-outbox';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron.job missing; skip unschedule for flush-open-plan-request-push-outbox';
  WHEN OTHERS THEN
    RAISE NOTICE 'cron unschedule skipped for flush-open-plan-request-push-outbox: %', SQLERRM;
END $$;

SELECT cron.schedule(
  'flush-open-plan-request-push-outbox',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://otfbgcvxevwtybfltvuf.supabase.co/functions/v1/send-open-plan-request-push',
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
