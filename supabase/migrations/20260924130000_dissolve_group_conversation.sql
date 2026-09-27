-- TRUE Delete group (soft dissolve) + Group Up creator-leave close.
-- LOCAL ONLY until explicitly applied. Do not auto-apply / deploy.
--
-- 1) conversations.dissolved_at
-- 2) dissolve_group_conversation (admin-only soft dissolve)
-- 3) leave_conversation closes active Group Up when its creator leaves
-- 4) create_group_up / renew_group_up never reuse dissolved / inactive-host conversations
-- 5) Narrow guards: _lock_group_conversation + messages INSERT trigger
--
-- Lock order (matches accept_group_up_request):
--   active Group Up opportunity rows FOR UPDATE → conversation FOR UPDATE
--   → close opportunities/requests → membership / dissolve mutations
--
-- Does NOT hard-delete messages/conversations.
-- Does NOT wire frontend Delete group UI.

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS dissolved_at timestamptz NULL;

COMMENT ON COLUMN public.conversations.dissolved_at IS
  'Soft Delete group timestamp. NULL = active. When set: no sends/member mutations; Group Up must not reuse this conversation_id.';

-- ---------------------------------------------------------------------------
-- 2) Helpers
-- ---------------------------------------------------------------------------

-- Lock active Group Up rows for a conversation (optional creator filter).
-- Call BEFORE conversation lock to match accept_group_up_request order.
CREATE OR REPLACE FUNCTION public._lock_active_group_ups_for_conversation(
  p_conversation_id uuid,
  p_creator_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF p_conversation_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.social_opportunities o
  WHERE o.kind = 'group_up'
    AND o.conversation_id = p_conversation_id
    AND o.status = 'active'
    AND (p_creator_id IS NULL OR o.creator_id = p_creator_id)
  FOR UPDATE;
END;
$function$;

REVOKE ALL ON FUNCTION public._lock_active_group_ups_for_conversation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._lock_active_group_ups_for_conversation(uuid, uuid) IS
  'Internal: FOR UPDATE active group_up rows for a conversation before conversation lock.';

-- Close active Group Up rows (+ pending requests). Optional creator filter.
-- Caller must already hold opportunity row locks when racing with accept.
CREATE OR REPLACE FUNCTION public._close_active_group_ups_for_conversation(
  p_conversation_id uuid,
  p_now timestamptz DEFAULT now(),
  p_creator_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_opp_id uuid;
BEGIN
  IF p_conversation_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_opp_id IN
    UPDATE public.social_opportunities o
    SET
      status = 'closed',
      closed_at = p_now
    WHERE o.kind = 'group_up'
      AND o.conversation_id = p_conversation_id
      AND o.status = 'active'
      AND (p_creator_id IS NULL OR o.creator_id = p_creator_id)
    RETURNING o.id
  LOOP
    UPDATE public.group_up_requests r
    SET
      status = 'closed',
      resolved_at = COALESCE(r.resolved_at, p_now),
      updated_at = p_now
    WHERE r.opportunity_id = v_opp_id
      AND r.status = 'pending';
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public._close_active_group_ups_for_conversation(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._close_active_group_ups_for_conversation(uuid, timestamptz, uuid) IS
  'Internal: close active group_up opportunities (and pending requests) for a conversation; optional creator filter.';

-- Reject dissolved groups for all RPCs that lock via this helper.
CREATE OR REPLACE FUNCTION public._lock_group_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_kind text;
  v_dissolved_at timestamptz;
BEGIN
  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
  END IF;

  SELECT c.kind, c.dissolved_at
  INTO v_kind, v_dissolved_at
  FROM public.conversations c
  WHERE c.id = p_conversation_id
  FOR UPDATE;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_kind <> 'group' THEN
    RAISE EXCEPTION 'Not a group conversation';
  END IF;

  IF v_dissolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Group has been deleted';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public._lock_group_conversation(uuid) IS
  'Lock kind=group conversation row; rejects dissolved groups.';

-- Messages cannot be inserted into a dissolved group (send_* defense).
CREATE OR REPLACE FUNCTION public.tg_reject_messages_on_dissolved_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id
      AND c.kind = 'group'
      AND c.dissolved_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Group has been deleted';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reject_messages_on_dissolved_group ON public.messages;
CREATE TRIGGER trg_reject_messages_on_dissolved_group
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_reject_messages_on_dissolved_group();

REVOKE ALL ON FUNCTION public.tg_reject_messages_on_dissolved_group()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) dissolve_group_conversation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dissolve_group_conversation(
  p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_kind text;
  v_dissolved_at timestamptz;
  v_now timestamptz := now();
  v_is_admin_record boolean := false;
  v_is_active_admin boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
  END IF;

  -- Lock order: opportunities → conversation (same as accept_group_up_request).
  PERFORM public._lock_active_group_ups_for_conversation(p_conversation_id, NULL);

  SELECT c.kind, c.dissolved_at
  INTO v_kind, v_dissolved_at
  FROM public.conversations c
  WHERE c.id = p_conversation_id
  FOR UPDATE;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_kind <> 'group' THEN
    RAISE EXCEPTION 'Not a group conversation';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = v_me
      AND m.role = 'admin'
  )
  INTO v_is_admin_record;

  IF NOT v_is_admin_record THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Retry after successful dissolve: historical admin row may already have left_at set.
  IF v_dissolved_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'conversation_id', p_conversation_id,
      'dissolved', true
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = v_me
      AND m.left_at IS NULL
      AND m.role = 'admin'
  )
  INTO v_is_active_admin;

  IF NOT v_is_active_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.conversations c
  SET
    dissolved_at = v_now,
    updated_at = v_now
  WHERE c.id = p_conversation_id
    AND c.dissolved_at IS NULL;

  PERFORM public._close_active_group_ups_for_conversation(
    p_conversation_id,
    v_now,
    NULL
  );

  UPDATE public.conversation_members m
  SET left_at = v_now
  WHERE m.conversation_id = p_conversation_id
    AND m.left_at IS NULL;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'dissolved', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dissolve_group_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dissolve_group_conversation(uuid) TO authenticated;

COMMENT ON FUNCTION public.dissolve_group_conversation(uuid) IS
  'Soft Delete group: set dissolved_at, close linked Group Ups, soft-leave all members. Active admin for first dissolve; historical admin membership allowed for idempotent retry.';

-- ---------------------------------------------------------------------------
-- 4) leave_conversation — close Group Up when its creator leaves
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
  v_now timestamptz := now();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock order: leaver-owned active opps → conversation.
  PERFORM public._lock_active_group_ups_for_conversation(p_conversation_id, v_me);
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

  -- Close active Group Up owned by the leaver; remaining members keep the chat.
  PERFORM public._close_active_group_ups_for_conversation(
    p_conversation_id,
    v_now,
    v_me
  );

  UPDATE public.conversation_members m
  SET left_at = v_now
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
  'Leave group; last admin auto-promotes; closes active Group Up owned by the leaver.';

