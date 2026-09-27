-- Group Up Phase 1: source-scoped browse + batched discoverable counts.
-- LOCAL ONLY — do not apply to production until explicitly approved.
--
-- Also relaxes get_my_group_up(s)_for_source(s) discoverable_until filter so
-- owner-active manage works after discovery ends (one-active-per-creator/source).

-- ---------------------------------------------------------------------------
-- Index for source-scoped Group Up listing / counts
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS social_opportunities_group_up_by_source_idx
  ON public.social_opportunities (
    source_post_id,
    occurs_at ASC NULLS LAST,
    created_at DESC,
    id DESC
  )
  WHERE kind = 'group_up' AND status = 'active';

-- ---------------------------------------------------------------------------
-- Own-state: active owned Group Up regardless of discoverable_until
-- (manage-when-not-discoverable; create still expires stale rows server-side)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_group_up_for_source(p_source_post_id uuid)
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
  IF v_me IS NULL OR p_source_post_id IS NULL THEN
    RETURN jsonb_build_object('opportunity', NULL);
  END IF;

  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = p_source_post_id
    AND o.kind = 'group_up'
    AND o.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('opportunity', NULL);
  END IF;

  RETURN jsonb_build_object(
    'opportunity', public._group_up_opportunity_json(v_row)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_group_up_for_source(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_group_up_for_source(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_my_group_up_for_source(uuid) IS
  'Viewer-owned active Group Up for one source. Includes active rows past discoverable_until so manage works after discovery ends.';

CREATE OR REPLACE FUNCTION public.get_my_group_ups_for_sources(p_source_post_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  c_max_source_ids integer := 100;
  v_me uuid := auth.uid();
  v_ids uuid[];
  v_rows jsonb;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('opportunities', '[]'::jsonb);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO v_ids
  FROM unnest(COALESCE(p_source_post_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  IF COALESCE(array_length(v_ids, 1), 0) > c_max_source_ids THEN
    RAISE EXCEPTION 'Too many source ids';
  END IF;

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('opportunities', '[]'::jsonb);
  END IF;

  SELECT COALESCE(
    jsonb_agg(public._group_up_opportunity_json(o) ORDER BY o.source_post_id),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.kind = 'group_up'
    AND o.status = 'active'
    AND o.source_post_id = ANY (v_ids);

  RETURN jsonb_build_object('opportunities', v_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_group_ups_for_sources(uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_group_ups_for_sources(uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.get_my_group_ups_for_sources(uuid[]) IS
  'Batched viewer-owned active Group Ups. Includes active past discoverable_until (manage-when-not-discoverable).';

-- ---------------------------------------------------------------------------
-- get_group_up_counts_for_sources
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_group_up_counts_for_sources(
  p_source_post_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  c_max_source_ids integer := 50;
  v_me uuid := auth.uid();
  v_ids uuid[];
  v_rows jsonb;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('counts', '[]'::jsonb);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO v_ids
  FROM unnest(COALESCE(p_source_post_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  IF COALESCE(array_length(v_ids, 1), 0) > c_max_source_ids THEN
    RAISE EXCEPTION 'Too many source ids';
  END IF;

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('counts', '[]'::jsonb);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'source_post_id', c.source_post_id,
        'discoverable_group_count', c.cnt
      )
      ORDER BY c.source_post_id
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      o.source_post_id,
      count(*)::integer AS cnt
    FROM public.social_opportunities o
    INNER JOIN public.conversations c
      ON c.id = o.conversation_id
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    WHERE o.kind = 'group_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.source_post_id = ANY (v_ids)
      AND public.group_up_source_is_eligible(o.source_post_id)
      AND public.can_view_post(p.id)
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND p.type IN ('hangout', 'experience')
      AND NOT public.users_are_blocked_pair(v_me, o.creator_id)
      AND NOT public.users_are_blocked_pair(v_me, p.author_id)
      AND (
        o.creator_id = v_me
        OR EXISTS (
          SELECT 1
          FROM public.conversation_members cm
          WHERE cm.conversation_id = o.conversation_id
            AND cm.user_id = v_me
            AND cm.left_at IS NULL
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.group_up_requests dec
            WHERE dec.opportunity_id = o.id
              AND dec.requester_id = v_me
              AND dec.status = 'declined'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.group_up_requests acc
            WHERE acc.opportunity_id = o.id
              AND acc.requester_id = v_me
              AND acc.status = 'accepted'
          )
        )
      )
    GROUP BY o.source_post_id
  ) c;

  RETURN jsonb_build_object('counts', COALESCE(v_rows, '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_group_up_counts_for_sources(uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_up_counts_for_sources(uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.get_group_up_counts_for_sources(uuid[]) IS
  'Batched discoverable Group Up counts per source_post_id. Integers only. Cap 50 ids. Includes owned/pending/member/joinable; excludes declined/expired/blocked.';

-- ---------------------------------------------------------------------------
-- list_group_ups_for_source
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_group_ups_for_source(
  p_source_post_id uuid,
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
  v_cursor_o_is_null boolean := false;
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
  IF v_me IS NULL OR p_source_post_id IS NULL THEN
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
      IF v_cursor_json ? 'o' AND v_cursor_json -> 'o' IS NULL THEN
        v_cursor_o_is_null := true;
        v_cursor_o := NULL;
      ELSIF v_cursor_json ->> 'o' IS NOT NULL THEN
        v_cursor_o_is_null := false;
        v_cursor_o := (v_cursor_json ->> 'o')::timestamptz;
      ELSE
        RETURN v_empty;
      END IF;
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
      o.id,
      o.conversation_id,
      o.source_post_id,
      c.title AS group_title,
      c.description AS group_description,
      o.occurs_at,
      o.discoverable_until,
      o.created_at,
      p.type AS source_type,
      o.creator_id AS organizer_user_id,
      pr.display_name AS organizer_display_name,
      pr.username AS organizer_username,
      pr.avatar_url AS organizer_avatar_url,
      pr.echo_preset AS organizer_echo_preset,
      public._count_active_members(o.conversation_id) AS member_count,
      CASE
        WHEN o.creator_id = v_me THEN 'owner'
        WHEN EXISTS (
          SELECT 1
          FROM public.conversation_members cm
          WHERE cm.conversation_id = o.conversation_id
            AND cm.user_id = v_me
            AND cm.left_at IS NULL
        ) THEN 'member'
        WHEN EXISTS (
          SELECT 1
          FROM public.group_up_requests pend
          WHERE pend.opportunity_id = o.id
            AND pend.requester_id = v_me
            AND pend.status = 'pending'
        ) THEN 'pending'
        ELSE 'none'
      END AS viewer_state,
      (
        SELECT pend.id
        FROM public.group_up_requests pend
        WHERE pend.opportunity_id = o.id
          AND pend.requester_id = v_me
          AND pend.status = 'pending'
        LIMIT 1
      ) AS request_id
    FROM public.social_opportunities o
    INNER JOIN public.conversations c
      ON c.id = o.conversation_id
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    INNER JOIN public.profiles pr
      ON pr.user_id = o.creator_id
     AND pr.deleted_at IS NULL
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    WHERE o.kind = 'group_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.source_post_id = p_source_post_id
      AND public.group_up_source_is_eligible(o.source_post_id)
      AND public.can_view_post(p.id)
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND p.type IN ('hangout', 'experience')
      AND NOT public.users_are_blocked_pair(v_me, o.creator_id)
      AND NOT public.users_are_blocked_pair(v_me, p.author_id)
      AND (
        o.creator_id = v_me
        OR EXISTS (
          SELECT 1
          FROM public.conversation_members cm
          WHERE cm.conversation_id = o.conversation_id
            AND cm.user_id = v_me
            AND cm.left_at IS NULL
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.group_up_requests acc
            WHERE acc.opportunity_id = o.id
              AND acc.requester_id = v_me
              AND acc.status = 'accepted'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.group_up_requests dec
            WHERE dec.opportunity_id = o.id
              AND dec.requester_id = v_me
              AND dec.status = 'declined'
          )
        )
      )
  ),
  paged AS (
    SELECT e.*
    FROM eligible e
    WHERE (
      NOT v_has_cursor
      OR (
        NOT v_cursor_o_is_null
        AND (
          e.occurs_at > v_cursor_o
          OR (
            e.occurs_at = v_cursor_o
            AND e.created_at < v_cursor_c
          )
          OR (
            e.occurs_at = v_cursor_o
            AND e.created_at = v_cursor_c
            AND e.id < v_cursor_id
          )
          OR e.occurs_at IS NULL
        )
      )
      OR (
        v_cursor_o_is_null
        AND e.occurs_at IS NULL
        AND (
          e.created_at < v_cursor_c
          OR (
            e.created_at = v_cursor_c
            AND e.id < v_cursor_id
          )
        )
      )
    )
    ORDER BY e.occurs_at ASC NULLS LAST, e.created_at DESC, e.id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'opportunity_id', t.id,
        'conversation_id', t.conversation_id,
        'source_post_id', t.source_post_id,
        'group_title', t.group_title,
        'group_description', t.group_description,
        'occurs_at', t.occurs_at,
        'discoverable_until', t.discoverable_until,
        'created_at', t.created_at,
        'source_type', t.source_type,
        'organizer_user_id', t.organizer_user_id,
        'organizer_display_name', t.organizer_display_name,
        'organizer_username', t.organizer_username,
        'organizer_avatar_url', t.organizer_avatar_url,
        'organizer_echo_preset', t.organizer_echo_preset,
        'member_count', t.member_count,
        'viewer_state', t.viewer_state,
        'request_id', t.request_id
      )
      ORDER BY t.occurs_at ASC NULLS LAST, t.created_at DESC, t.id DESC
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
                'o', v_last -> 'occurs_at',
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

REVOKE ALL ON FUNCTION public.list_group_ups_for_source(uuid, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_group_ups_for_source(uuid, integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_group_ups_for_source(uuid, integer, text) IS
  'Source-scoped discoverable Group Ups with viewer_state owner|member|pending|none. Slim payload (no source caption/dates). Keyset on occurs_at/created_at/id.';
