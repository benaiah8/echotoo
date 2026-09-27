-- Phase 5A: persistent group membership foundation (additive).
-- LOCAL only until explicitly applied. No Realtime publication / UI / Group Up.

-- ---------------------------------------------------------------------------
-- Schema: conversation_members.role
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversation_members_role_check'
      AND conrelid = 'public.conversation_members'::regclass
  ) THEN
    ALTER TABLE public.conversation_members
      ADD CONSTRAINT conversation_members_role_check
      CHECK (role IN ('admin', 'member'));
  END IF;
END
$$;

COMMENT ON COLUMN public.conversation_members.role IS
  'Phase 5A: admin | member. Authority for groups; directs ignore role.';

-- Cap constant lives inside RPCs as c_max_active_members := 50.

-- ---------------------------------------------------------------------------
-- Internal helpers (not granted to clients)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._lock_group_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_kind text;
BEGIN
  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
  END IF;

  SELECT c.kind
  INTO v_kind
  FROM public.conversations c
  WHERE c.id = p_conversation_id
  FOR UPDATE;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_kind <> 'group' THEN
    RAISE EXCEPTION 'Not a group conversation';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public._count_active_members(p_conversation_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT COUNT(*)::integer
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.left_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public._ensure_group_has_admin(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_active integer;
  v_admins integer;
  v_promote uuid;
BEGIN
  SELECT COUNT(*)::integer
  INTO v_active
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.left_at IS NULL;

  IF v_active = 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_admins
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.left_at IS NULL
    AND m.role = 'admin';

  IF v_admins > 0 THEN
    RETURN;
  END IF;

  SELECT m.user_id
  INTO v_promote
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.left_at IS NULL
  ORDER BY m.joined_at ASC, m.user_id ASC
  LIMIT 1;

  IF v_promote IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.conversation_members m
  SET role = 'admin'
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_promote
    AND m.left_at IS NULL;
END;
$function$;

-- Reject if any pair between set A and set B is blocked (A and B may overlap).
CREATE OR REPLACE FUNCTION public._assert_no_blocks_between_sets(
  p_set_a uuid[],
  p_set_b uuid[]
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_set_a, ARRAY[]::uuid[])) AS a(uid)
    CROSS JOIN unnest(COALESCE(p_set_b, ARRAY[]::uuid[])) AS b(uid)
    WHERE a.uid IS DISTINCT FROM b.uid
      AND public.users_are_blocked_pair(a.uid, b.uid)
  ) THEN
    RAISE EXCEPTION 'Cannot include blocked users in this group';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public._assert_active_group_admin(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = p_user_id
      AND m.left_at IS NULL
      AND m.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public._normalize_group_title(p_title text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_title text;
BEGIN
  v_title := btrim(COALESCE(p_title, ''));
  IF length(v_title) = 0 THEN
    RAISE EXCEPTION 'Group title is required';
  END IF;
  IF length(v_title) > 80 THEN
    RAISE EXCEPTION 'Group title is too long';
  END IF;
  RETURN v_title;
END;
$function$;

REVOKE ALL ON FUNCTION public._lock_group_conversation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._count_active_members(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ensure_group_has_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assert_no_blocks_between_sets(uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assert_active_group_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._normalize_group_title(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_group_conversation
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

  -- No blocked pairs within {me} ∪ members.
  PERFORM public._assert_no_blocks_between_sets(
    array_prepend(v_me, v_ids),
    array_prepend(v_me, v_ids)
  );

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
  'Phase 5A: create group conversation; creator admin; ≥2 others; max 50; block-safe.';

-- ---------------------------------------------------------------------------
-- add_conversation_members
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
  v_existing_active uuid[];
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

  SELECT COALESCE(array_agg(m.user_id), ARRAY[]::uuid[])
  INTO v_existing_active
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.left_at IS NULL;

  -- Block vs current actives and within new batch.
  PERFORM public._assert_no_blocks_between_sets(v_ids, v_existing_active);
  PERFORM public._assert_no_blocks_between_sets(v_ids, v_ids);

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
  'Phase 5A: admin adds members; reactivation resets role/unread/joined_at; cap 50 with row lock.';

-- ---------------------------------------------------------------------------
-- remove_conversation_member
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_conversation_member(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_target_role text;
  v_promote uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user';
  END IF;

  IF p_user_id = v_me THEN
    RAISE EXCEPTION 'Use leave_conversation to leave';
  END IF;

  PERFORM public._lock_group_conversation(p_conversation_id);
  PERFORM public._ensure_group_has_admin(p_conversation_id);
  PERFORM public._assert_active_group_admin(p_conversation_id, v_me);

  SELECT m.role
  INTO v_target_role
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = p_user_id
    AND m.left_at IS NULL;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_target_role = 'admin' THEN
    -- Ensure another admin remains (or promote before remove).
    IF NOT EXISTS (
      SELECT 1
      FROM public.conversation_members m
      WHERE m.conversation_id = p_conversation_id
        AND m.left_at IS NULL
        AND m.role = 'admin'
        AND m.user_id <> p_user_id
    ) THEN
      SELECT m.user_id
      INTO v_promote
      FROM public.conversation_members m
      WHERE m.conversation_id = p_conversation_id
        AND m.left_at IS NULL
        AND m.user_id <> p_user_id
      ORDER BY m.joined_at ASC, m.user_id ASC
      LIMIT 1;

      IF v_promote IS NULL THEN
        RAISE EXCEPTION 'Cannot remove the last member';
      END IF;

      UPDATE public.conversation_members m
      SET role = 'admin'
      WHERE m.conversation_id = p_conversation_id
        AND m.user_id = v_promote
        AND m.left_at IS NULL;
    END IF;
  END IF;

  UPDATE public.conversation_members m
  SET left_at = now()
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = p_user_id
    AND m.left_at IS NULL;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'removed_user_id', p_user_id,
    'member_count', public._count_active_members(p_conversation_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_conversation_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_conversation_member(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_conversation_member(uuid, uuid) IS
  'Phase 5A: admin removes another member; preserves ≥1 admin when others remain.';

-- ---------------------------------------------------------------------------
-- leave_conversation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_conversation(
  p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_role text;
  v_other_admins integer;
  v_other_actives integer;
  v_promote uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public._lock_group_conversation(p_conversation_id);
  PERFORM public._ensure_group_has_admin(p_conversation_id);

  SELECT m.role
  INTO v_role
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_me
    AND m.left_at IS NULL;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_other_admins
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.left_at IS NULL
    AND m.role = 'admin'
    AND m.user_id <> v_me;

  SELECT COUNT(*)::integer
  INTO v_other_actives
  FROM public.conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.left_at IS NULL
    AND m.user_id <> v_me;

  IF v_role = 'admin' AND v_other_admins = 0 AND v_other_actives > 0 THEN
    SELECT m.user_id
    INTO v_promote
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.left_at IS NULL
      AND m.user_id <> v_me
    ORDER BY m.joined_at ASC, m.user_id ASC
    LIMIT 1;

    IF v_promote IS NOT NULL THEN
      UPDATE public.conversation_members m
      SET role = 'admin'
      WHERE m.conversation_id = p_conversation_id
        AND m.user_id = v_promote
        AND m.left_at IS NULL;
    END IF;
  END IF;

  UPDATE public.conversation_members m
  SET left_at = now()
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_me
    AND m.left_at IS NULL;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'left', true,
    'member_count', public._count_active_members(p_conversation_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.leave_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_conversation(uuid) TO authenticated;

COMMENT ON FUNCTION public.leave_conversation(uuid) IS
  'Phase 5A: leave group; last admin auto-promotes longest-tenured other member.';

-- ---------------------------------------------------------------------------
-- rename_group_conversation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rename_group_conversation(
  p_conversation_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_title text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_title := public._normalize_group_title(p_title);

  PERFORM public._lock_group_conversation(p_conversation_id);
  PERFORM public._ensure_group_has_admin(p_conversation_id);
  PERFORM public._assert_active_group_admin(p_conversation_id, v_me);

  UPDATE public.conversations c
  SET
    title = v_title,
    updated_at = now()
  WHERE c.id = p_conversation_id;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'title', v_title
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rename_group_conversation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_group_conversation(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rename_group_conversation(uuid, text) IS
  'Phase 5A: admin renames group title (max 80).';

-- ---------------------------------------------------------------------------
-- list_conversation_members
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_conversation_members(
  p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_kind text;
  v_rows jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
  END IF;

  SELECT c.kind
  INTO v_kind
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_kind <> 'group' THEN
    RAISE EXCEPTION 'Not a group conversation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = v_me
      AND m.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', t.user_id,
        'role', t.role,
        'joined_at', t.joined_at,
        'display_name', t.display_name,
        'username', t.username,
        'avatar_url', t.avatar_url
      )
      ORDER BY
        CASE WHEN t.role = 'admin' THEN 0 ELSE 1 END,
        t.joined_at ASC,
        t.user_id ASC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      m.user_id,
      m.role,
      m.joined_at,
      pr.display_name,
      pr.username,
      pr.avatar_url
    FROM public.conversation_members m
    LEFT JOIN public.profiles pr
      ON pr.user_id = m.user_id
      AND pr.deleted_at IS NULL
    WHERE m.conversation_id = p_conversation_id
      AND m.left_at IS NULL
  ) t;

  RETURN jsonb_build_object(
    'members', v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_conversation_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_conversation_members(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_conversation_members(uuid) IS
  'Phase 5A: active group members with profile peek; caller must be active member.';

-- ---------------------------------------------------------------------------
-- list_my_conversations: add member_count for groups
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_conversations(
  p_limit integer DEFAULT 40
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
  v_rows jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 50);

  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_last_message_at DESC NULLS LAST, t.created_at DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      c.id AS conversation_id,
      c.kind,
      CASE
        WHEN c.kind = 'direct' AND c.direct_user_low = v_me THEN c.direct_user_high
        WHEN c.kind = 'direct' AND c.direct_user_high = v_me THEN c.direct_user_low
        ELSE NULL
      END AS other_user_id,
      pr.display_name,
      pr.username,
      pr.avatar_url,
      c.title,
      c.last_message_at,
      c.last_message_preview,
      c.last_message_sender_id,
      m.unread_count,
      (c.last_message_sender_id IS NOT NULL AND c.last_message_sender_id = v_me) AS is_last_from_me,
      c.created_at,
      c.last_message_at AS sort_last_message_at,
      CASE
        WHEN c.kind = 'group' THEN (
          SELECT COUNT(*)::integer
          FROM public.conversation_members cm
          WHERE cm.conversation_id = c.id
            AND cm.left_at IS NULL
        )
        ELSE NULL
      END AS member_count
    FROM public.conversation_members m
    JOIN public.conversations c ON c.id = m.conversation_id
    LEFT JOIN public.profiles pr
      ON pr.user_id = CASE
        WHEN c.kind = 'direct' AND c.direct_user_low = v_me THEN c.direct_user_high
        WHEN c.kind = 'direct' AND c.direct_user_high = v_me THEN c.direct_user_low
        ELSE NULL
      END
      AND pr.deleted_at IS NULL
    WHERE m.user_id = v_me
      AND m.left_at IS NULL
    ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'conversations', v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_conversations(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_conversations(integer) TO authenticated;

COMMENT ON FUNCTION public.list_my_conversations(integer) IS
  'Phase 3/5A: inbox rows with partner peek, unread, last-message summary; group member_count.';
