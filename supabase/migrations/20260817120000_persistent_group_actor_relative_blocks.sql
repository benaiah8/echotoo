-- Corrective: group create/add block checks are actor-relative only.
-- LOCAL until explicitly applied. Does not edit 20260816120000 history.
-- DM block enforcement is untouched. Helper _assert_no_blocks_between_sets left in place.

-- ---------------------------------------------------------------------------
-- create_group_conversation: replace all-pairs block matrix with actor↔candidate
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
  c_max_active_members integer := 50;
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

  -- Actor-relative only: reject if creator is blocked with any selected member.
  -- Do not reject because two selected third parties are blocked with each other.
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

REVOKE ALL ON FUNCTION public.create_group_conversation(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_group_conversation(text, uuid[]) IS
  'Create group; creator admin; ≥2 others; max 50; actor-relative block checks only.';

-- ---------------------------------------------------------------------------
-- add_conversation_members: replace candidate×actives / candidate×candidate
-- with actor↔candidate only (admin performing the add).
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
  c_max_active_members integer := 50;
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

  -- Actor-relative only: reject if admin is blocked with any net-new/reactivated candidate.
  -- Do not reject for candidate↔existing-member or candidate↔candidate blocks.
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
      -- Fresh membership period on reactivation.
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

REVOKE ALL ON FUNCTION public.add_conversation_members(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_conversation_members(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.add_conversation_members(uuid, uuid[]) IS
  'Admin adds members; reactivation resets role/unread/joined_at; cap 50; actor-relative blocks.';
