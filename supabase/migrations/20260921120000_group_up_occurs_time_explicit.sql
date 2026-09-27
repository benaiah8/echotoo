-- Group Up: thread social_opportunities.occurs_time_explicit through Group RPCs
-- LOCAL MIGRATION ONLY. Do not apply from this agent pass.
-- Column already exists (open_plan_occurs_time_explicit). No new column.
-- Signature safety: DROP old exact arities before CREATE with boolean DEFAULT true.

BEGIN;

-- ---------------------------------------------------------------------------
-- _group_up_opportunity_json
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._group_up_opportunity_json(o public.social_opportunities)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'id', o.id,
    'source_post_id', o.source_post_id,
    'creator_id', o.creator_id,
    'conversation_id', o.conversation_id,
    'status', o.status,
    'description', o.description,
    'occurs_at', o.occurs_at,
    'occurs_time_explicit', o.occurs_time_explicit,
    'discoverable_until', o.discoverable_until,
    'created_at', o.created_at,
    'closed_at', o.closed_at
  );
$function$;

REVOKE ALL ON FUNCTION public._group_up_opportunity_json(public.social_opportunities)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_group_up
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_group_up(uuid, text, text, timestamptz);

CREATE OR REPLACE FUNCTION public.create_group_up(
  p_source_post_id uuid,
  p_title text,
  p_description text,
  p_occurs_at timestamptz DEFAULT NULL,
  p_occurs_time_explicit boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  c_description_max integer := 200;
  v_me uuid := auth.uid();
  v_row public.social_opportunities%ROWTYPE;
  v_title text;
  v_description text;
  v_conv_id uuid;
  v_stale_id uuid;
  v_discoverable_until timestamptz;
  v_time_explicit boolean;
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

  IF NOT public.group_up_source_is_eligible(p_source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  v_title := public._normalize_group_title(p_title);

  v_description := NULLIF(btrim(p_description), '');
  IF v_description IS NULL THEN
    RAISE EXCEPTION 'Description required';
  END IF;
  IF char_length(v_description) > c_description_max THEN
    RAISE EXCEPTION 'Description too long';
  END IF;

  IF p_occurs_at IS NOT NULL AND p_occurs_at <= now() THEN
    RAISE EXCEPTION 'Group Up time must be in the future';
  END IF;

  v_time_explicit :=
    CASE
      WHEN p_occurs_at IS NULL THEN true
      ELSE COALESCE(p_occurs_time_explicit, true)
    END;

  v_discoverable_until :=
    CASE
      WHEN p_occurs_at IS NULL THEN now() + interval '14 days'
      ELSE LEAST(now() + interval '14 days', p_occurs_at)
    END;

  PERFORM pg_advisory_xact_lock(
    hashtext('group_up_create'),
    hashtext(v_me::text || ':' || p_source_post_id::text)
  );

  PERFORM 1
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = p_source_post_id
    AND o.kind = 'group_up'
  FOR UPDATE;

  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = p_source_post_id
    AND o.kind = 'group_up'
    AND o.status = 'active'
    AND o.discoverable_until > now()
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'opportunity', public._group_up_opportunity_json(v_row)
    );
  END IF;

  FOR v_stale_id IN
    UPDATE public.social_opportunities o
    SET status = 'expired',
        closed_at = now()
    WHERE o.creator_id = v_me
      AND o.source_post_id = p_source_post_id
      AND o.kind = 'group_up'
      AND o.status = 'active'
      AND o.discoverable_until <= now()
    RETURNING o.id
  LOOP
    UPDATE public.group_up_requests r
    SET status = 'closed',
        resolved_at = COALESCE(r.resolved_at, now()),
        updated_at = now()
    WHERE r.opportunity_id = v_stale_id
      AND r.status = 'pending';
  END LOOP;

  SELECT o.conversation_id
  INTO v_conv_id
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = p_source_post_id
    AND o.kind = 'group_up'
    AND o.conversation_id IS NOT NULL
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    v_conv_id := public._create_host_only_group_conversation(
      v_me,
      v_title,
      v_description
    );
  END IF;

  BEGIN
    INSERT INTO public.social_opportunities (
      kind,
      source_post_id,
      creator_id,
      conversation_id,
      status,
      description,
      occurs_at,
      occurs_time_explicit,
      discoverable_until
    )
    VALUES (
      'group_up',
      p_source_post_id,
      v_me,
      v_conv_id,
      'active',
      v_description,
      p_occurs_at,
      v_time_explicit,
      v_discoverable_until
    )
    RETURNING * INTO v_row;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO v_row
      FROM public.social_opportunities o
      WHERE o.creator_id = v_me
        AND o.source_post_id = p_source_post_id
        AND o.kind = 'group_up'
        AND o.status = 'active'
        AND o.discoverable_until > now()
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE;
      END IF;
  END;

  RETURN jsonb_build_object(
    'opportunity', public._group_up_opportunity_json(v_row)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_group_up(uuid, text, text, timestamptz, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_up(uuid, text, text, timestamptz, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.create_group_up(uuid, text, text, timestamptz, boolean) IS
  'Create or reuse active Group Up. Explicit title + description; optional occurs_at + occurs_time_explicit (DEFAULT true).';

-- ---------------------------------------------------------------------------
-- renew_group_up
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.renew_group_up(uuid, text, timestamptz);

CREATE OR REPLACE FUNCTION public.renew_group_up(
  p_conversation_id uuid,
  p_description text,
  p_occurs_at timestamptz DEFAULT NULL,
  p_occurs_time_explicit boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  c_description_max integer := 200;
  v_me uuid := auth.uid();
  v_row public.social_opportunities%ROWTYPE;
  v_hist public.social_opportunities%ROWTYPE;
  v_description text;
  v_conv_kind text;
  v_stale_id uuid;
  v_discoverable_until timestamptz;
  v_time_explicit boolean;
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

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
  END IF;

  SELECT c.kind
  INTO v_conv_kind
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF NOT FOUND OR v_conv_kind <> 'group' THEN
    RAISE EXCEPTION 'Not a group conversation';
  END IF;

  SELECT *
  INTO v_hist
  FROM public.social_opportunities o
  WHERE o.kind = 'group_up'
    AND o.conversation_id = p_conversation_id
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No Group Up history for conversation';
  END IF;

  IF v_hist.creator_id <> v_me THEN
    RAISE EXCEPTION 'Not the Group Up owner';
  END IF;

  IF NOT public.group_up_source_is_eligible(v_hist.source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  v_description := NULLIF(btrim(p_description), '');
  IF v_description IS NULL THEN
    RAISE EXCEPTION 'Description required';
  END IF;
  IF char_length(v_description) > c_description_max THEN
    RAISE EXCEPTION 'Description too long';
  END IF;

  IF p_occurs_at IS NOT NULL AND p_occurs_at <= now() THEN
    RAISE EXCEPTION 'Group Up time must be in the future';
  END IF;

  v_time_explicit :=
    CASE
      WHEN p_occurs_at IS NULL THEN true
      ELSE COALESCE(p_occurs_time_explicit, true)
    END;

  v_discoverable_until :=
    CASE
      WHEN p_occurs_at IS NULL THEN now() + interval '14 days'
      ELSE LEAST(now() + interval '14 days', p_occurs_at)
    END;

  -- Lock active group_up rows for this conversation.
  PERFORM 1
  FROM public.social_opportunities o
  WHERE o.kind = 'group_up'
    AND o.conversation_id = p_conversation_id
    AND o.status = 'active'
  FOR UPDATE;

  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.kind = 'group_up'
    AND o.conversation_id = p_conversation_id
    AND o.status = 'active'
    AND o.discoverable_until > now()
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'opportunity', public._group_up_opportunity_json(v_row)
    );
  END IF;

  FOR v_stale_id IN
    UPDATE public.social_opportunities o
    SET status = 'expired',
        closed_at = now()
    WHERE o.kind = 'group_up'
      AND o.conversation_id = p_conversation_id
      AND o.status = 'active'
    RETURNING o.id
  LOOP
    UPDATE public.group_up_requests r
    SET status = 'closed',
        resolved_at = COALESCE(r.resolved_at, now()),
        updated_at = now()
    WHERE r.opportunity_id = v_stale_id
      AND r.status = 'pending';
  END LOOP;

  INSERT INTO public.social_opportunities (
    kind,
    source_post_id,
    creator_id,
    conversation_id,
    status,
    description,
    occurs_at,
    occurs_time_explicit,
    discoverable_until
  )
  VALUES (
    'group_up',
    v_hist.source_post_id,
    v_hist.creator_id,
    p_conversation_id,
    'active',
    v_description,
    p_occurs_at,
    v_time_explicit,
    v_discoverable_until
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'opportunity', public._group_up_opportunity_json(v_row)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.renew_group_up(uuid, text, timestamptz, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_group_up(uuid, text, timestamptz, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.renew_group_up(uuid, text, timestamptz, boolean) IS
  'Renew Group Up discovery. Optional occurs_at + occurs_time_explicit (DEFAULT true).';

-- ---------------------------------------------------------------------------
-- update_group_up_schedule
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_group_up_schedule(uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.update_group_up_schedule(
  p_opportunity_id uuid,
  p_occurs_at timestamptz DEFAULT NULL,
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
  v_original_window_end timestamptz;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing opportunity';
  END IF;

  IF p_occurs_at IS NOT NULL AND p_occurs_at <= now() THEN
    RAISE EXCEPTION 'Group Up time must be in the future';
  END IF;

  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up not found';
  END IF;

  IF v_row.kind <> 'group_up' THEN
    RAISE EXCEPTION 'Not a Group Up';
  END IF;

  IF v_row.creator_id <> v_me THEN
    RAISE EXCEPTION 'Not the Group Up owner';
  END IF;

  IF v_row.status <> 'active' OR v_row.discoverable_until <= now() THEN
    RAISE EXCEPTION 'Group Up is not active';
  END IF;

  v_original_window_end := v_row.created_at + interval '14 days';

  IF p_occurs_at IS NOT NULL THEN
    UPDATE public.social_opportunities
    SET occurs_at = p_occurs_at,
        occurs_time_explicit = COALESCE(p_occurs_time_explicit, true),
        discoverable_until = LEAST(v_original_window_end, p_occurs_at)
    WHERE id = p_opportunity_id
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.social_opportunities
    SET occurs_at = NULL,
        occurs_time_explicit = true,
        discoverable_until = v_original_window_end
    WHERE id = p_opportunity_id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'opportunity', public._group_up_opportunity_json(v_row)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_group_up_schedule(uuid, timestamptz, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_group_up_schedule(uuid, timestamptz, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.update_group_up_schedule(uuid, timestamptz, boolean) IS
  'Creator-only: set/clear Group Up schedule. Clear resets occurs_time_explicit to true. Does not extend original 14-day window.';

-- ---------------------------------------------------------------------------
-- list RPCs (inline occurs_at payloads)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_group_up_candidates(
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
      o.occurs_time_explicit,
      o.discoverable_until,
      o.created_at,
      p.caption AS source_caption,
      p.type AS source_type,
      p.selected_dates AS source_selected_dates,
      p.recurrence_days AS source_recurrence_days,
      p.is_recurring AS source_is_recurring,
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
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.conversation_members cm
            WHERE cm.conversation_id = o.conversation_id
              AND cm.user_id = v_me
              AND cm.left_at IS NULL
          )
          AND NOT EXISTS (
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
        'occurs_time_explicit', t.occurs_time_explicit,
        'discoverable_until', t.discoverable_until,
        'created_at', t.created_at,
        'source_type', t.source_type,
        'source_caption', t.source_caption,
        'source_selected_dates', t.source_selected_dates,
        'source_recurrence_days', t.source_recurrence_days,
        'source_is_recurring', t.source_is_recurring,
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

REVOKE ALL ON FUNCTION public.list_group_up_candidates(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_group_up_candidates(integer, text) TO authenticated;

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

REVOKE ALL ON FUNCTION public.list_my_group_up_requests(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_group_up_requests(integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_group_up_memberships(
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
    'memberships', '[]'::jsonb,
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

  WITH my_groups AS (
    SELECT
      cm.conversation_id,
      cm.joined_at,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.social_opportunities own
          WHERE own.kind = 'group_up'
            AND own.conversation_id = cm.conversation_id
            AND own.creator_id = v_me
        )
        THEN 'owner'
        ELSE 'member'
      END AS viewer_state
    FROM public.conversation_members cm
    INNER JOIN public.conversations c
      ON c.id = cm.conversation_id
     AND c.kind = 'group'
    WHERE cm.user_id = v_me
      AND cm.left_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.social_opportunities o
        WHERE o.kind = 'group_up'
          AND o.conversation_id = cm.conversation_id
      )
  ),
  canonical AS (
    SELECT
      g.conversation_id,
      g.joined_at,
      g.viewer_state,
      (
        SELECT o.id
        FROM public.social_opportunities o
        WHERE o.kind = 'group_up'
          AND o.conversation_id = g.conversation_id
          AND o.status = 'active'
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 1
      ) AS active_opp_id,
      (
        SELECT o.id
        FROM public.social_opportunities o
        WHERE o.kind = 'group_up'
          AND o.conversation_id = g.conversation_id
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 1
      ) AS hist_opp_id
    FROM my_groups g
  ),
  resolved AS (
    SELECT
      c.conversation_id,
      c.joined_at,
      c.viewer_state,
      COALESCE(c.active_opp_id, c.hist_opp_id) AS opportunity_id
    FROM canonical c
    WHERE COALESCE(c.active_opp_id, c.hist_opp_id) IS NOT NULL
  ),
  enriched AS (
    SELECT
      r.conversation_id,
      r.joined_at,
      r.viewer_state,
      o.id AS opportunity_id,
      o.source_post_id,
      conv.title AS group_title,
      conv.description AS group_description,
      o.occurs_at,
      o.occurs_time_explicit,
      o.discoverable_until,
      o.created_at,
      p.caption AS source_caption,
      p.type AS source_type,
      p.selected_dates AS source_selected_dates,
      p.recurrence_days AS source_recurrence_days,
      p.is_recurring AS source_is_recurring,
      o.creator_id AS organizer_user_id,
      pr.display_name AS organizer_display_name,
      pr.username AS organizer_username,
      pr.avatar_url AS organizer_avatar_url,
      pr.echo_preset AS organizer_echo_preset,
      public._count_active_members(r.conversation_id) AS member_count
    FROM resolved r
    INNER JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    INNER JOIN public.conversations conv
      ON conv.id = r.conversation_id
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    INNER JOIN public.profiles pr
      ON pr.user_id = o.creator_id
     AND pr.deleted_at IS NULL
  ),
  paged AS (
    SELECT e.*
    FROM enriched e
    WHERE (
      NOT v_has_cursor
      OR e.joined_at < v_cursor_c
      OR (
        e.joined_at = v_cursor_c
        AND e.conversation_id < v_cursor_id
      )
    )
    ORDER BY e.joined_at DESC, e.conversation_id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'opportunity_id', t.opportunity_id,
        'conversation_id', t.conversation_id,
        'source_post_id', t.source_post_id,
        'group_title', t.group_title,
        'group_description', t.group_description,
        'occurs_at', t.occurs_at,
        'occurs_time_explicit', t.occurs_time_explicit,
        'discoverable_until', t.discoverable_until,
        'created_at', t.created_at,
        'source_type', t.source_type,
        'source_caption', t.source_caption,
        'source_selected_dates', t.source_selected_dates,
        'source_recurrence_days', t.source_recurrence_days,
        'source_is_recurring', t.source_is_recurring,
        'organizer_user_id', t.organizer_user_id,
        'organizer_display_name', t.organizer_display_name,
        'organizer_username', t.organizer_username,
        'organizer_avatar_url', t.organizer_avatar_url,
        'organizer_echo_preset', t.organizer_echo_preset,
        'member_count', t.member_count,
        'viewer_state', t.viewer_state,
        'request_id', NULL,
        'joined_at', t.joined_at
      )
      ORDER BY t.joined_at DESC, t.conversation_id DESC
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
                'c', v_last ->> 'joined_at',
                'i', v_last ->> 'conversation_id'
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
    'memberships', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_group_up_memberships(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_group_up_memberships(integer, text) TO authenticated;

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
      o.occurs_time_explicit,
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
        'occurs_time_explicit', t.occurs_time_explicit,
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

REVOKE ALL ON FUNCTION public.list_group_ups_for_source(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_group_ups_for_source(uuid, integer, text) TO authenticated;

COMMIT;
