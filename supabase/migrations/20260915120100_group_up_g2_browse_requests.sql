-- Group Up G2: browse deck list + request/withdraw RPCs (local build; do not apply to prod yet).

-- ---------------------------------------------------------------------------
-- Partial index for browse ordering
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS social_opportunities_group_up_browse_idx
  ON public.social_opportunities (occurs_at ASC NULLS LAST, created_at DESC, id DESC)
  WHERE kind = 'group_up' AND status = 'active';

-- ---------------------------------------------------------------------------
-- list_group_up_candidates
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

REVOKE ALL ON FUNCTION public.list_group_up_candidates(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_group_up_candidates(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_group_up_candidates(integer, text) IS
  'Group Up browse deck. Includes owner rows. Excludes active members, accepted/declined requests for non-owners. Nullable occurs_at keyset cursor.';

-- ---------------------------------------------------------------------------
-- request_group_up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_group_up(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_opp public.social_opportunities%ROWTYPE;
  v_post public.posts%ROWTYPE;
  v_req public.group_up_requests%ROWTYPE;
  v_member_count integer;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing opportunity';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_me
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  SELECT *
  INTO v_opp
  FROM public.social_opportunities o
  WHERE o.id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up not found';
  END IF;

  IF v_opp.kind <> 'group_up'
     OR v_opp.status <> 'active'
     OR v_opp.discoverable_until <= now() THEN
    RAISE EXCEPTION 'Group Up is not available';
  END IF;

  IF NOT public.group_up_source_is_eligible(v_opp.source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  IF v_opp.creator_id = v_me THEN
    RAISE EXCEPTION 'Cannot request your own Group Up';
  END IF;

  SELECT *
  INTO v_post
  FROM public.posts p
  WHERE p.id = v_opp.source_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = v_opp.conversation_id
      AND cm.user_id = v_me
      AND cm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Already a group member';
  END IF;

  v_member_count := public._count_active_members(v_opp.conversation_id);
  IF v_member_count >= 100 THEN
    RAISE EXCEPTION 'Group member limit is 100';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_opp.creator_id) THEN
    RAISE EXCEPTION 'Cannot request this Group Up';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_post.author_id) THEN
    RAISE EXCEPTION 'Cannot request this Group Up';
  END IF;

  SELECT *
  INTO v_req
  FROM public.group_up_requests r
  WHERE r.opportunity_id = p_opportunity_id
    AND r.requester_id = v_me
  ORDER BY
    CASE r.status
      WHEN 'pending' THEN 0
      WHEN 'accepted' THEN 1
      WHEN 'declined' THEN 2
      WHEN 'withdrawn' THEN 3
      ELSE 4
    END,
    r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_req.status = 'pending' OR v_req.status = 'accepted' THEN
      RETURN jsonb_build_object(
        'request', jsonb_build_object(
          'id', v_req.id,
          'opportunity_id', v_req.opportunity_id,
          'status', v_req.status,
          'created_at', v_req.created_at
        )
      );
    END IF;

    IF v_req.status = 'declined' THEN
      RAISE EXCEPTION 'Cannot request this Group Up';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.group_up_requests (
      opportunity_id,
      requester_id,
      status
    )
    VALUES (
      p_opportunity_id,
      v_me,
      'pending'
    )
    RETURNING * INTO v_req;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO v_req
      FROM public.group_up_requests r
      WHERE r.opportunity_id = p_opportunity_id
        AND r.requester_id = v_me
        AND r.status IN ('pending', 'accepted')
      ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE;
      END IF;
  END;

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_req.id,
      'opportunity_id', v_req.opportunity_id,
      'status', v_req.status,
      'created_at', v_req.created_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_group_up(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_group_up(uuid) TO authenticated;

COMMENT ON FUNCTION public.request_group_up(uuid) IS
  'Group Up join request (pending only). No membership/DM/push. Declined blocks re-request; withdrawn allows re-request.';

-- ---------------------------------------------------------------------------
-- withdraw_group_up_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_group_up_request(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_opp public.social_opportunities%ROWTYPE;
  v_req public.group_up_requests%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing opportunity';
  END IF;

  SELECT *
  INTO v_opp
  FROM public.social_opportunities o
  WHERE o.id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up not found';
  END IF;

  IF v_opp.kind <> 'group_up' THEN
    RAISE EXCEPTION 'Not a Group Up';
  END IF;

  SELECT *
  INTO v_req
  FROM public.group_up_requests r
  WHERE r.opportunity_id = p_opportunity_id
    AND r.requester_id = v_me
  ORDER BY
    CASE r.status
      WHEN 'pending' THEN 0
      WHEN 'accepted' THEN 1
      WHEN 'declined' THEN 2
      ELSE 3
    END,
    r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up request not found';
  END IF;

  IF v_req.status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot withdraw an accepted request';
  END IF;

  IF v_req.status = 'declined' THEN
    RAISE EXCEPTION 'Cannot withdraw a declined request';
  END IF;

  IF v_req.status = 'withdrawn' THEN
    RETURN jsonb_build_object(
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at
      )
    );
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Group Up request is not pending';
  END IF;

  UPDATE public.group_up_requests
  SET status = 'withdrawn',
      resolved_at = now(),
      updated_at = now()
  WHERE id = v_req.id
  RETURNING * INTO v_req;

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_req.id,
      'opportunity_id', v_req.opportunity_id,
      'status', v_req.status,
      'created_at', v_req.created_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.withdraw_group_up_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_group_up_request(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.withdraw_group_up_request(uuid) IS
  'Withdraw pending Group Up request. Idempotent when already withdrawn.';
