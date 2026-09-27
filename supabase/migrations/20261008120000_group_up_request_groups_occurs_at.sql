-- Group Up request summaries: include opportunity schedule on the G4 payload.
-- Local successor of list_my_group_up_request_groups — do not apply to production
-- without explicit approval.
--
-- Base: 20260917120000_group_up_g4_request_groups.sql (production-recorded as
-- group_up_g4_request_groups). No later local or recorded migration replaces this
-- function. Signature, security, filters, pagination, and counts are unchanged.
-- Payload only adds occurs_at + occurs_time_explicit from social_opportunities.

-- ---------------------------------------------------------------------------
-- list_my_group_up_request_groups — one summary row per conversation_id
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
  'Host Group Up request summaries: one row per conversation_id with pending_count/new_count vs composite watermark, plus opportunity occurs_at/occurs_time_explicit. Keyset on latest_request_at/id/conversation_id.';
