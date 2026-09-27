-- LOCAL ONLY — do not apply until explicitly approved.
-- Social source date eligibility: Africa/Addis_Ababa calendar-day (full day).
--
-- Baseline: live production definitions captured 2026-09-10 via read-only
-- pg_get_functiondef for people_source_is_eligible, group_up_source_is_eligible,
-- and list_discover_pair_up_candidates (project otfbgcvxevwtybfltvuf).
--
-- Change only the non-recurring hangout selected_dates predicate:
--   (btrim(elem))::timestamptz >= now()
-- → Addis calendar-day comparison (date-only and timed alike).
--
-- Timestamp note: wall-clock UTC at authoring (~2026-09-10 01:12Z) sorts BEFORE
-- 20260910120000_group_up_g1_create_manage.sql, which would overwrite
-- group_up_source_is_eligible back to timestamptz >= now() on greenfield replay.
-- This file uses 20260910120100 (immediately after G1, before held
-- 20260911120000 photos) so chronological replay keeps Addis on both helpers
-- and Discover, then photos can add payload while retaining Addis.
--
-- Date-only CREATE OR REPLACE bodies. No REVOKE/GRANT/COMMENT (not in
-- pg_get_functiondef capture; live grants unchanged by REPLACE).
-- Does NOT change Group opportunity occurs_at / discoverable_until shells,
-- Feed ranking, join/create/request shells, or chat dissolve.
-- Does NOT include the held candidate photo-array Discover payload.

CREATE OR REPLACE FUNCTION public.people_source_is_eligible(p_post_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  );
$function$;

-- group_up_source_is_eligible
CREATE OR REPLACE FUNCTION public.group_up_source_is_eligible(p_post_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
        p.type = 'experience'
        OR (
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
  );
$function$;

-- list_discover_pair_up_candidates (live baseline; date predicate only)
CREATE OR REPLACE FUNCTION public.list_discover_pair_up_candidates(p_limit integer DEFAULT 20, p_cursor text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
