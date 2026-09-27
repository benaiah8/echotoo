-- Phase 8E.0 — Event/Place social-source split + Open Plan own-state batching
-- (local only). Do NOT apply during Build without explicit approval.
--
-- Pair Up = hangout (Event) only.
-- Open Plan = experience (Place) only (unchanged).
--
-- Does NOT delete/close/migrate legacy Experience Pair Up rows.
-- Own get/leave Pair Up reads stay eligibility-free so Leave remains available.
-- No Open Plan composer UI. No Messages changes.

-- ---------------------------------------------------------------------------
-- people_source_is_eligible — hangout-only Pair Up gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_source_is_eligible(p_post_id uuid)
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
      AND p.type = 'hangout'
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND (
        auth.uid() IS NULL
        OR NOT public.users_are_blocked_pair(auth.uid(), p.author_id)
      )
      AND (
        COALESCE(p.is_recurring, false) = true
        OR COALESCE(jsonb_array_length(p.selected_dates), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
          WHERE NULLIF(btrim(elem), '') IS NOT NULL
            AND (btrim(elem))::timestamptz >= now()
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.people_source_is_eligible(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.people_source_is_eligible(uuid) IS
  'Internal Pair Up source gate. Public published hangout (Event) by a public author; can_view_post + viewer-author block + hangout date/recurrence rules. Experience/Place is Open Plan only.';

-- ---------------------------------------------------------------------------
-- list_discover_pair_up_candidates — hangout-only inline source predicates
-- Ranking, cursor, privacy, Discover preference, JSON unchanged.
-- ---------------------------------------------------------------------------
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
        COALESCE(p.is_recurring, false) = true
        OR COALESCE(jsonb_array_length(p.selected_dates), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
          WHERE NULLIF(btrim(elem), '') IS NOT NULL
            AND (btrim(elem))::timestamptz >= now()
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

-- ---------------------------------------------------------------------------
-- get_my_open_plans_for_sources — batched own active Open Plans
-- No source-eligibility gate (owner can still resolve for cancel/manage).
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
