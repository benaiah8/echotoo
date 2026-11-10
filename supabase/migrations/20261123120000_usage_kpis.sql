-- LOCAL ONLY — do not apply to production until explicitly approved.
-- Phase 1 usage KPIs. Aggregate rows only. No raw event log.
-- Does not alter product tables, product functions, or triggers.
--
-- Ingest is authenticated-only and attributes rows with auth.uid().
-- Reporting uses public.is_report_reviewer() with no arguments.
-- Production's helper is zero-arg. Do not call is_report_reviewer(uuid).
--
-- Dedupe overhead (no per-ingest cleanup):
-- usage_ingest_dedupe stores one row per accepted event, keyed by
-- (auth.uid(), dedupe_id). A retry of the same id does not increment
-- counts, including after UTC midnight. Each call also takes a
-- transaction advisory lock for that user, then at most 20 primary-key
-- lookups and 20 index counts. Each count touches at most 50 rows
-- (the daily cap). This function never DELETEs. Rollup, actor, and
-- dedupe rows accumulate until a later retention job.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.usage_daily (
  day date NOT NULL,
  metric text NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric),
  CONSTRAINT usage_daily_event_count_check CHECK (event_count >= 0),
  CONSTRAINT usage_daily_metric_check CHECK (
    metric = ANY (ARRAY[
      'app_active'::text,
      'people_visit'::text,
      'tab_discover'::text,
      'tab_duo'::text,
      'tab_plans'::text,
      'tab_groups'::text,
      'duo_express'::text,
      'duo_withdraw'::text,
      'duo_complete'::text,
      'post_detail_open'::text,
      'profile_view'::text,
      'post_save'::text,
      'post_unsave'::text
    ])
  )
);

CREATE TABLE public.usage_daily_actors (
  day date NOT NULL,
  metric text NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (day, metric, user_id),
  CONSTRAINT usage_daily_actors_metric_check CHECK (
    metric = ANY (ARRAY[
      'app_active'::text,
      'people_visit'::text,
      'tab_discover'::text,
      'tab_duo'::text,
      'tab_plans'::text,
      'tab_groups'::text,
      'duo_express'::text,
      'duo_withdraw'::text,
      'duo_complete'::text,
      'post_detail_open'::text,
      'profile_view'::text,
      'post_save'::text,
      'post_unsave'::text
    ])
  )
);

CREATE INDEX usage_daily_actors_metric_day_user_idx
  ON public.usage_daily_actors (metric, day, user_id);

COMMENT ON TABLE public.usage_daily IS
  'UTC-day event totals by allowlisted metric. No subject ids. Writes only via record_usage_events.';

COMMENT ON TABLE public.usage_daily_actors IS
  'One row per actor, UTC day, and metric. user_id is for distinct counts inside get_usage_kpis and is never returned. No FK.';

COMMENT ON COLUMN public.usage_daily_actors.user_id IS
  'auth.uid() at acceptance. Not client-supplied. No FK. Absent from get_usage_kpis output.';

-- Accepted-event idempotency keys. Not a raw event log: no route, post, or profile.
CREATE TABLE public.usage_ingest_dedupe (
  user_id uuid NOT NULL,
  dedupe_id uuid NOT NULL,
  day date NOT NULL,
  metric text NOT NULL,
  PRIMARY KEY (user_id, dedupe_id),
  CONSTRAINT usage_ingest_dedupe_metric_check CHECK (
    metric = ANY (ARRAY[
      'app_active'::text,
      'people_visit'::text,
      'tab_discover'::text,
      'tab_duo'::text,
      'tab_plans'::text,
      'tab_groups'::text,
      'duo_express'::text,
      'duo_withdraw'::text,
      'duo_complete'::text,
      'post_detail_open'::text,
      'profile_view'::text,
      'post_save'::text,
      'post_unsave'::text
    ])
  )
);

CREATE INDEX usage_ingest_dedupe_user_metric_day_idx
  ON public.usage_ingest_dedupe (user_id, metric, day);

COMMENT ON TABLE public.usage_ingest_dedupe IS
  'Idempotency keys for record_usage_events. One row per accepted (user, dedupe_id). Daily cap counts this index (max 50). No DELETE in the ingest function; rows accumulate.';

