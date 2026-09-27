-- Notification closeout (stage A): tables, RLS, claim/finish helpers.
-- Does NOT replace send_message — apply 20260814131000 after Edge deploy smoke test.
-- pg_cron examples below are COMMENTED ONLY — enable manually in Dashboard when ready.

-- ---------------------------------------------------------------------------
-- 1) DM push outbox
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dm_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  body text NOT NULL,
  sender_name text,
  conversation_kind text,
  group_name text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  devices_sent integer NOT NULL DEFAULT 0,
  last_error text,
  processing_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dm_push_outbox_status_check CHECK (
    status IN (
      'pending',
      'processing',
      'sent',
      'failed',
      'skipped_no_tokens'
    )
  )
);

CREATE INDEX IF NOT EXISTS dm_push_outbox_pending_idx
  ON public.dm_push_outbox (created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS dm_push_outbox_recipient_idx
  ON public.dm_push_outbox (recipient_user_id, created_at DESC);

COMMENT ON TABLE public.dm_push_outbox IS
  'Queue for send-dm-push Edge drain; one row per new message (recipient push).';

ALTER TABLE public.dm_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dm_push_outbox FROM PUBLIC, anon, authenticated;

-- Claim pending (or stale processing) rows with SKIP LOCKED for safe concurrent drains.
CREATE OR REPLACE FUNCTION public.claim_dm_push_outbox_batch(p_limit integer DEFAULT 25)
RETURNS SETOF public.dm_push_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT o.id
    FROM public.dm_push_outbox o
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
  IF p_status NOT IN ('sent', 'failed', 'skipped_no_tokens', 'pending') THEN
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

REVOKE ALL ON FUNCTION public.claim_dm_push_outbox_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_dm_push_outbox_row(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.claim_dm_push_outbox_batch(integer) IS
  'Service-role drain helper: claim dm_push_outbox rows with FOR UPDATE SKIP LOCKED.';
COMMENT ON FUNCTION public.finish_dm_push_outbox_row(uuid, text, integer, text) IS
  'Service-role drain helper: terminal status for a claimed outbox row.';

-- ---------------------------------------------------------------------------
-- 2) Saved event reminder idempotency log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_event_reminder_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  reminder_kind text NOT NULL DEFAULT 'day_before',
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  devices_sent integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_event_reminder_sent_uniq
    UNIQUE (user_id, post_id, occurrence_date, reminder_kind),
  CONSTRAINT saved_event_reminder_sent_status_check CHECK (
    status IN ('pending', 'sent', 'failed', 'skipped_no_tokens')
  )
);

CREATE INDEX IF NOT EXISTS saved_event_reminder_sent_user_idx
  ON public.saved_event_reminder_sent (user_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS saved_event_reminder_sent_pending_idx
  ON public.saved_event_reminder_sent (occurrence_date, reminder_kind)
  WHERE status = 'pending';

COMMENT ON TABLE public.saved_event_reminder_sent IS
  'Idempotency log for send-saved-event-reminders (push-only MVP; UTC day-before).';

ALTER TABLE public.saved_event_reminder_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saved_event_reminder_sent FROM PUBLIC, anon, authenticated;

-- Insert claim row before send; NULL if already sent or in-flight by another worker.
CREATE OR REPLACE FUNCTION public.claim_saved_event_reminder(
  p_user_id uuid,
  p_post_id uuid,
  p_occurrence_date date,
  p_reminder_kind text DEFAULT 'day_before'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.saved_event_reminder_sent (
    user_id,
    post_id,
    occurrence_date,
    reminder_kind,
    status,
    attempts
  )
  VALUES (
    p_user_id,
    p_post_id,
    p_occurrence_date,
    COALESCE(NULLIF(btrim(p_reminder_kind), ''), 'day_before'),
    'pending',
    1
  )
  ON CONFLICT (user_id, post_id, occurrence_date, reminder_kind) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Retry stale pending (>10m) or failed (attempts < 5) rows only.
  UPDATE public.saved_event_reminder_sent r
  SET
    status = 'pending',
    attempts = r.attempts + 1,
    updated_at = now(),
    last_error = NULL
  WHERE r.user_id = p_user_id
    AND r.post_id = p_post_id
    AND r.occurrence_date = p_occurrence_date
    AND r.reminder_kind = COALESCE(NULLIF(btrim(p_reminder_kind), ''), 'day_before')
    AND (
      (r.status = 'pending' AND r.updated_at < now() - interval '10 minutes')
      OR (r.status = 'failed' AND r.attempts < 5)
    )
  RETURNING r.id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_saved_event_reminder(
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
  IF p_status NOT IN ('sent', 'failed', 'skipped_no_tokens') THEN
    RAISE EXCEPTION 'Invalid saved_event_reminder finish status: %', p_status;
  END IF;

  UPDATE public.saved_event_reminder_sent r
  SET
    status = p_status,
    devices_sent = GREATEST(COALESCE(p_devices_sent, 0), 0),
    last_error = NULLIF(btrim(COALESCE(p_last_error, '')), ''),
    sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE r.sent_at END,
    updated_at = now()
  WHERE r.id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_saved_event_reminder(uuid, uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_saved_event_reminder(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Admin campaign audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_campaign_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by_user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  devices_sent integer NOT NULL DEFAULT 0,
  post_id uuid,
  post_type text,
  target_path text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_campaign_sent IS
  'Audit log for send-admin-campaign-push (push-only; no notifications row).';

ALTER TABLE public.admin_campaign_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_campaign_sent_select_reviewer
  ON public.admin_campaign_sent
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.report_reviewers rr
      WHERE rr.user_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.admin_campaign_sent FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.admin_campaign_sent TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Optional cron (COMMENTED ONLY — do not enable until staged deploy complete)
--
-- SELECT cron.schedule(
--   'flush-dm-push-outbox',
--   '*/2 * * * *',
--   $$ SELECT net.http_post(
--     url := '<SUPABASE_URL>/functions/v1/send-dm-push',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
--       'x-internal-push-secret', '<INTERNAL_PUSH_SECRET>'
--     ),
--     body := '{"drain_outbox":true,"limit":25}'::jsonb
--   ); $$
-- );
--
-- SELECT cron.schedule(
--   'saved-event-reminders-daily',
--   '0 16 * * *',
--   $$ SELECT net.http_post(
--     url := '<SUPABASE_URL>/functions/v1/send-saved-event-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
--       'x-internal-push-secret', '<INTERNAL_PUSH_SECRET>'
--     ),
--     body := '{}'::jsonb
--   ); $$
-- );

-- ---------------------------------------------------------------------------
-- FUTURE CLOSEOUT (not implemented — notes only)
-- Reusable in-app action prompt system: post-update/in-app popup with title,
-- message, CTA label, and route (e.g. ask existing users to complete DOB/gender
-- after a new app version ships).
-- ---------------------------------------------------------------------------
