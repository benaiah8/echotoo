-- Group Up Phase G1 — create/manage RPCs (local only).
-- Do NOT apply during Build without explicit approval.
--
-- create_group_up, cancel, renew, own-state reads.
-- Concurrent create uses pg_advisory_xact_lock(creator, source).

-- ---------------------------------------------------------------------------
-- group_up_source_is_eligible (internal)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_up_source_is_eligible(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
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
              AND (btrim(elem))::timestamptz >= now()
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.group_up_source_is_eligible(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.group_up_source_is_eligible(uuid) IS
  'Internal Group Up source gate. Public published hangout/experience by public author; hangout needs upcoming date or valid recurrence. Not coupled to Discover.';

-- ---------------------------------------------------------------------------
-- create_group_up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_group_up(
  p_source_post_id uuid,
  p_description text
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
  v_description text;
  v_conv_id uuid;
  v_caption text;
  v_stale_id uuid;
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

  v_description := NULLIF(btrim(p_description), '');
  IF v_description IS NULL THEN
    RAISE EXCEPTION 'Description required';
  END IF;
  IF char_length(v_description) > c_description_max THEN
    RAISE EXCEPTION 'Description too long';
  END IF;

  -- Serialize concurrent creates for the same creator + source.
  PERFORM pg_advisory_xact_lock(
    hashtext('group_up_create'),
    hashtext(v_me::text || ':' || p_source_post_id::text)
  );

  -- Lock any existing group_up rows for this pair.
  PERFORM 1
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = p_source_post_id
    AND o.kind = 'group_up'
  FOR UPDATE;

  -- Reuse user-facing active in-window row (idempotent).
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
      'opportunity', jsonb_build_object(
        'id', v_row.id,
        'source_post_id', v_row.source_post_id,
        'creator_id', v_row.creator_id,
        'conversation_id', v_row.conversation_id,
        'status', v_row.status,
        'description', v_row.description,
        'discoverable_until', v_row.discoverable_until,
        'created_at', v_row.created_at,
        'closed_at', v_row.closed_at
      )
    );
  END IF;

  -- Expire stale active rows (past discoverable window) and close pending requests.
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

  -- Reuse persistent conversation from prior Group Up history when present.
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
    SELECT p.caption
    INTO v_caption
    FROM public.posts p
    WHERE p.id = p_source_post_id;

    v_conv_id := public._create_host_only_group_conversation(
      v_me,
      COALESCE(v_caption, '')
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
      discoverable_until
    )
    VALUES (
      'group_up',
      p_source_post_id,
      v_me,
      v_conv_id,
      'active',
      v_description,
      NULL,
      now() + interval '14 days'
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
    'opportunity', jsonb_build_object(
      'id', v_row.id,
      'source_post_id', v_row.source_post_id,
      'creator_id', v_row.creator_id,
      'conversation_id', v_row.conversation_id,
      'status', v_row.status,
      'description', v_row.description,
      'discoverable_until', v_row.discoverable_until,
      'created_at', v_row.created_at,
      'closed_at', v_row.closed_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_group_up(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_up(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_group_up(uuid, text) IS
  'Create or reuse active Group Up for eligible hangout/experience. Advisory lock prevents orphan host-only groups on concurrent create. Reuses prior conversation_id when renewing from source CTA.';

-- ---------------------------------------------------------------------------
-- get_my_group_up_for_source
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
    AND o.discoverable_until > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('opportunity', NULL);
  END IF;

  RETURN jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', v_row.id,
      'source_post_id', v_row.source_post_id,
      'creator_id', v_row.creator_id,
      'conversation_id', v_row.conversation_id,
      'status', v_row.status,
      'description', v_row.description,
      'discoverable_until', v_row.discoverable_until,
      'created_at', v_row.created_at,
      'closed_at', v_row.closed_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_group_up_for_source(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_group_up_for_source(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_my_group_up_for_source(uuid) IS
  'Caller user-facing active Group Up for a source. Does not require source eligibility.';

-- ---------------------------------------------------------------------------
-- get_my_group_ups_for_sources
-- ---------------------------------------------------------------------------
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
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'source_post_id', o.source_post_id,
        'creator_id', o.creator_id,
        'conversation_id', o.conversation_id,
        'status', o.status,
        'description', o.description,
        'discoverable_until', o.discoverable_until,
        'created_at', o.created_at,
        'closed_at', o.closed_at
      )
      ORDER BY o.source_post_id
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.kind = 'group_up'
    AND o.status = 'active'
    AND o.discoverable_until > now()
    AND o.source_post_id = ANY (v_ids);

  RETURN jsonb_build_object('opportunities', v_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_group_ups_for_sources(uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_group_ups_for_sources(uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.get_my_group_ups_for_sources(uuid[]) IS
  'Batch read caller active Group Ups for source posts. Sparse. Max 100 ids. No eligibility gate.';

-- ---------------------------------------------------------------------------
-- cancel_group_up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_group_up(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_row public.social_opportunities%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing opportunity';
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

  IF v_row.status = 'active' THEN
    UPDATE public.social_opportunities
    SET status = 'closed',
        closed_at = now()
    WHERE id = p_opportunity_id
    RETURNING * INTO v_row;
  END IF;

  UPDATE public.group_up_requests r
  SET status = 'closed',
      resolved_at = COALESCE(r.resolved_at, now()),
      updated_at = now()
  WHERE r.opportunity_id = p_opportunity_id
    AND r.status = 'pending';

  RETURN jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', v_row.id,
      'source_post_id', v_row.source_post_id,
      'creator_id', v_row.creator_id,
      'conversation_id', v_row.conversation_id,
      'status', v_row.status,
      'description', v_row.description,
      'discoverable_until', v_row.discoverable_until,
      'created_at', v_row.created_at,
      'closed_at', v_row.closed_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_group_up(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_group_up(uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_group_up(uuid) IS
  'Owner-only cancel: active Group Up → closed; pending requests → closed. Conversation persists.';

-- ---------------------------------------------------------------------------
-- renew_group_up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renew_group_up(
  p_conversation_id uuid,
  p_description text
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
      'opportunity', jsonb_build_object(
        'id', v_row.id,
        'source_post_id', v_row.source_post_id,
        'creator_id', v_row.creator_id,
        'conversation_id', v_row.conversation_id,
        'status', v_row.status,
        'description', v_row.description,
        'discoverable_until', v_row.discoverable_until,
        'created_at', v_row.created_at,
        'closed_at', v_row.closed_at
      )
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
    discoverable_until
  )
  VALUES (
    'group_up',
    v_hist.source_post_id,
    v_hist.creator_id,
    p_conversation_id,
    'active',
    v_description,
    NULL,
    now() + interval '14 days'
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', v_row.id,
      'source_post_id', v_row.source_post_id,
      'creator_id', v_row.creator_id,
      'conversation_id', v_row.conversation_id,
      'status', v_row.status,
      'description', v_row.description,
      'discoverable_until', v_row.discoverable_until,
      'created_at', v_row.created_at,
      'closed_at', v_row.closed_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.renew_group_up(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_group_up(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.renew_group_up(uuid, text) IS
  'Renew Group Up discovery on existing group conversation. New opportunity row; same conversation_id. Creator-only.';

-- ---------------------------------------------------------------------------
-- get_my_group_up_for_conversation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_group_up_for_conversation(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_row public.social_opportunities%ROWTYPE;
  v_hist public.social_opportunities%ROWTYPE;
  v_can_renew boolean := false;
  v_active_found boolean := false;
BEGIN
  IF v_me IS NULL OR p_conversation_id IS NULL THEN
    RETURN jsonb_build_object('opportunity', NULL, 'can_renew', false);
  END IF;

  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.kind = 'group_up'
    AND o.conversation_id = p_conversation_id
    AND o.status = 'active'
    AND o.discoverable_until > now()
  LIMIT 1;

  v_active_found := FOUND;

  SELECT *
  INTO v_hist
  FROM public.social_opportunities o
  WHERE o.kind = 'group_up'
    AND o.conversation_id = p_conversation_id
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND AND v_hist.creator_id = v_me AND NOT v_active_found THEN
    v_can_renew := public.group_up_source_is_eligible(v_hist.source_post_id);
  END IF;

  IF NOT v_active_found THEN
    RETURN jsonb_build_object(
      'opportunity', NULL,
      'can_renew', v_can_renew
    );
  END IF;

  RETURN jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', v_row.id,
      'source_post_id', v_row.source_post_id,
      'creator_id', v_row.creator_id,
      'conversation_id', v_row.conversation_id,
      'status', v_row.status,
      'description', v_row.description,
      'discoverable_until', v_row.discoverable_until,
      'created_at', v_row.created_at,
      'closed_at', v_row.closed_at
    ),
    'can_renew', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_group_up_for_conversation(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_group_up_for_conversation(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_my_group_up_for_conversation(uuid) IS
  'Active Group Up for a group conversation + can_renew flag for renewal UI gating.';