-- ---------------------------------------------------------------------------
-- Privileges: no direct client access
-- ---------------------------------------------------------------------------
ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_ingest_dedupe ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.usage_daily FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.usage_daily_actors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.usage_ingest_dedupe FROM PUBLIC, anon, authenticated;

-- No SELECT/INSERT policies. Reviewers read aggregates through get_usage_kpis.

-- ---------------------------------------------------------------------------
-- record_usage_events
-- Payload is a JSON array of at most 20 objects: {metric, dedupe_id}.
-- Any other key is rejected. Day bucket is server UTC today.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_usage_events(p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  c_max_batch integer := 20;
  c_daily_cap integer := 50;
  v_uid uuid := auth.uid();
  v_day date;
  v_row record;
  v_elem jsonb;
  v_metric text;
  v_dedupe uuid;
  v_today_count integer;
  v_accepted integer := 0;
  v_deduped integer := 0;
  v_capped integer := 0;
  v_rejected integer := 0;
  v_allowed text[] := ARRAY[
    'app_active',
    'people_visit',
    'tab_discover',
    'tab_duo',
    'tab_plans',
    'tab_groups',
    'duo_express',
    'duo_withdraw',
    'duo_complete',
    'post_detail_open',
    'profile_view',
    'post_save',
    'post_unsave'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  IF jsonb_array_length(p_events) > c_max_batch THEN
    RAISE EXCEPTION 'Too many events';
  END IF;

  IF jsonb_array_length(p_events) = 0 THEN
    RETURN jsonb_build_object(
      'accepted', 0,
      'deduped', 0,
      'capped', 0,
      'rejected', 0
    );
  END IF;

  -- Serialize this user's ingest so the daily cap check and insert agree.
  PERFORM pg_advisory_xact_lock(hashtext('usage_kpis'), hashtext(v_uid::text));

  v_day := (timezone('utc', now()))::date;

  FOR v_row IN
    SELECT e.value AS event
    FROM jsonb_array_elements(p_events) AS e(value)
  LOOP
    v_elem := v_row.event;

    IF jsonb_typeof(v_elem) IS DISTINCT FROM 'object' THEN
      v_rejected := v_rejected + 1;
      CONTINUE;
    END IF;

    -- Reject identifiers and any key other than metric + dedupe_id.
    -- Those keys are not columns and are not stored.
    IF EXISTS (
      SELECT 1
      FROM jsonb_object_keys(v_elem) AS k(key)
      WHERE k.key NOT IN ('metric', 'dedupe_id')
    ) THEN
      v_rejected := v_rejected + 1;
      CONTINUE;
    END IF;

    v_metric := btrim(COALESCE(v_elem->>'metric', ''));
    IF v_metric <> ALL (v_allowed) THEN
      v_rejected := v_rejected + 1;
      CONTINUE;
    END IF;

    IF NULLIF(btrim(COALESCE(v_elem->>'dedupe_id', '')), '') IS NULL THEN
      v_rejected := v_rejected + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_dedupe := btrim(v_elem->>'dedupe_id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_rejected := v_rejected + 1;
        CONTINUE;
    END;

    IF EXISTS (
      SELECT 1
      FROM public.usage_ingest_dedupe d
      WHERE d.user_id = v_uid
        AND d.dedupe_id = v_dedupe
    ) THEN
      v_deduped := v_deduped + 1;
      CONTINUE;
    END IF;

    SELECT count(*)::integer
    INTO v_today_count
    FROM public.usage_ingest_dedupe d
    WHERE d.user_id = v_uid
      AND d.metric = v_metric
      AND d.day = v_day;

    IF v_today_count >= c_daily_cap THEN
      v_capped := v_capped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.usage_ingest_dedupe (user_id, dedupe_id, day, metric)
    VALUES (v_uid, v_dedupe, v_day, v_metric);

    INSERT INTO public.usage_daily (day, metric, event_count)
    VALUES (v_day, v_metric, 1)
    ON CONFLICT (day, metric) DO UPDATE
    SET event_count = public.usage_daily.event_count + 1;

    INSERT INTO public.usage_daily_actors (day, metric, user_id)
    VALUES (v_day, v_metric, v_uid)
    ON CONFLICT (day, metric, user_id) DO NOTHING;

    v_accepted := v_accepted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'accepted', v_accepted,
    'deduped', v_deduped,
    'capped', v_capped,
    'rejected', v_rejected
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_usage_events(jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_usage_events(jsonb) TO authenticated;

COMMENT ON FUNCTION public.record_usage_events(jsonb) IS
  'Authenticated batch ingest. auth.uid() only. Max 20 objects of {metric, dedupe_id}. Cap 50 accepted events per user per metric per UTC day. Same dedupe_id is a no-op. Does not delete old rows. Returns counts only.';

-- ---------------------------------------------------------------------------
-- get_usage_kpis — reviewer aggregates, no identifiers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_usage_kpis(p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_today date;
  v_start date;
  v_from timestamptz;
  v_to timestamptz;
  v_metric text;
  v_events bigint;
  v_actors bigint;
  v_usage jsonb := '{}'::jsonb;
  v_comments bigint;
  v_open_plans bigint;
  v_group_ups bigint;
  v_duo_joins bigint;
  v_saves bigint;
  v_metrics text[] := ARRAY[
    'app_active',
    'people_visit',
    'tab_discover',
    'tab_duo',
    'tab_plans',
    'tab_groups',
    'duo_express',
    'duo_withdraw',
    'duo_complete',
    'post_detail_open',
    'profile_view',
    'post_save',
    'post_unsave'
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_report_reviewer() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_days IS NULL OR p_days NOT IN (1, 7, 30) THEN
    RAISE EXCEPTION 'Invalid window';
  END IF;

  -- Admin-only read. A slow product count fails this call; it does not touch writes.
  PERFORM set_config('statement_timeout', '5000', true);

  v_today := (timezone('utc', now()))::date;
  v_start := v_today - (p_days - 1);
  v_from := v_start::timestamp AT TIME ZONE 'utc';
  v_to := (v_today + 1)::timestamp AT TIME ZONE 'utc';

  FOREACH v_metric IN ARRAY v_metrics LOOP
    SELECT COALESCE(sum(d.event_count), 0)::bigint
    INTO v_events
    FROM public.usage_daily d
    WHERE d.metric = v_metric
      AND d.day >= v_start
      AND d.day <= v_today;

    SELECT count(DISTINCT a.user_id)::bigint
    INTO v_actors
    FROM public.usage_daily_actors a
    WHERE a.metric = v_metric
      AND a.day >= v_start
      AND a.day <= v_today;

    v_usage := v_usage || jsonb_build_object(
      v_metric,
      jsonb_build_object(
        'events', v_events,
        'actors', v_actors
      )
    );
  END LOOP;

  -- Existing product rows. Counts only. Soft-deleted comments stay in the total.
  SELECT count(*)::bigint
  INTO v_comments
  FROM public.comments c
  WHERE c.created_at >= v_from
    AND c.created_at < v_to;

  SELECT count(*)::bigint
  INTO v_open_plans
  FROM public.open_plan_requests r
  WHERE r.created_at >= v_from
    AND r.created_at < v_to;

  SELECT count(*)::bigint
  INTO v_group_ups
  FROM public.group_up_requests r
  WHERE r.created_at >= v_from
    AND r.created_at < v_to;

  SELECT count(*)::bigint
  INTO v_duo_joins
  FROM public.social_opportunities o
  WHERE o.kind = 'pair_up'
    AND o.created_at >= v_from
    AND o.created_at < v_to;

  -- Rows still present. An unsave deletes the row, so this is not a save-action log.
  SELECT count(*)::bigint
  INTO v_saves
  FROM public.saved_posts s
  WHERE s.created_at >= v_from
    AND s.created_at < v_to;

  RETURN jsonb_build_object(
    'window_days', p_days,
    'usage', v_usage,
    'product', jsonb_build_object(
      'comments_created', v_comments,
      'open_plan_requests_created', v_open_plans,
      'group_up_requests_created', v_group_ups,
      'duo_joins_created', v_duo_joins,
      'current_saves_created', v_saves
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_usage_kpis(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_usage_kpis(integer) TO authenticated;

COMMENT ON FUNCTION public.get_usage_kpis(integer) IS
  'Reviewer-only KPI totals for 1, 7, or 30 UTC days. is_report_reviewer() with no arguments. Returns counts only — no user, post, or profile ids. Client usage metrics are zero until events are ingested.';
