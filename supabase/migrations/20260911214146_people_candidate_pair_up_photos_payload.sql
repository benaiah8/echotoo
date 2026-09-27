-- People candidate photo payload for Mine + Discover Pair Up list RPCs.
-- Narrow production apply: adds profiles.profile_photos + echo_preset to JSON.
-- Skips Open Plan RPCs: live already has photo fields AND occurs_time_explicit
-- (held 20260911120000 Open Plan bodies would regress occurs_time_explicit).
-- Preserves Addis full-day Discover eligibility and Mine ranking/pagination.
CREATE OR REPLACE FUNCTION public.list_pair_up_candidates(
  p_source_post_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  c_max_caller_sources integer := 500;
  v_limit integer;
  v_offset integer;
  v_per_source integer;
  v_source_count integer;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('candidates', '[]'::jsonb, 'has_more', false);
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

  -- Offset > 200 is a pagination/DoS guardrail, not product behavior and not a silent clamp.
  IF COALESCE(p_offset, 0) > 200 THEN
    RETURN jsonb_build_object('candidates', '[]'::jsonb, 'has_more', false);
  END IF;

  v_offset := GREATEST(COALESCE(p_offset, 0), 0);
  v_per_source := v_offset + v_limit + 1;

  SELECT COUNT(*)::integer
  INTO v_source_count
  FROM (
    SELECT DISTINCT o.source_post_id
    FROM public.social_opportunities o
    WHERE o.creator_id = v_me
      AND o.kind = 'pair_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND public.people_source_is_eligible(o.source_post_id)
      AND (p_source_post_id IS NULL OR o.source_post_id = p_source_post_id)
  ) s;

  IF v_source_count > c_max_caller_sources THEN
    RAISE EXCEPTION 'Too many active Pair Ups';
  END IF;

  IF v_source_count = 0 THEN
    RETURN jsonb_build_object('candidates', '[]'::jsonb, 'has_more', false);
  END IF;

  WITH my_opps AS (
    SELECT o.id, o.source_post_id
    FROM public.social_opportunities o
    WHERE o.creator_id = v_me
      AND o.kind = 'pair_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND public.people_source_is_eligible(o.source_post_id)
      AND (p_source_post_id IS NULL OR o.source_post_id = p_source_post_id)
  ),
  my_sources AS (
    SELECT DISTINCT source_post_id FROM my_opps
  ),
  sourced AS (
    SELECT c.id, c.source_post_id, c.creator_id, c.description,
           c.discoverable_until, c.created_at
    FROM my_sources s
    CROSS JOIN LATERAL (
      SELECT o.id, o.source_post_id, o.creator_id, o.description,
             o.discoverable_until, o.created_at
      FROM public.social_opportunities o
      INNER JOIN public.profiles pr
        ON pr.user_id = o.creator_id
       AND pr.deleted_at IS NULL
      WHERE o.source_post_id = s.source_post_id
        AND o.kind = 'pair_up'
        AND o.status = 'active'
        AND o.discoverable_until > now()
        AND o.creator_id <> v_me
        AND NOT public.users_are_blocked_pair(v_me, o.creator_id)
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT v_per_source
    ) c
  ),
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (
        PARTITION BY s.source_post_id
        ORDER BY s.created_at DESC, s.id DESC
      ) AS src_rn
    FROM sourced s
  ),
  mixed AS (
    SELECT *
    FROM ranked
    ORDER BY src_rn ASC, created_at DESC, id DESC
    OFFSET v_offset
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.src_rn ASC, t.created_at DESC, t.opportunity_id DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      m.id AS opportunity_id,
      m.source_post_id,
      m.creator_id,
      m.description,
      m.discoverable_until,
      m.created_at,
      pr.id AS profile_id,
      pr.display_name,
      pr.username,
      pr.avatar_url,
      pr.profile_photos,
      pr.echo_preset,
      pr.bio,
      p.caption AS source_caption,
      p.type AS source_type,
      p.created_at AS source_created_at,
      p.selected_dates AS source_selected_dates,
      p.is_recurring AS source_is_recurring,
      p.recurrence_days AS source_recurrence_days,
      EXISTS (
        SELECT 1
        FROM public.social_opportunity_interests i
        INNER JOIN my_opps mo
          ON mo.id = i.from_opportunity_id
         AND mo.source_post_id = m.source_post_id
        WHERE i.to_opportunity_id = m.id
      ) AS expressed_by_me,
      m.src_rn
    FROM mixed m
    INNER JOIN public.profiles pr
      ON pr.user_id = m.creator_id
     AND pr.deleted_at IS NULL
    INNER JOIN public.posts p
      ON p.id = m.source_post_id
  ) t;

  IF jsonb_array_length(v_rows) > v_limit THEN
    v_has_more := true;
    SELECT jsonb_agg(elem ORDER BY ordinality)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(elem, ordinality)
    WHERE ordinality <= v_limit;
  END IF;

  SELECT COALESCE(
    jsonb_agg(elem - 'src_rn' ORDER BY ordinality),
    '[]'::jsonb
  )
  INTO v_rows
  FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb))
    WITH ORDINALITY AS x(elem, ordinality);

  RETURN jsonb_build_object(
    'candidates', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer) IS
  'Mixed Pair Up deck across all of the caller''s eligible in-window sources. Optional p_source_post_id scopes to one source. Returns lightweight candidate identity plus source caption/schedule fields for Match Deck. No free peek. c_max_caller_sources=500 is a DoS guardrail.';

