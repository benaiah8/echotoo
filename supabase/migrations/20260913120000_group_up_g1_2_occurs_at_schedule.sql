-- Group Up G1.2 — optional occurs_at schedule + update_group_up_schedule.
-- Local only until explicitly applied.

-- ---------------------------------------------------------------------------
-- _group_up_opportunity_json (internal)
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
    'discoverable_until', o.discoverable_until,
    'created_at', o.created_at,
    'closed_at', o.closed_at
  );
$function$;

REVOKE ALL ON FUNCTION public._group_up_opportunity_json(public.social_opportunities)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signature cleanup — avoid PostgREST overload ambiguity
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_group_up(uuid, text);
DROP FUNCTION IF EXISTS public.renew_group_up(uuid, text);

-- ---------------------------------------------------------------------------
-- create_group_up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_group_up(
  p_source_post_id uuid,
  p_description text,
  p_occurs_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  c_description_max integer := 200;
  c_group_title_max integer := 80;
  v_me uuid := auth.uid();
  v_row public.social_opportunities%ROWTYPE;
  v_description text;
  v_conv_id uuid;
  v_caption text;
  v_stale_id uuid;
  v_discoverable_until timestamptz;
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

  IF p_occurs_at IS NOT NULL AND p_occurs_at <= now() THEN
    RAISE EXCEPTION 'Group Up time must be in the future';
  END IF;

  v_discoverable_until :=
    CASE
      WHEN p_occurs_at IS NULL THEN now() + interval '14 days'
      ELSE LEAST(now() + interval '14 days', p_occurs_at)
    END;

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

  -- Reuse user-facing active in-window row (idempotent; do not overwrite schedule).
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

    v_caption := btrim(COALESCE(v_caption, ''));
    IF v_caption = '' THEN
      v_caption := 'Group';
    ELSE
      v_caption := left(v_caption, c_group_title_max);
    END IF;

    v_conv_id := public._create_host_only_group_conversation(
      v_me,
      v_caption
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
      p_occurs_at,
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

REVOKE ALL ON FUNCTION public.create_group_up(uuid, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_up(uuid, text, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.create_group_up(uuid, text, timestamptz) IS
  'Create or reuse active Group Up for eligible hangout/experience. Optional occurs_at; discoverable_until = least(now()+14d, occurs_at). G1.1 caption truncation preserved.';

-- ---------------------------------------------------------------------------
-- renew_group_up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renew_group_up(
  p_conversation_id uuid,
  p_description text,
  p_occurs_at timestamptz DEFAULT NULL
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
    v_discoverable_until
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'opportunity', public._group_up_opportunity_json(v_row)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.renew_group_up(uuid, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_group_up(uuid, text, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.renew_group_up(uuid, text, timestamptz) IS
  'Renew Group Up discovery on existing group conversation. New opportunity row; same conversation_id. Optional occurs_at.';

-- ---------------------------------------------------------------------------
-- update_group_up_schedule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_group_up_schedule(
  p_opportunity_id uuid,
  p_occurs_at timestamptz DEFAULT NULL
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
        discoverable_until = LEAST(v_original_window_end, p_occurs_at)
    WHERE id = p_opportunity_id
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.social_opportunities
    SET occurs_at = NULL,
        discoverable_until = v_original_window_end
    WHERE id = p_opportunity_id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'opportunity', public._group_up_opportunity_json(v_row)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_group_up_schedule(uuid, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_group_up_schedule(uuid, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.update_group_up_schedule(uuid, timestamptz) IS
  'Creator-only: add, change, or clear Group Up schedule on active opportunity. Does not extend original 14-day window from created_at.';

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
    'opportunity', public._group_up_opportunity_json(v_row)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_group_up_for_source(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_group_up_for_source(uuid)
  TO authenticated;

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
    jsonb_agg(public._group_up_opportunity_json(o) ORDER BY o.source_post_id),
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
    'opportunity', public._group_up_opportunity_json(v_row)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_group_up(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_group_up(uuid) TO authenticated;

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
  v_renew_source_post_id uuid;
  v_renew_last_occurs_at timestamptz;
BEGIN
  IF v_me IS NULL OR p_conversation_id IS NULL THEN
    RETURN jsonb_build_object(
      'opportunity', NULL,
      'can_renew', false,
      'renew_source_post_id', NULL,
      'renew_last_occurs_at', NULL
    );
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
    IF v_can_renew THEN
      v_renew_source_post_id := v_hist.source_post_id;
      IF v_hist.occurs_at IS NOT NULL AND v_hist.occurs_at > now() THEN
        v_renew_last_occurs_at := v_hist.occurs_at;
      END IF;
    END IF;
  END IF;

  IF NOT v_active_found THEN
    RETURN jsonb_build_object(
      'opportunity', NULL,
      'can_renew', v_can_renew,
      'renew_source_post_id', v_renew_source_post_id,
      'renew_last_occurs_at', v_renew_last_occurs_at
    );
  END IF;

  RETURN jsonb_build_object(
    'opportunity', public._group_up_opportunity_json(v_row),
    'can_renew', false,
    'renew_source_post_id', NULL,
    'renew_last_occurs_at', NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_group_up_for_conversation(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_group_up_for_conversation(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_my_group_up_for_conversation(uuid) IS
  'Active Group Up for a group conversation + can_renew and renewal prefill hints when inactive.';
