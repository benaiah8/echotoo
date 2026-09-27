-- Open Plan request groups: one summary per opportunity_id + lazy anonymous requesters.
-- Local successor only — do not apply to production without explicit approval.
--
-- Filename: supabase migration new emitted 20260918184029, which would sort
-- before local 20261008120000 and between production
-- 20260918182314 (group_up_request_groups_occurs_at) and
-- 20260924120000 (feed_profile_published_media_manifest). Kept as
-- 20261009120000, after the latest local file. Do not rename or reapply
-- historical migrations. Does not replace list_my_open_plan_requests or
-- accept_open_plan_request.
--
-- Grouping key is opportunity_id, never source_post_id.
-- pending_count is a server COUNT over all eligible pending rows for that
-- opportunity, not a page-length or client-side requester fetch.
-- No new_count / unread watermark in v1.
-- Summary avatar previews are at most two anonymous presentation objects
-- for the current page only (LATERAL LIMIT 2). No per-card profile RPC.

-- ---------------------------------------------------------------------------
-- Index: pending newest-first within one opportunity (groups + requesters)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS open_plan_requests_pending_opportunity_created_id_idx
  ON public.open_plan_requests (opportunity_id, created_at DESC, id DESC)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- list_my_open_plan_request_groups — one summary row per opportunity_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_open_plan_request_groups(
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
      r.requester_id,
      o.id AS opportunity_id
    FROM public.open_plan_requests r
    INNER JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    WHERE r.status = 'pending'
      AND o.kind = 'open_plan'
      AND o.creator_id = v_me
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.occurs_at > now()
      AND NOT public.users_are_blocked_pair(v_me, r.requester_id)
      AND public.open_plan_source_is_eligible(o.source_post_id)
      AND EXISTS (
        SELECT 1
        FROM public.profiles req_pr
        WHERE req_pr.user_id = r.requester_id
          AND req_pr.deleted_at IS NULL
      )
  ),
  agg AS (
    SELECT
      e.opportunity_id,
      COUNT(*)::integer AS pending_count
    FROM eligible e
    GROUP BY e.opportunity_id
  ),
  latest AS (
    SELECT DISTINCT ON (e.opportunity_id)
      e.opportunity_id,
      e.requested_at AS latest_request_at,
      e.request_id AS latest_request_id
    FROM eligible e
    ORDER BY e.opportunity_id, e.requested_at DESC, e.request_id DESC
  ),
  enriched AS (
    SELECT
      a.opportunity_id,
      o.source_post_id,
      o.description AS plan_description,
      p.caption AS source_caption,
      o.occurs_at,
      o.occurs_time_explicit,
      l.latest_request_at,
      l.latest_request_id,
      a.pending_count
    FROM agg a
    INNER JOIN latest l
      ON l.opportunity_id = a.opportunity_id
    INNER JOIN public.social_opportunities o
      ON o.id = a.opportunity_id
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
        AND e.opportunity_id < v_cursor_v
      )
    )
    ORDER BY e.latest_request_at DESC, e.latest_request_id DESC, e.opportunity_id DESC
    LIMIT (v_limit + 1)
  ),
  with_previews AS (
    SELECT
      p.opportunity_id,
      p.source_post_id,
      p.plan_description,
      p.source_caption,
      p.occurs_at,
      p.occurs_time_explicit,
      p.latest_request_at,
      p.latest_request_id,
      p.pending_count,
      COALESCE(pr.preview_requesters, '[]'::jsonb) AS preview_requesters
    FROM paged p
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'avatar_url', s.avatar_url,
          'profile_photos', s.profile_photos,
          'echo_preset', s.echo_preset
        )
        ORDER BY s.requested_at DESC, s.request_id DESC
      ) AS preview_requesters
      FROM (
        SELECT
          e.requested_at,
          e.request_id,
          req_pr.avatar_url,
          req_pr.profile_photos,
          req_pr.echo_preset
        FROM eligible e
        INNER JOIN public.profiles req_pr
          ON req_pr.user_id = e.requester_id
         AND req_pr.deleted_at IS NULL
        WHERE e.opportunity_id = p.opportunity_id
        ORDER BY e.requested_at DESC, e.request_id DESC
        LIMIT 2
      ) s
    ) pr ON true
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'opportunity_id', t.opportunity_id,
        'source_post_id', t.source_post_id,
        'plan_description', t.plan_description,
        'source_caption', t.source_caption,
        'occurs_at', t.occurs_at,
        'occurs_time_explicit', t.occurs_time_explicit,
        'pending_count', t.pending_count,
        'latest_request_at', t.latest_request_at,
        'latest_request_id', t.latest_request_id,
        'preview_requesters', t.preview_requesters
      )
      ORDER BY t.latest_request_at DESC, t.latest_request_id DESC, t.opportunity_id DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM with_previews t;

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
                'v', v_last ->> 'opportunity_id'
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

REVOKE ALL ON FUNCTION public.list_my_open_plan_request_groups(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_open_plan_request_groups(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_my_open_plan_request_groups(integer, text) IS
  'Host Open Plan request summaries: one row per opportunity_id with server pending_count and up to two anonymous avatar previews. Keyset on latest_request_at/id/opportunity_id. No unread watermark.';

-- ---------------------------------------------------------------------------
-- list_open_plan_requesters — lazy pending anonymous requesters for one plan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_open_plan_requesters(
  p_opportunity_id uuid,
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

  IF p_opportunity_id IS NULL THEN
    RETURN v_empty;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.social_opportunities o
    WHERE o.kind = 'open_plan'
      AND o.creator_id = v_me
      AND o.id = p_opportunity_id
  ) THEN
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
      r.created_at AS requested_at,
      req_pr.avatar_url,
      req_pr.profile_photos,
      req_pr.echo_preset,
      req_pr.bio
    FROM public.open_plan_requests r
    INNER JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    INNER JOIN public.profiles req_pr
      ON req_pr.user_id = r.requester_id
     AND req_pr.deleted_at IS NULL
    WHERE r.status = 'pending'
      AND o.kind = 'open_plan'
      AND o.creator_id = v_me
      AND o.id = p_opportunity_id
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
        'requested_at', t.requested_at,
        'avatar_url', t.avatar_url,
        'profile_photos', t.profile_photos,
        'echo_preset', t.echo_preset,
        'bio', t.bio
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

REVOKE ALL ON FUNCTION public.list_open_plan_requesters(uuid, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_open_plan_requesters(uuid, integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_open_plan_requesters(uuid, integer, text) IS
  'Host lazy pending Open Plan requesters for one opportunity. Anonymous presentation only. Keyset on requested_at/request_id. Accept remains request_id via accept_open_plan_request.';
