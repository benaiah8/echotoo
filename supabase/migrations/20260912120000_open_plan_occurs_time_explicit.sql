-- Phase 2B.2: Open Plan optional time — occurs_time_explicit
-- LOCAL MIGRATION ONLY. Do not apply to production from agent tools.
--
-- Signature safety:
--   Old: create_open_plan(uuid, timestamptz, text)
--   New: create_open_plan(uuid, timestamptz, text, boolean DEFAULT true)
-- DROP old 3-arg function before CREATE 4-arg to avoid overload ambiguity.

BEGIN;

-- ---------------------------------------------------------------------------
-- Column
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_opportunities
  ADD COLUMN IF NOT EXISTS occurs_time_explicit boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.social_opportunities.occurs_time_explicit IS
  'When false, occurs_at is a date-only intent (stamped at local noon); UI must not show clock time.';

-- ---------------------------------------------------------------------------
-- create_open_plan — DROP old signature then CREATE new
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_open_plan(uuid, timestamptz, text);

CREATE FUNCTION public.create_open_plan(
  p_source_post_id uuid,
  p_occurs_at timestamptz,
  p_description text DEFAULT NULL,
  p_occurs_time_explicit boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_row public.social_opportunities%ROWTYPE;
  v_description text;
  v_until timestamptz;
  v_time_explicit boolean := COALESCE(p_occurs_time_explicit, true);
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_me
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF p_source_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing source post';
  END IF;

  IF p_occurs_at IS NULL THEN
    RAISE EXCEPTION 'Missing occurs_at';
  END IF;

  IF p_occurs_at <= now() THEN
    RAISE EXCEPTION 'occurs_at must be in the future';
  END IF;

  IF NOT public.open_plan_source_is_eligible(p_source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  v_description := NULLIF(btrim(p_description), '');

  -- Reuse user-facing active Open Plan (no silent overwrite).
  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = p_source_post_id
    AND o.kind = 'open_plan'
    AND o.status = 'active'
    AND o.discoverable_until > now()
    AND o.occurs_at > now()
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'opportunity', jsonb_build_object(
        'id', v_row.id,
        'source_post_id', v_row.source_post_id,
        'creator_id', v_row.creator_id,
        'status', v_row.status,
        'description', v_row.description,
        'occurs_at', v_row.occurs_at,
        'occurs_time_explicit', v_row.occurs_time_explicit,
        'discoverable_until', v_row.discoverable_until,
        'created_at', v_row.created_at,
        'closed_at', v_row.closed_at
      )
    );
  END IF;

  -- Expire stale active rows (past window or past meetup) before insert.
  UPDATE public.social_opportunities
  SET status = 'expired',
      closed_at = now()
  WHERE creator_id = v_me
    AND source_post_id = p_source_post_id
    AND kind = 'open_plan'
    AND status = 'active'
    AND (
      discoverable_until <= now()
      OR occurs_at IS NULL
      OR occurs_at <= now()
    );

  v_until := LEAST(now() + interval '14 days', p_occurs_at);

  BEGIN
    INSERT INTO public.social_opportunities (
      kind,
      source_post_id,
      creator_id,
      status,
      description,
      occurs_at,
      occurs_time_explicit,
      discoverable_until
    )
    VALUES (
      'open_plan',
      p_source_post_id,
      v_me,
      'active',
      v_description,
      p_occurs_at,
      v_time_explicit,
      v_until
    )
    RETURNING * INTO v_row;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO v_row
      FROM public.social_opportunities o
      WHERE o.creator_id = v_me
        AND o.source_post_id = p_source_post_id
        AND o.kind = 'open_plan'
        AND o.status = 'active'
        AND o.discoverable_until > now()
        AND o.occurs_at > now()
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE;
      END IF;
  END;

  RETURN jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', v_row.id,
      'source_post_id', v_row.source_post_id,
      'creator_id', v_row.creator_id,
      'status', v_row.status,
      'description', v_row.description,
      'occurs_at', v_row.occurs_at,
      'occurs_time_explicit', v_row.occurs_time_explicit,
      'discoverable_until', v_row.discoverable_until,
      'created_at', v_row.created_at,
      'closed_at', v_row.closed_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_open_plan(uuid, timestamptz, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_open_plan(uuid, timestamptz, text, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.create_open_plan(uuid, timestamptz, text, boolean) IS
  'Create or reuse user-facing active Open Plan. p_occurs_time_explicit DEFAULT true for old clients; false = date-only (local noon stamp). discoverable_until = least(now()+14d, occurs_at).';

-- ---------------------------------------------------------------------------
-- cancel_open_plan — include occurs_time_explicit in payload
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_open_plan(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_row public.social_opportunities%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing opportunity';
  END IF;

  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open Plan not found';
  END IF;

  IF v_row.kind <> 'open_plan' THEN
    RAISE EXCEPTION 'Not an Open Plan';
  END IF;

  IF v_row.creator_id <> v_me THEN
    RAISE EXCEPTION 'Not the Open Plan owner';
  END IF;

  IF v_row.status = 'active' THEN
    UPDATE public.social_opportunities
    SET status = 'closed',
        closed_at = now()
    WHERE id = p_opportunity_id
    RETURNING * INTO v_row;
  END IF;

  UPDATE public.open_plan_requests
  SET status = 'closed',
      resolved_at = COALESCE(resolved_at, now()),
      updated_at = now()
  WHERE opportunity_id = p_opportunity_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', v_row.id,
      'source_post_id', v_row.source_post_id,
      'creator_id', v_row.creator_id,
      'status', v_row.status,
      'description', v_row.description,
      'occurs_at', v_row.occurs_at,
      'occurs_time_explicit', v_row.occurs_time_explicit,
      'discoverable_until', v_row.discoverable_until,
      'created_at', v_row.created_at,
      'closed_at', v_row.closed_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_open_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_open_plan(uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_open_plan(uuid) IS
  'Owner-only cancel: active Open Plan → closed; pending requests → closed. Opportunity then requests.';

-- ---------------------------------------------------------------------------
-- get_my_open_plan_for_source
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_open_plan_for_source(p_source_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_row public.social_opportunities%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('opportunity', NULL);
  END IF;

  IF p_source_post_id IS NULL THEN
    RETURN jsonb_build_object('opportunity', NULL);
  END IF;

  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = p_source_post_id
    AND o.kind = 'open_plan'
    AND o.status = 'active'
    AND o.discoverable_until > now()
    AND o.occurs_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('opportunity', NULL);
  END IF;

  RETURN jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', v_row.id,
      'source_post_id', v_row.source_post_id,
      'creator_id', v_row.creator_id,
      'status', v_row.status,
      'description', v_row.description,
      'occurs_at', v_row.occurs_at,
      'occurs_time_explicit', v_row.occurs_time_explicit,
      'discoverable_until', v_row.discoverable_until,
      'created_at', v_row.created_at,
      'closed_at', v_row.closed_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_open_plan_for_source(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_open_plan_for_source(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_my_open_plan_for_source(uuid) IS
  'Caller user-facing active Open Plan for a source. Does not require source eligibility.';

-- ---------------------------------------------------------------------------
-- get_my_open_plans_for_sources
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_open_plans_for_sources(
  p_source_post_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  c_max_source_ids integer := 100;
  v_ids uuid[];
  v_count integer;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('opportunities', '[]'::jsonb);
  END IF;

  IF p_source_post_ids IS NULL OR COALESCE(cardinality(p_source_post_ids), 0) = 0 THEN
    RETURN jsonb_build_object('opportunities', '[]'::jsonb);
  END IF;

  SELECT ARRAY_AGG(DISTINCT x)
  INTO v_ids
  FROM unnest(p_source_post_ids) AS x
  WHERE x IS NOT NULL;

  v_count := COALESCE(cardinality(v_ids), 0);
  IF v_count = 0 THEN
    RETURN jsonb_build_object('opportunities', '[]'::jsonb);
  END IF;

  IF v_count > c_max_source_ids THEN
    RAISE EXCEPTION 'Too many source ids';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'source_post_id', o.source_post_id,
        'creator_id', o.creator_id,
        'status', o.status,
        'description', o.description,
        'occurs_at', o.occurs_at,
        'occurs_time_explicit', o.occurs_time_explicit,
        'discoverable_until', o.discoverable_until,
        'created_at', o.created_at,
        'closed_at', o.closed_at
      )
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = ANY (v_ids)
    AND o.kind = 'open_plan'
    AND o.status = 'active'
    AND o.discoverable_until > now()
    AND o.occurs_at > now();

  RETURN jsonb_build_object(
    'opportunities', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_open_plans_for_sources(uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_open_plans_for_sources(uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.get_my_open_plans_for_sources(uuid[]) IS
  'Read-only batch of the caller''s own user-facing active Open Plans for the given source post ids. Sparse: omitted ids are not joined. Does not require current source eligibility. No Discover preference. c_max_source_ids=100 is a per-RPC DoS guardrail.';


-- list_open_plan_candidates
CREATE OR REPLACE FUNCTION public.list_open_plan_candidates(
  p_limit integer DEFAULT 20,
  p_cursor text DEFAULT NULL
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
  v_has_cursor boolean := false;
  v_cursor_o timestamptz;
  v_cursor_c timestamptz;
  v_cursor_id uuid;
  v_cursor_raw text;
  v_cursor_json jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_empty jsonb := jsonb_build_object(
    'candidates', '[]'::jsonb,
    'has_more', false,
    'next_cursor', NULL
  );
BEGIN
  IF v_me IS NULL THEN
    RETURN v_empty;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

  IF p_cursor IS NOT NULL AND btrim(p_cursor) <> '' THEN
    BEGIN
      v_cursor_raw := replace(replace(btrim(p_cursor), '-', '+'), '_', '/');
      WHILE length(v_cursor_raw) % 4 <> 0 LOOP
        v_cursor_raw := v_cursor_raw || '=';
      END LOOP;
      v_cursor_json := convert_from(decode(v_cursor_raw, 'base64'), 'UTF8')::jsonb;
      v_cursor_o := (v_cursor_json ->> 'o')::timestamptz;
      v_cursor_c := (v_cursor_json ->> 'c')::timestamptz;
      v_cursor_id := (v_cursor_json ->> 'i')::uuid;
      IF v_cursor_o IS NULL OR v_cursor_c IS NULL OR v_cursor_id IS NULL THEN
        RETURN v_empty;
      END IF;
      v_has_cursor := true;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN v_empty;
    END;
  END IF;

  WITH eligible AS (
    SELECT
      o.id,
      o.source_post_id,
      o.description,
      o.occurs_at,
      o.occurs_time_explicit,
      o.discoverable_until,
      o.created_at,
      pr.avatar_url,
      pr.profile_photos,
      pr.echo_preset,
      pr.bio,
      p.caption AS source_caption,
      p.type AS source_type,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.open_plan_requests pend
          WHERE pend.opportunity_id = o.id
            AND pend.requester_id = v_me
            AND pend.status = 'pending'
        ) THEN 'pending'
        ELSE NULL
      END AS my_request_status
    FROM public.social_opportunities o
    INNER JOIN public.profiles pr
      ON pr.user_id = o.creator_id
     AND pr.deleted_at IS NULL
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    WHERE o.kind = 'open_plan'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.occurs_at > now()
      AND o.creator_id <> v_me
      AND NOT public.users_are_blocked_pair(v_me, o.creator_id)
      AND p.type = 'experience'
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND NOT public.users_are_blocked_pair(v_me, p.author_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.open_plan_requests acc
        WHERE acc.opportunity_id = o.id
          AND acc.requester_id = v_me
          AND acc.status = 'accepted'
      )
  ),
  paged AS (
    SELECT e.*
    FROM eligible e
    WHERE (
      NOT v_has_cursor
      OR e.occurs_at > v_cursor_o
      OR (
        e.occurs_at = v_cursor_o
        AND e.created_at < v_cursor_c
      )
      OR (
        e.occurs_at = v_cursor_o
        AND e.created_at = v_cursor_c
        AND e.id < v_cursor_id
      )
    )
    ORDER BY e.occurs_at ASC, e.created_at DESC, e.id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'opportunity_id', t.id,
        'source_post_id', t.source_post_id,
        'description', t.description,
        'occurs_at', t.occurs_at,
        'occurs_time_explicit', t.occurs_time_explicit,
        'discoverable_until', t.discoverable_until,
        'created_at', t.created_at,
        'avatar_url', t.avatar_url,
        'profile_photos', t.profile_photos,
        'echo_preset', t.echo_preset,
        'bio', t.bio,
        'source_caption', t.source_caption,
        'source_type', t.source_type,
        'my_request_status', t.my_request_status
      )
      ORDER BY t.occurs_at ASC, t.created_at DESC, t.id DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM paged t;

  IF jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit THEN
    v_has_more := true;
    SELECT jsonb_agg(elem ORDER BY ordinality)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(elem, ordinality)
    WHERE ordinality <= v_limit;
  END IF;

  IF v_has_more AND jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > 0 THEN
    v_last := v_rows -> -1;
    v_next_cursor := replace(
      replace(
        rtrim(
          encode(
            convert_to(
              jsonb_build_object(
                'o', v_last ->> 'occurs_at',
                'c', v_last ->> 'created_at',
                'i', v_last ->> 'opportunity_id'
              )::text,
              'UTF8'
            ),
            'base64'
          ),
          '='
        ),
        '+',
        '-'
      ),
      '/',
      '_'
    );
  END IF;

  RETURN jsonb_build_object(
    'candidates', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_open_plan_candidates(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_open_plan_candidates(integer, text)
  TO authenticated;

-- list_my_open_plan_requests
CREATE OR REPLACE FUNCTION public.list_my_open_plan_requests(
  p_limit integer DEFAULT 20,
  p_cursor text DEFAULT NULL
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
  v_has_cursor boolean := false;
  v_cursor_c timestamptz;
  v_cursor_id uuid;
  v_cursor_raw text;
  v_cursor_json jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_empty jsonb := jsonb_build_object(
    'requests', '[]'::jsonb,
    'has_more', false,
    'next_cursor', NULL
  );
BEGIN
  IF v_me IS NULL THEN
    RETURN v_empty;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

  IF p_cursor IS NOT NULL AND btrim(p_cursor) <> '' THEN
    BEGIN
      v_cursor_raw := replace(replace(btrim(p_cursor), '-', '+'), '_', '/');
      WHILE length(v_cursor_raw) % 4 <> 0 LOOP
        v_cursor_raw := v_cursor_raw || '=';
      END LOOP;
      v_cursor_json := convert_from(decode(v_cursor_raw, 'base64'), 'UTF8')::jsonb;
      v_cursor_c := (v_cursor_json ->> 'c')::timestamptz;
      v_cursor_id := (v_cursor_json ->> 'i')::uuid;
      IF v_cursor_c IS NULL OR v_cursor_id IS NULL THEN
        RETURN v_empty;
      END IF;
      v_has_cursor := true;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN v_empty;
    END;
  END IF;

  WITH eligible AS (
    SELECT
      r.id AS request_id,
      r.opportunity_id,
      r.created_at AS requested_at,
      req_pr.avatar_url,
      req_pr.profile_photos,
      req_pr.echo_preset,
      req_pr.bio,
      o.source_post_id,
      p.caption AS source_caption,
      p.type AS source_type,
      o.description AS plan_description,
      o.occurs_at,
      o.occurs_time_explicit,
      o.discoverable_until
    FROM public.open_plan_requests r
    INNER JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    INNER JOIN public.profiles req_pr
      ON req_pr.user_id = r.requester_id
     AND req_pr.deleted_at IS NULL
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    WHERE r.status = 'pending'
      AND o.kind = 'open_plan'
      AND o.creator_id = v_me
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.occurs_at > now()
      AND NOT public.users_are_blocked_pair(v_me, r.requester_id)
      AND public.open_plan_source_is_eligible(o.source_post_id)
  ),
  paged AS (
    SELECT e.*
    FROM eligible e
    WHERE (
      NOT v_has_cursor
      OR e.requested_at < v_cursor_c
      OR (
        e.requested_at = v_cursor_c
        AND e.request_id < v_cursor_id
      )
    )
    ORDER BY e.requested_at DESC, e.request_id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'request_id', t.request_id,
        'opportunity_id', t.opportunity_id,
        'requested_at', t.requested_at,
        'avatar_url', t.avatar_url,
        'profile_photos', t.profile_photos,
        'echo_preset', t.echo_preset,
        'bio', t.bio,
        'source_post_id', t.source_post_id,
        'source_caption', t.source_caption,
        'source_type', t.source_type,
        'plan_description', t.plan_description,
        'occurs_at', t.occurs_at,
        'occurs_time_explicit', t.occurs_time_explicit,
        'discoverable_until', t.discoverable_until
      )
      ORDER BY t.requested_at DESC, t.request_id DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM paged t;

  IF jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit THEN
    v_has_more := true;
    SELECT jsonb_agg(elem ORDER BY ordinality)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(elem, ordinality)
    WHERE ordinality <= v_limit;
  END IF;

  IF v_has_more AND jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > 0 THEN
    v_last := v_rows -> -1;
    v_next_cursor := replace(
      replace(
        rtrim(
          encode(
            convert_to(
              jsonb_build_object(
                'c', v_last ->> 'requested_at',
                'i', v_last ->> 'request_id'
              )::text,
              'UTF8'
            ),
            'base64'
          ),
          '='
        ),
        '+',
        '-'
      ),
      '/',
      '_'
    );
  END IF;

  RETURN jsonb_build_object(
    'requests', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_open_plan_requests(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_open_plan_requests(integer, text)
  TO authenticated;

COMMIT;
