-- Group Up G3: host incoming requests, accept/decline into existing group,
-- persistent Yours Host+Member list (one row per conversation_id).
-- Local build only — do not apply to production without explicit approval.

-- ---------------------------------------------------------------------------
-- list_my_group_up_requests — host pending inbox (identified requester)
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
  'Host pending Group Up requests (identified). Includes active opportunities even after discoverable_until. Excludes blocked requester/host pairs (no identity leak while blocked). Accept rechecks blocks independently. Keyset on requested_at/request_id.';

-- ---------------------------------------------------------------------------
-- accept_group_up_request — join EXISTING group conversation (no DM)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_group_up_request(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  c_max_active_members integer := 100;
  v_me uuid := auth.uid();
  v_opp_id uuid;
  v_opp public.social_opportunities%ROWTYPE;
  v_req public.group_up_requests%ROWTYPE;
  v_other uuid;
  v_conv_id uuid;
  v_left_at timestamptz;
  v_active integer;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Missing request';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_me
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  SELECT r.opportunity_id
  INTO v_opp_id
  FROM public.group_up_requests r
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up request not found';
  END IF;

  SELECT *
  INTO v_opp
  FROM public.social_opportunities o
  WHERE o.id = v_opp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up not found';
  END IF;

  SELECT *
  INTO v_req
  FROM public.group_up_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up request not found';
  END IF;

  IF v_req.opportunity_id <> v_opp.id THEN
    RAISE EXCEPTION 'Group Up request not found';
  END IF;

  IF v_opp.kind <> 'group_up' THEN
    RAISE EXCEPTION 'Not a Group Up';
  END IF;

  IF v_opp.creator_id <> v_me THEN
    RAISE EXCEPTION 'Not the Group Up owner';
  END IF;

  IF v_opp.conversation_id IS NULL THEN
    RAISE EXCEPTION 'Group Up conversation missing';
  END IF;

  v_conv_id := v_opp.conversation_id;
  v_other := v_req.requester_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = v_conv_id
      AND c.kind = 'group'
  ) THEN
    RAISE EXCEPTION 'Group Up conversation missing';
  END IF;

  -- Idempotent: already accepted + active member
  IF v_req.status = 'accepted'
     AND EXISTS (
       SELECT 1
       FROM public.conversation_members cm
       WHERE cm.conversation_id = v_conv_id
         AND cm.user_id = v_other
         AND cm.left_at IS NULL
     ) THEN
    RETURN jsonb_build_object(
      'accepted', true,
      'reason', NULL,
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'updated_at', v_req.updated_at,
        'resolved_at', v_req.resolved_at
      ),
      'opportunity_id', v_opp.id,
      'conversation_id', v_conv_id,
      'requester_user_id', v_other
    );
  END IF;

  IF v_req.status IN ('withdrawn', 'declined', 'closed') THEN
    RAISE EXCEPTION 'Group Up request is not pending';
  END IF;

  IF v_req.status <> 'pending' AND v_req.status <> 'accepted' THEN
    RAISE EXCEPTION 'Group Up request is not pending';
  END IF;

  IF v_opp.status <> 'active' THEN
    IF v_req.status = 'pending' THEN
      UPDATE public.group_up_requests
      SET status = 'closed',
          resolved_at = now(),
          updated_at = now()
      WHERE id = v_req.id
      RETURNING * INTO v_req;
    END IF;

    RETURN jsonb_build_object(
      'accepted', false,
      'reason', 'group_unavailable',
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'updated_at', v_req.updated_at,
        'resolved_at', v_req.resolved_at
      ),
      'opportunity_id', v_opp.id,
      'conversation_id', v_conv_id,
      'requester_user_id', v_other
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_other
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_other) THEN
    RAISE EXCEPTION 'Cannot include blocked users in this group';
  END IF;

  PERFORM public._lock_group_conversation(v_conv_id);

  IF EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = v_conv_id
      AND cm.user_id = v_other
      AND cm.left_at IS NULL
  ) THEN
    UPDATE public.group_up_requests
    SET status = 'accepted',
        resolved_at = COALESCE(resolved_at, now()),
        updated_at = now()
    WHERE id = v_req.id
    RETURNING * INTO v_req;

    RETURN jsonb_build_object(
      'accepted', true,
      'reason', NULL,
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'updated_at', v_req.updated_at,
        'resolved_at', v_req.resolved_at
      ),
      'opportunity_id', v_opp.id,
      'conversation_id', v_conv_id,
      'requester_user_id', v_other
    );
  END IF;

  v_active := public._count_active_members(v_conv_id);
  IF v_active >= c_max_active_members THEN
    RAISE EXCEPTION 'Group member limit is %', c_max_active_members;
  END IF;

  SELECT m.left_at
  INTO v_left_at
  FROM public.conversation_members m
  WHERE m.conversation_id = v_conv_id
    AND m.user_id = v_other;

  IF FOUND THEN
    UPDATE public.conversation_members m
    SET
      left_at = NULL,
      role = 'member',
      unread_count = 0,
      joined_at = now()
    WHERE m.conversation_id = v_conv_id
      AND m.user_id = v_other
      AND m.left_at IS NOT NULL;
  ELSE
    INSERT INTO public.conversation_members (
      conversation_id,
      user_id,
      role,
      unread_count,
      joined_at
    )
    VALUES (
      v_conv_id,
      v_other,
      'member',
      0,
      now()
    );
  END IF;

  UPDATE public.group_up_requests
  SET status = 'accepted',
      resolved_at = COALESCE(resolved_at, now()),
      updated_at = now()
  WHERE id = v_req.id
  RETURNING * INTO v_req;

  RETURN jsonb_build_object(
    'accepted', true,
    'reason', NULL,
    'request', jsonb_build_object(
      'id', v_req.id,
      'opportunity_id', v_req.opportunity_id,
      'status', v_req.status,
      'created_at', v_req.created_at,
      'updated_at', v_req.updated_at,
      'resolved_at', v_req.resolved_at
    ),
    'opportunity_id', v_opp.id,
    'conversation_id', v_conv_id,
    'requester_user_id', v_other
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_group_up_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_group_up_request(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.accept_group_up_request(uuid) IS
  'Host Accept → add/reactivate requester as member on EXISTING group conversation. No DM/new conversation. Cap 100 under conversation lock. discoverable_until not required.';

-- ---------------------------------------------------------------------------
-- decline_group_up_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decline_group_up_request(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_opp_id uuid;
  v_opp public.social_opportunities%ROWTYPE;
  v_req public.group_up_requests%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Missing request';
  END IF;

  SELECT r.opportunity_id
  INTO v_opp_id
  FROM public.group_up_requests r
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up request not found';
  END IF;

  SELECT *
  INTO v_opp
  FROM public.social_opportunities o
  WHERE o.id = v_opp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up not found';
  END IF;

  SELECT *
  INTO v_req
  FROM public.group_up_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up request not found';
  END IF;

  IF v_req.opportunity_id <> v_opp.id THEN
    RAISE EXCEPTION 'Group Up request not found';
  END IF;

  IF v_opp.kind <> 'group_up' THEN
    RAISE EXCEPTION 'Not a Group Up';
  END IF;

  IF v_opp.creator_id <> v_me THEN
    RAISE EXCEPTION 'Not the Group Up owner';
  END IF;

  IF v_req.status = 'declined' THEN
    RETURN jsonb_build_object(
      'declined', true,
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'updated_at', v_req.updated_at,
        'resolved_at', v_req.resolved_at
      ),
      'opportunity_id', v_opp.id,
      'conversation_id', v_opp.conversation_id,
      'requester_user_id', v_req.requester_id
    );
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Group Up request is not pending';
  END IF;

  UPDATE public.group_up_requests
  SET status = 'declined',
      resolved_at = now(),
      updated_at = now()
  WHERE id = v_req.id
  RETURNING * INTO v_req;

  RETURN jsonb_build_object(
    'declined', true,
    'request', jsonb_build_object(
      'id', v_req.id,
      'opportunity_id', v_req.opportunity_id,
      'status', v_req.status,
      'created_at', v_req.created_at,
      'updated_at', v_req.updated_at,
      'resolved_at', v_req.resolved_at
    ),
    'opportunity_id', v_opp.id,
    'conversation_id', v_opp.conversation_id,
    'requester_user_id', v_req.requester_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.decline_group_up_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_group_up_request(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.decline_group_up_request(uuid) IS
  'Host Decline → pending to declined. No membership change. Blocks re-request per G2.';

-- ---------------------------------------------------------------------------
-- list_my_group_up_memberships — persistent Yours Host+Member
-- One row per conversation_id; canonical opportunity selection.
-- ---------------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.list_my_group_up_memberships(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_group_up_memberships(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_my_group_up_memberships(integer, text) IS
  'Persistent Group Up Yours: one Host|Member row per conversation_id. owner = original Group Up creator_id only (not conversation admin). Canonical opp = newest active else newest historical. Survives discovery expiry/cancel while membership active.';
