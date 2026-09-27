-- Raise shared Group conversation active-member cap 100 → 200.
-- Host/admin counts. Pending requests / left members do not.
-- LOCAL ONLY — do not apply until explicitly approved.
-- Does NOT modify _count_active_members, _lock_group_conversation,
-- tables, FKs, or pagination RPCs.

-- ---------------------------------------------------------------------------
-- create_group_conversation — max 200 including creator
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_group_conversation(
  p_title text,
  p_member_user_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  c_max_active_members integer := 200;
  v_me uuid := auth.uid();
  v_title text;
  v_ids uuid[];
  v_conv_id uuid;
  v_uid uuid;
  v_count integer;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_title := public._normalize_group_title(p_title);

  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::uuid[])
  INTO v_ids
  FROM unnest(COALESCE(p_member_user_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL
    AND x <> v_me;

  IF COALESCE(array_length(v_ids, 1), 0) < 2 THEN
    RAISE EXCEPTION 'Group requires at least 2 other members';
  END IF;

  IF 1 + COALESCE(array_length(v_ids, 1), 0) > c_max_active_members THEN
    RAISE EXCEPTION 'Group member limit is %', c_max_active_members;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_ids) AS u(uid)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.user_id = u.uid
        AND pr.deleted_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_ids) AS u(uid)
    WHERE public.users_are_blocked_pair(v_me, u.uid)
  ) THEN
    RAISE EXCEPTION 'Cannot include blocked users in this group';
  END IF;

  INSERT INTO public.conversations (kind, title, created_by)
  VALUES ('group', v_title, v_me)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_members (
    conversation_id,
    user_id,
    role,
    unread_count,
    joined_at
  )
  VALUES (
    v_conv_id,
    v_me,
    'admin',
    0,
    now()
  );

  FOREACH v_uid IN ARRAY v_ids
  LOOP
    INSERT INTO public.conversation_members (
      conversation_id,
      user_id,
      role,
      unread_count,
      joined_at
    )
    VALUES (
      v_conv_id,
      v_uid,
      'member',
      0,
      now()
    );
  END LOOP;

  v_count := public._count_active_members(v_conv_id);

  RETURN jsonb_build_object(
    'conversation_id', v_conv_id,
    'kind', 'group',
    'title', v_title,
    'member_count', v_count,
    'created', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_group_conversation(text, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[])
  TO authenticated, postgres, service_role;

COMMENT ON FUNCTION public.create_group_conversation(text, uuid[]) IS
  'Create group; creator admin; ≥2 others; max 200; actor-relative block checks only.';

-- ---------------------------------------------------------------------------
-- add_conversation_members — max 200 under conversation lock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_conversation_members(
  p_conversation_id uuid,
  p_user_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  c_max_active_members integer := 200;
  v_me uuid := auth.uid();
  v_ids uuid[];
  v_active integer;
  v_uid uuid;
  v_added uuid[] := ARRAY[]::uuid[];
  v_left_at timestamptz;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public._lock_group_conversation(p_conversation_id);
  PERFORM public._ensure_group_has_admin(p_conversation_id);
  PERFORM public._assert_active_group_admin(p_conversation_id, v_me);

  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::uuid[])
  INTO v_ids
  FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL
    AND x <> v_me;

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No members to add';
  END IF;

  -- Drop already-active.
  SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[])
  INTO v_ids
  FROM unnest(v_ids) AS x
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = x
      AND m.left_at IS NULL
  );

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'conversation_id', p_conversation_id,
      'added_user_ids', '[]'::jsonb,
      'member_count', public._count_active_members(p_conversation_id)
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_ids) AS u(uid)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.user_id = u.uid
        AND pr.deleted_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_ids) AS u(uid)
    WHERE public.users_are_blocked_pair(v_me, u.uid)
  ) THEN
    RAISE EXCEPTION 'Cannot include blocked users in this group';
  END IF;

  v_active := public._count_active_members(p_conversation_id);
  IF v_active + COALESCE(array_length(v_ids, 1), 0) > c_max_active_members THEN
    RAISE EXCEPTION 'Group member limit is %', c_max_active_members;
  END IF;

  FOREACH v_uid IN ARRAY v_ids
  LOOP
    SELECT m.left_at
    INTO v_left_at
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = v_uid;

    IF FOUND THEN
      UPDATE public.conversation_members m
      SET
        left_at = NULL,
        role = 'member',
        unread_count = 0,
        joined_at = now()
      WHERE m.conversation_id = p_conversation_id
        AND m.user_id = v_uid
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
        p_conversation_id,
        v_uid,
        'member',
        0,
        now()
      );
    END IF;

    v_added := array_append(v_added, v_uid);
  END LOOP;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'added_user_ids', to_jsonb(v_added),
    'member_count', public._count_active_members(p_conversation_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.add_conversation_members(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_conversation_members(uuid, uuid[])
  TO authenticated, postgres, service_role;

COMMENT ON FUNCTION public.add_conversation_members(uuid, uuid[]) IS
  'Admin adds members; reactivation resets role/unread/joined_at; cap 200; actor-relative blocks.';

-- ---------------------------------------------------------------------------
-- accept_group_up_request — max 200 under conversation lock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_group_up_request(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  c_max_active_members integer := 200;
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
  TO authenticated, postgres, service_role;

COMMENT ON FUNCTION public.accept_group_up_request(uuid) IS
  'Host Accept → add/reactivate requester as member on EXISTING group conversation. Cap 200 under conversation lock.';

-- ---------------------------------------------------------------------------
-- request_group_up — refuse pending request when already at 200 active
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
  IF v_member_count >= 200 THEN
    RAISE EXCEPTION 'Group member limit is 200';
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

REVOKE ALL ON FUNCTION public.request_group_up(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_group_up(uuid)
  TO authenticated, postgres, service_role;

COMMENT ON FUNCTION public.request_group_up(uuid) IS
  'Requester Join for Group Up. Refuses when conversation already has 200 active members. Does not add membership.';

-- ---------------------------------------------------------------------------
-- Rollback plan (do NOT run unless reverting):
-- Restore prior live bodies (c_max / literal 100) from production preflight
-- 2026-09-27 or supabase/rollbacks/20261030120000_group_active_member_cap_100.sql
-- Keep REVOKE/GRANT as above (authenticated + postgres + service_role; no anon).
--
-- DO NOT APPLY THIS MIGRATION until explicitly approved.
-- Verification (read-only after apply):
--   SELECT pg_get_functiondef('public.create_group_conversation(text,uuid[])'::regprocedure);
--   Expect c_max_active_members := 200 and 'Group member limit is 200' in request_group_up.
-- ---------------------------------------------------------------------------