CREATE OR REPLACE FUNCTION public.list_discover_pair_up_candidates(
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
  v_discover boolean;
  v_limit integer;
  v_has_cursor boolean := false;
  v_cursor_b integer;
  v_cursor_t timestamptz;
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

  SELECT pr.p2p_discover_enabled
  INTO v_discover
  FROM public.profiles pr
  WHERE pr.user_id = v_me
    AND pr.deleted_at IS NULL;

  IF NOT FOUND OR v_discover IS NOT TRUE THEN
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
      v_cursor_b := (v_cursor_json ->> 'b')::integer;
      v_cursor_t := (v_cursor_json ->> 't')::timestamptz;
      v_cursor_id := (v_cursor_json ->> 'i')::uuid;
      IF v_cursor_b IS NULL OR v_cursor_b NOT IN (0, 1)
         OR v_cursor_t IS NULL
         OR v_cursor_id IS NULL THEN
        RETURN v_empty;
      END IF;
      v_has_cursor := true;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN v_empty;
    END;
  END IF;

  WITH inbound_creators AS (
    SELECT DISTINCT from_opp.creator_id
    FROM public.social_opportunity_interests i
    INNER JOIN public.social_opportunities from_opp
      ON from_opp.id = i.from_opportunity_id
    INNER JOIN public.social_opportunities to_opp
      ON to_opp.id = i.to_opportunity_id
    WHERE to_opp.creator_id = v_me
      AND from_opp.kind = 'pair_up'
      AND from_opp.status = 'active'
      AND from_opp.discoverable_until > now()
      AND to_opp.kind = 'pair_up'
      AND to_opp.status = 'active'
      AND to_opp.discoverable_until > now()
  ),
  eligible AS (
    SELECT
      o.id,
      o.source_post_id,
      o.creator_id,
      o.description,
      o.discoverable_until,
      o.created_at,
      CASE WHEN ic.creator_id IS NOT NULL THEN 1 ELSE 0 END AS interested
    FROM public.social_opportunities o
    INNER JOIN public.profiles pr
      ON pr.user_id = o.creator_id
     AND pr.deleted_at IS NULL
     AND pr.p2p_discover_enabled = true
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    LEFT JOIN inbound_creators ic
      ON ic.creator_id = o.creator_id
    WHERE o.kind = 'pair_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.creator_id <> v_me
      AND NOT EXISTS (
        SELECT 1
        FROM public.social_opportunities mine
        WHERE mine.creator_id = v_me
          AND mine.source_post_id = o.source_post_id
          AND mine.kind = 'pair_up'
          AND mine.status = 'active'
      )
      AND NOT public.users_are_blocked_pair(v_me, o.creator_id)
      AND p.type = 'hangout'
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND NOT public.users_are_blocked_pair(v_me, p.author_id)
      AND (
        (
          COALESCE(p.is_recurring, false) = true
          AND EXISTS (
            SELECT 1
            FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
            WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
          )
        )
        OR (
          COALESCE(p.is_recurring, false) = false
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
            WHERE NULLIF(btrim(elem), '') IS NOT NULL
              AND ((btrim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
                >= (now() AT TIME ZONE 'Africa/Addis_Ababa')::date
          )
        )
      )
  ),
  paged AS (
    SELECT u.*
    FROM (
      (
        SELECT
          e.id,
          e.source_post_id,
          e.creator_id,
          e.description,
          e.discoverable_until,
          e.created_at,
          e.interested
        FROM eligible e
        WHERE e.interested = 1
          AND (NOT v_has_cursor OR v_cursor_b = 1)
          AND (
            NOT v_has_cursor
            OR v_cursor_b <> 1
            OR e.created_at < v_cursor_t
            OR (e.created_at = v_cursor_t AND e.id < v_cursor_id)
          )
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT (v_limit + 1)
      )
      UNION ALL
      (
        SELECT
          e.id,
          e.source_post_id,
          e.creator_id,
          e.description,
          e.discoverable_until,
          e.created_at,
          e.interested
        FROM eligible e
        WHERE e.interested = 0
          AND (
            NOT v_has_cursor
            OR v_cursor_b = 1
            OR (
              v_cursor_b = 0
              AND (
                e.created_at < v_cursor_t
                OR (e.created_at = v_cursor_t AND e.id < v_cursor_id)
              )
            )
          )
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT (v_limit + 1)
      )
    ) u
    ORDER BY u.interested DESC, u.created_at DESC, u.id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      row_to_json(t)::jsonb
      ORDER BY t.interested DESC, t.created_at DESC, t.opportunity_id DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      m.id AS opportunity_id,
      m.source_post_id,
      m.creator_id,
      m.description,
      m.discoverable_until,
      m.created_at,
      pr.id AS profile_id,
      pr.display_name,
      pr.username,
      pr.avatar_url,
      pr.profile_photos,
      pr.echo_preset,
      pr.bio,
      p.caption AS source_caption,
      p.type AS source_type,
      p.created_at AS source_created_at,
      p.selected_dates AS source_selected_dates,
      p.is_recurring AS source_is_recurring,
      p.recurrence_days AS source_recurrence_days,
      EXISTS (
        SELECT 1
        FROM public.social_opportunity_interests i
        INNER JOIN public.social_opportunities mo
          ON mo.id = i.from_opportunity_id
         AND mo.source_post_id = m.source_post_id
         AND mo.creator_id = v_me
         AND mo.kind = 'pair_up'
         AND mo.status = 'active'
        WHERE i.to_opportunity_id = m.id
      ) AS expressed_by_me,
      m.interested
    FROM paged m
    INNER JOIN public.profiles pr
      ON pr.user_id = m.creator_id
     AND pr.deleted_at IS NULL
    INNER JOIN public.posts p
      ON p.id = m.source_post_id
  ) t;

  IF jsonb_array_length(v_rows) > v_limit THEN
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
                'b', (v_last ->> 'interested')::integer,
                't', v_last ->> 'created_at',
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

  SELECT COALESCE(
    jsonb_agg(elem - 'interested' ORDER BY ordinality),
    '[]'::jsonb
  )
  INTO v_rows
  FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb))
    WITH ORDINALITY AS x(elem, ordinality);

  RETURN jsonb_build_object(
    'candidates', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_discover_pair_up_candidates(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_discover_pair_up_candidates(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_discover_pair_up_candidates(integer, text) IS
  'Global event-P2P Discover page (hangout sources only). Viewer Discover OFF returns empty. Excludes sources where the viewer already has an active Pair Up. Hidden inbound ranking uses current in-window active pair_up interests only and is never returned. Opaque next_cursor is keyset (bucket, created_at, id). Does not change My Plans.';
