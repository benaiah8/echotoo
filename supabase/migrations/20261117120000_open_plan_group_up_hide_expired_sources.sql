-- Open Plan + Group Up: hide completed one-time dated sources from active
-- discovery / pending-host reads / active Open Plan indicators.
-- Local only — do not apply until explicitly approved.
--
-- Reuses public.post_recurrence_series_is_open (141). Does NOT redefine
-- people_source_is_eligible or touch Duo RPCs / 20261116120000.
-- Does NOT replace list_my_group_up_memberships, accept/decline/withdraw,
-- or messaging RPCs. Undated (no selected_dates) experiences keep
-- opportunity-window behavior via discoverable_until / occurs_at.


-- ---------------------------------------------------------------------------
-- open_plan_source_is_eligible — experience + schedule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_plan_source_is_eligible(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.posts p
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    WHERE p.id = p_post_id
      AND p.type = 'experience'
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND (
        auth.uid() IS NULL
        OR NOT public.users_are_blocked_pair(auth.uid(), p.author_id)
      )
      AND (
        (
          COALESCE(p.is_recurring, false) = true
          AND EXISTS (
            SELECT 1
            FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
            WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
          )
          AND public.post_recurrence_series_is_open(p.recurrence_ends_on)
        )
        OR (
          COALESCE(p.is_recurring, false) = false
          AND (
            NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(
                COALESCE(p.selected_dates, '[]'::jsonb)
              ) AS elem
              WHERE NULLIF(btrim(elem), '') IS NOT NULL
            )
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(
                COALESCE(p.selected_dates, '[]'::jsonb)
              ) AS elem
              WHERE NULLIF(btrim(elem), '') IS NOT NULL
                AND ((btrim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
                  >= (now() AT TIME ZONE 'Africa/Addis_Ababa')::date
            )
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.open_plan_source_is_eligible(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.open_plan_source_is_eligible(uuid) IS
  'Internal Open Plan source gate. Public published experience; can_view + block. One-time dated sources need a future Addis selected_dates day; recurring needs an open recurrence window; undated (empty selected_dates) defers to opportunity discoverable_until/occurs_at.';


-- ---------------------------------------------------------------------------
-- group_up_source_is_eligible — hangout schedule unchanged; experience dated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_up_source_is_eligible(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.posts p
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    WHERE p.id = p_post_id
      AND p.type IN ('hangout', 'experience')
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND (
        auth.uid() IS NULL
        OR NOT public.users_are_blocked_pair(auth.uid(), p.author_id)
      )
      AND (
        (
          p.type = 'hangout'
          AND COALESCE(p.is_recurring, false) = true
          AND EXISTS (
            SELECT 1
            FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
            WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
          )
          AND public.post_recurrence_series_is_open(p.recurrence_ends_on)
        )
        OR (
          p.type = 'hangout'
          AND COALESCE(p.is_recurring, false) = false
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
            WHERE NULLIF(btrim(elem), '') IS NOT NULL
              AND ((btrim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
                >= (now() AT TIME ZONE 'Africa/Addis_Ababa')::date
          )
        )
        OR (
          p.type = 'experience'
          AND (
            (
              COALESCE(p.is_recurring, false) = true
              AND EXISTS (
                SELECT 1
                FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
                WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
              )
              AND public.post_recurrence_series_is_open(p.recurrence_ends_on)
            )
            OR (
              COALESCE(p.is_recurring, false) = false
              AND (
                NOT EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(
                    COALESCE(p.selected_dates, '[]'::jsonb)
                  ) AS elem
                  WHERE NULLIF(btrim(elem), '') IS NOT NULL
                )
                OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(
                    COALESCE(p.selected_dates, '[]'::jsonb)
                  ) AS elem
                  WHERE NULLIF(btrim(elem), '') IS NOT NULL
                    AND ((btrim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
                      >= (now() AT TIME ZONE 'Africa/Addis_Ababa')::date
                )
              )
            )
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.group_up_source_is_eligible(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.group_up_source_is_eligible(uuid) IS
  'Internal Group Up source gate. Hangout: future selected_dates or open recurrence (141). Experience: same dated/undated/recurring rules as Open Plan; undated defers to opportunity window. list_group_up_candidates already calls this.';


-- ---------------------------------------------------------------------------
-- get_my_open_plan_for_source — active indicator requires source still eligible
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
    AND public.open_plan_source_is_eligible(o.source_post_id)
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
  'Caller user-facing active Open Plan for a source. Requires in-window occurs/discoverable_until and open_plan_source_is_eligible so a completed dated experience cannot appear active.';


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
    AND o.occurs_at > now()
    AND public.open_plan_source_is_eligible(o.source_post_id);

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
  'Batch own active in-window Open Plans. Requires open_plan_source_is_eligible. Sparse omitted ids are not joined. c_max_source_ids=100 DoS guardrail.';


-- ---------------------------------------------------------------------------
-- list_open_plan_candidates — discovery uses open_plan_source_is_eligible
-- ---------------------------------------------------------------------------
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
    WHERE o.kind = 'open_plan'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.occurs_at > now()
      AND o.creator_id <> v_me
      AND NOT public.users_are_blocked_pair(v_me, o.creator_id)
      AND public.open_plan_source_is_eligible(o.source_post_id)
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

COMMENT ON FUNCTION public.list_open_plan_candidates(integer, text) IS
  'Open Plans discovery. Active in-window opportunities on open_plan_source_is_eligible experiences. Keyset on occurs_at/created_at/id.';


-- ---------------------------------------------------------------------------
-- list_my_group_up_request_groups — pending host summaries in-window only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_group_up_request_groups(
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
  v_cursor_i uuid;
  v_cursor_v uuid;
  v_cursor_raw text;
  v_cursor_json jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_empty jsonb := jsonb_build_object(
    'groups', '[]'::jsonb,
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
      v_cursor_i := (v_cursor_json ->> 'i')::uuid;
      v_cursor_v := (v_cursor_json ->> 'v')::uuid;
      IF v_cursor_c IS NULL OR v_cursor_i IS NULL OR v_cursor_v IS NULL THEN
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
      r.created_at AS requested_at,
      o.id AS opportunity_id,
      o.conversation_id,
      vs.last_seen_request_at,
      vs.last_seen_request_id
    FROM public.group_up_requests r
    INNER JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    LEFT JOIN public.group_up_request_view_state vs
      ON vs.host_user_id = v_me
     AND vs.conversation_id = o.conversation_id
    WHERE r.status = 'pending'
      AND o.kind = 'group_up'
      AND o.creator_id = v_me
      AND o.status = 'active'
      AND o.conversation_id IS NOT NULL
      AND o.discoverable_until > now()
      AND (o.occurs_at IS NULL OR o.occurs_at > now())
      AND public.group_up_source_is_eligible(o.source_post_id)
      AND NOT public.users_are_blocked_pair(v_me, r.requester_id)
  ),
  agg AS (
    SELECT
      e.conversation_id,
      COUNT(*)::integer AS pending_count,
      COUNT(*) FILTER (
        WHERE e.last_seen_request_at IS NULL
           OR e.requested_at > e.last_seen_request_at
           OR (
             e.requested_at = e.last_seen_request_at
             AND e.request_id > e.last_seen_request_id
           )
      )::integer AS new_count
    FROM eligible e
    GROUP BY e.conversation_id
  ),
  latest AS (
    SELECT DISTINCT ON (e.conversation_id)
      e.conversation_id,
      e.requested_at AS latest_request_at,
      e.request_id AS latest_request_id,
      e.opportunity_id
    FROM eligible e
    ORDER BY e.conversation_id, e.requested_at DESC, e.request_id DESC
  ),
  enriched AS (
    SELECT
      a.conversation_id,
      l.opportunity_id,
      l.latest_request_at,
      l.latest_request_id,
      a.pending_count,
      a.new_count,
      c.title AS group_title,
      o.description,
      o.source_post_id,
      p.type AS source_type,
      o.occurs_at,
      o.occurs_time_explicit
    FROM agg a
    INNER JOIN latest l
      ON l.conversation_id = a.conversation_id
    INNER JOIN public.conversations c
      ON c.id = a.conversation_id
    INNER JOIN public.social_opportunities o
      ON o.id = l.opportunity_id
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
  ),
  paged AS (
    SELECT e.*
    FROM enriched e
    WHERE (
      NOT v_has_cursor
      OR e.latest_request_at < v_cursor_c
      OR (
        e.latest_request_at = v_cursor_c
        AND e.latest_request_id < v_cursor_i
      )
      OR (
        e.latest_request_at = v_cursor_c
        AND e.latest_request_id = v_cursor_i
        AND e.conversation_id < v_cursor_v
      )
    )
    ORDER BY e.latest_request_at DESC, e.latest_request_id DESC, e.conversation_id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'conversation_id', t.conversation_id,
        'opportunity_id', t.opportunity_id,
        'group_title', t.group_title,
        'description', t.description,
        'source_post_id', t.source_post_id,
        'source_type', t.source_type,
        'latest_request_at', t.latest_request_at,
        'latest_request_id', t.latest_request_id,
        'pending_count', t.pending_count,
        'new_count', t.new_count,
        'occurs_at', t.occurs_at,
        'occurs_time_explicit', t.occurs_time_explicit
      )
      ORDER BY t.latest_request_at DESC, t.latest_request_id DESC, t.conversation_id DESC
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
                'c', v_last ->> 'latest_request_at',
                'i', v_last ->> 'latest_request_id',
                'v', v_last ->> 'conversation_id'
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
    'groups', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_group_up_request_groups(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_group_up_request_groups(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_my_group_up_request_groups(integer, text) IS
  'Host Group Up request summaries for in-window eligible opportunities only (discoverable_until, occurs_at null-or-future, group_up_source_is_eligible). Memberships/Yours unchanged.';


-- ---------------------------------------------------------------------------
-- list_my_group_up_requests — flat pending host list mirrors group filters
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_group_up_requests(
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
      o.conversation_id,
      r.created_at AS requested_at,
      r.requester_id AS requester_user_id,
      req_pr.id AS requester_profile_id,
      req_pr.display_name,
      req_pr.username,
      req_pr.avatar_url,
      req_pr.profile_photos,
      req_pr.echo_preset,
      req_pr.bio,
      c.title,
      o.description,
      o.source_post_id,
      p.type AS source_type,
      p.caption AS source_caption,
      o.occurs_at,
      o.occurs_time_explicit,
      o.discoverable_until,
      public._count_active_members(o.conversation_id) AS member_count
    FROM public.group_up_requests r
    INNER JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    INNER JOIN public.conversations c
      ON c.id = o.conversation_id
    INNER JOIN public.profiles req_pr
      ON req_pr.user_id = r.requester_id
     AND req_pr.deleted_at IS NULL
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    WHERE r.status = 'pending'
      AND o.kind = 'group_up'
      AND o.creator_id = v_me
      AND o.status = 'active'
      AND o.conversation_id IS NOT NULL
      AND o.discoverable_until > now()
      AND (o.occurs_at IS NULL OR o.occurs_at > now())
      AND public.group_up_source_is_eligible(o.source_post_id)
      AND NOT public.users_are_blocked_pair(v_me, r.requester_id)
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
        'conversation_id', t.conversation_id,
        'requested_at', t.requested_at,
        'requester_user_id', t.requester_user_id,
        'requester_profile_id', t.requester_profile_id,
        'display_name', t.display_name,
        'username', t.username,
        'avatar_url', t.avatar_url,
        'profile_photos', t.profile_photos,
        'echo_preset', t.echo_preset,
        'bio', t.bio,
        'title', t.title,
        'description', t.description,
        'source_post_id', t.source_post_id,
        'source_type', t.source_type,
        'source_caption', t.source_caption,
        'occurs_at', t.occurs_at,
        'occurs_time_explicit', t.occurs_time_explicit,
        'discoverable_until', t.discoverable_until,
        'member_count', t.member_count
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

REVOKE ALL ON FUNCTION public.list_my_group_up_requests(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_group_up_requests(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_my_group_up_requests(integer, text) IS
  'Host flat pending Group Up requests for in-window eligible opportunities only. Does not affect memberships or accept/decline RPCs.';