-- ---------------------------------------------------------------------------
-- 5) create_group_up — reuse only if creator is currently an active member
-- ---------------------------------------------------------------------------
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
  v_dissolved_at timestamptz;
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
    SELECT c.dissolved_at
    INTO v_dissolved_at
    FROM public.conversations c
    WHERE c.id = v_row.conversation_id;

    IF v_dissolved_at IS NULL THEN
      RETURN jsonb_build_object(
        'opportunity', public._group_up_opportunity_json(v_row)
      );
    END IF;

    -- Active opp pointing at a dissolved conversation — close and continue.
    PERFORM public._lock_active_group_ups_for_conversation(
      v_row.conversation_id,
      v_me
    );
    PERFORM public._close_active_group_ups_for_conversation(
      v_row.conversation_id,
      now(),
      v_me
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

  -- Never reuse a dissolved conversation.
  IF v_conv_id IS NOT NULL THEN
    SELECT c.dissolved_at
    INTO v_dissolved_at
    FROM public.conversations c
    WHERE c.id = v_conv_id;

    IF v_dissolved_at IS NOT NULL THEN
      v_conv_id := NULL;
    END IF;
  END IF;

  -- Reuse ONLY if creator is currently an active member. No rejoin / no role reset.
  IF v_conv_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.conversation_members m
       WHERE m.conversation_id = v_conv_id
         AND m.user_id = v_me
         AND m.left_at IS NULL
     ) THEN
    v_conv_id := NULL;
  END IF;

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
  'Create or reuse active Group Up. Reuses a live conversation only when creator is an active member; never reuses dissolved; never rejoins/resets membership.';

-- ---------------------------------------------------------------------------
-- 6) renew_group_up — mint NEW conversation when dissolved or creator inactive
-- ---------------------------------------------------------------------------
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
  v_dissolved_at timestamptz;
  v_conv_title text;
  v_conv_description text;
  v_target_conv_id uuid;
  v_stale_id uuid;
  v_discoverable_until timestamptz;
  v_time_explicit boolean;
  v_now timestamptz := now();
  v_creator_active boolean := false;
  v_mint_new boolean := false;
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

  SELECT c.kind, c.dissolved_at, c.title, c.description
  INTO v_conv_kind, v_dissolved_at, v_conv_title, v_conv_description
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

  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = v_me
      AND m.left_at IS NULL
  )
  INTO v_creator_active;

  v_mint_new := (v_dissolved_at IS NOT NULL) OR (NOT v_creator_active);

  -- Dissolved OR creator no longer active: never reuse/rejoin old group.
  IF v_mint_new THEN
    PERFORM public._lock_active_group_ups_for_conversation(
      p_conversation_id,
      NULL
    );
    PERFORM public._close_active_group_ups_for_conversation(
      p_conversation_id,
      v_now,
      NULL
    );

    v_target_conv_id := public._create_host_only_group_conversation(
      v_me,
      COALESCE(NULLIF(btrim(v_conv_title), ''), 'Group'),
      COALESCE(v_description, v_conv_description)
    );

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
      v_target_conv_id,
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
  END IF;

  v_target_conv_id := p_conversation_id;

  -- Live path: creator is an active member. Lock active opps for this conversation.
  PERFORM 1
  FROM public.social_opportunities o
  WHERE o.kind = 'group_up'
    AND o.conversation_id = v_target_conv_id
    AND o.status = 'active'
  FOR UPDATE;

  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.kind = 'group_up'
    AND o.conversation_id = v_target_conv_id
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
      AND o.conversation_id = v_target_conv_id
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
    v_target_conv_id,
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
  'Renew Group Up. Live reuse only when creator is an active member; otherwise (or if dissolved) creates a NEW group conversation.';
