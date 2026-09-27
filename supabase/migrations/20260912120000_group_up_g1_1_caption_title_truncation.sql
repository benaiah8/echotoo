-- Group Up G1.1 — truncate source caption before group conversation title normalization.
-- Local only until explicitly applied. Patches create_group_up only.

-- ---------------------------------------------------------------------------
-- create_group_up — safe caption → group title derivation
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
  c_group_title_max integer := 80;
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
  'Create or reuse active Group Up for eligible hangout/experience. Advisory lock prevents orphan host-only groups on concurrent create. Reuses prior conversation_id when renewing from source CTA. Source caption is trimmed and truncated to the group title limit before conversation bootstrap.';
