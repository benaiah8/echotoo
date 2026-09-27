-- Group Up Phase G0 — Schema + persistent group foundation (local only).
-- Do NOT apply during Build without explicit approval.
--
-- Links group_up opportunities to persistent group conversations.
-- Creates group_up_requests (RPC-only). Raises shared group member cap 50 → 100.
-- Adds private host-only group bootstrap helper.
-- No Group Up product RPCs / UI / cron / Edge.

-- ---------------------------------------------------------------------------
-- 1) social_opportunities.conversation_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_opportunities
  ADD COLUMN IF NOT EXISTS conversation_id uuid
    REFERENCES public.conversations (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.social_opportunities.conversation_id IS
  'Persistent group conversation for kind=group_up. NULL for pair_up/open_plan. ON DELETE RESTRICT so Group Up history cannot orphan conversation_id under CHECK.';

-- Safe: no existing group_up rows
ALTER TABLE public.social_opportunities
  DROP CONSTRAINT IF EXISTS social_opportunities_group_up_conversation_check;

ALTER TABLE public.social_opportunities
  ADD CONSTRAINT social_opportunities_group_up_conversation_check
  CHECK (kind <> 'group_up' OR conversation_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2) Active Group Up uniqueness (renewal-compatible)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS social_opportunities_one_active_group_up
  ON public.social_opportunities (creator_id, source_post_id)
  WHERE kind = 'group_up' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS social_opportunities_one_active_group_up_conversation
  ON public.social_opportunities (conversation_id)
  WHERE kind = 'group_up'
    AND status = 'active'
    AND conversation_id IS NOT NULL;

COMMENT ON INDEX public.social_opportunities_one_active_group_up IS
  'One active Group Up discovery per creator + source.';
COMMENT ON INDEX public.social_opportunities_one_active_group_up_conversation IS
  'One active Group Up discovery per persistent group conversation. Closed/expired may share conversation_id.';

-- ---------------------------------------------------------------------------
-- 3) group_up_requests (RPC-only; no conversation_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_up_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL
    REFERENCES public.social_opportunities (id) ON DELETE CASCADE,
  requester_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('pending', 'accepted', 'withdrawn', 'declined', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS group_up_requests_one_unresolved
  ON public.group_up_requests (opportunity_id, requester_id)
  WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS group_up_requests_opportunity_status_created_idx
  ON public.group_up_requests (opportunity_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS group_up_requests_requester_opp_idx
  ON public.group_up_requests (requester_id, opportunity_id);

ALTER TABLE public.group_up_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.group_up_requests
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.group_up_requests IS
  'Group Up join requests. Pending/accepted uniqueness per (opportunity, requester). RPC-only. Conversation lives on social_opportunities.';

-- ---------------------------------------------------------------------------
-- 4) Shared group member cap 50 → 100 (authoritative create + add)
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
  c_max_active_members integer := 100;
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
  'Create group; creator admin; ≥2 others; max 100; actor-relative block checks only.';

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
  c_max_active_members integer := 100;
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

REVOKE ALL ON FUNCTION public.add_conversation_members(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_conversation_members(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.add_conversation_members(uuid, uuid[]) IS
  'Admin adds members; reactivation resets role/unread/joined_at; cap 100; actor-relative blocks.';

-- ---------------------------------------------------------------------------
-- 5) Host-only group bootstrap (private; Group Up G1 will call)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._create_host_only_group_conversation(
  p_creator_id uuid,
  p_title text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_title text;
  v_conv_id uuid;
BEGIN
  IF p_creator_id IS NULL THEN
    RAISE EXCEPTION 'Missing creator';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = p_creator_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  v_title := public._normalize_group_title(p_title);

  INSERT INTO public.conversations (kind, title, created_by)
  VALUES ('group', v_title, p_creator_id)
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
    p_creator_id,
    'admin',
    0,
    now()
  )
  ON CONFLICT (conversation_id, user_id) DO UPDATE
  SET
    left_at = NULL,
    role = 'admin',
    unread_count = 0,
    joined_at = now();

  RETURN v_conv_id;
END;
$function$;

REVOKE ALL ON FUNCTION public._create_host_only_group_conversation(uuid, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._create_host_only_group_conversation(uuid, text) IS
  'Private: create kind=group with creator as sole admin. For Group Up bootstrap. Not client-callable.';
