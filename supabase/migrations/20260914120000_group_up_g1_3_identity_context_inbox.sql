-- Group Up G1.3 — explicit group identity, source context RPC, inbox COALESCE sort.
-- Local only until explicitly applied.

-- ---------------------------------------------------------------------------
-- list_my_conversations — sort empty groups by created_at (no fake messages)
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
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at DESC, t.created_at DESC),
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
      COALESCE(c.last_message_at, c.created_at) AS sort_at,
      CASE
        WHEN c.kind = 'group' THEN (
          SELECT COUNT(*)::integer
          FROM public.conversation_members cm
          WHERE cm.conversation_id = c.id
            AND cm.left_at IS NULL
        )
        ELSE NULL
      END AS member_count,
      CASE
        WHEN c.kind <> 'direct' THEN false
        WHEN c.last_message_at IS NULL THEN false
        WHEN CASE
          WHEN c.direct_user_low = v_me THEN c.direct_user_high
          WHEN c.direct_user_high = v_me THEN c.direct_user_low
          ELSE NULL
        END IS NULL THEN false
        WHEN NOT EXISTS (
          SELECT 1
          FROM public.messages msg
          WHERE msg.conversation_id = c.id
            AND msg.sender_user_id = CASE
              WHEN c.direct_user_low = v_me THEN c.direct_user_high
              ELSE c.direct_user_low
            END
            AND msg.message_kind IN ('text', 'shared_post')
        ) THEN false
        WHEN EXISTS (
          SELECT 1
          FROM public.messages msg
          WHERE msg.conversation_id = c.id
            AND msg.sender_user_id = v_me
            AND msg.message_kind IN ('text', 'shared_post')
        ) THEN false
        WHEN public.dm_direct_access_mode(
          CASE
            WHEN c.direct_user_low = v_me THEN c.direct_user_high
            ELSE c.direct_user_low
          END,
          v_me,
          c.id
        ) = 'request' THEN true
        ELSE false
      END AS is_request,
      m.notifications_muted
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
      AND NOT (
        c.kind = 'direct'
        AND public.users_are_blocked_pair(
          v_me,
          CASE
            WHEN c.direct_user_low = v_me THEN c.direct_user_high
            WHEN c.direct_user_high = v_me THEN c.direct_user_low
            ELSE NULL
          END
        )
      )
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
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
  'Inbox rows; sort by COALESCE(last_message_at, created_at); includes notifications_muted.';

-- ---------------------------------------------------------------------------
-- _create_host_only_group_conversation — title + optional description
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._create_host_only_group_conversation(uuid, text);

CREATE OR REPLACE FUNCTION public._create_host_only_group_conversation(
  p_creator_id uuid,
  p_title text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_title text;
  v_description text;
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
  v_description := public._normalize_group_description(p_description);

  INSERT INTO public.conversations (kind, title, description, created_by)
  VALUES ('group', v_title, v_description, p_creator_id)
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

REVOKE ALL ON FUNCTION public._create_host_only_group_conversation(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._create_host_only_group_conversation(uuid, text, text) IS
  'Private: create kind=group with creator as sole admin. Explicit title + optional description.';

-- ---------------------------------------------------------------------------
-- create_group_up — explicit title + description (drop 3-arg overload)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_group_up(uuid, text, timestamptz);

CREATE OR REPLACE FUNCTION public.create_group_up(
  p_source_post_id uuid,
  p_title text,
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
  v_title text;
  v_description text;
  v_conv_id uuid;
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
    RETURN jsonb_build_object(
      'opportunity', public._group_up_opportunity_json(v_row)
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

REVOKE ALL ON FUNCTION public.create_group_up(uuid, text, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_up(uuid, text, text, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.create_group_up(uuid, text, text, timestamptz) IS
  'Create or reuse active Group Up. Explicit title + description; optional occurs_at. Reuse conv does not overwrite title/description.';

-- ---------------------------------------------------------------------------
-- get_my_group_up_for_conversation — membership gate + source_context
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
  v_conv public.conversations%ROWTYPE;
  v_post public.posts%ROWTYPE;
  v_can_renew boolean := false;
  v_active_found boolean := false;
  v_renew_source_post_id uuid;
  v_renew_last_occurs_at timestamptz;
  v_source_post_id uuid;
  v_group_up_occurs_at timestamptz;
  v_source_context jsonb := NULL;
  v_hist_found boolean := false;
BEGIN
  IF v_me IS NULL OR p_conversation_id IS NULL THEN
    RETURN jsonb_build_object(
      'opportunity', NULL,
      'can_renew', false,
      'renew_source_post_id', NULL,
      'renew_last_occurs_at', NULL,
      'conversation_title', NULL,
      'conversation_description', NULL,
      'source_context', NULL
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = p_conversation_id
      AND cm.user_id = v_me
      AND cm.left_at IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'opportunity', NULL,
      'can_renew', false,
      'renew_source_post_id', NULL,
      'renew_last_occurs_at', NULL,
      'conversation_title', NULL,
      'conversation_description', NULL,
      'source_context', NULL
    );
  END IF;

  SELECT *
  INTO v_conv
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

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

  v_hist_found := FOUND;

  IF v_hist_found AND v_hist.creator_id = v_me AND NOT v_active_found THEN
    v_can_renew := public.group_up_source_is_eligible(v_hist.source_post_id);
    IF v_can_renew THEN
      v_renew_source_post_id := v_hist.source_post_id;
      IF v_hist.occurs_at IS NOT NULL AND v_hist.occurs_at > now() THEN
        v_renew_last_occurs_at := v_hist.occurs_at;
      END IF;
    END IF;
  END IF;

  IF v_active_found THEN
    v_source_post_id := v_row.source_post_id;
    v_group_up_occurs_at := v_row.occurs_at;
  ELSIF v_hist_found THEN
    v_source_post_id := v_hist.source_post_id;
    v_group_up_occurs_at := v_hist.occurs_at;
  END IF;

  IF v_source_post_id IS NOT NULL THEN
    SELECT *
    INTO v_post
    FROM public.posts p
    WHERE p.id = v_source_post_id;

    IF FOUND AND v_post.type IN ('hangout', 'experience') THEN
      v_source_context := jsonb_build_object(
        'source_post_id', v_source_post_id,
        'post_type', v_post.type,
        'caption', v_post.caption,
        'is_recurring', v_post.is_recurring,
        'selected_dates', v_post.selected_dates,
        'recurrence_days', v_post.recurrence_days,
        'group_up_occurs_at', v_group_up_occurs_at
      );
    END IF;
  END IF;

  IF NOT v_active_found THEN
    RETURN jsonb_build_object(
      'opportunity', NULL,
      'can_renew', v_can_renew,
      'renew_source_post_id', v_renew_source_post_id,
      'renew_last_occurs_at', v_renew_last_occurs_at,
      'conversation_title', v_conv.title,
      'conversation_description', v_conv.description,
      'source_context', v_source_context
    );
  END IF;

  RETURN jsonb_build_object(
    'opportunity', public._group_up_opportunity_json(v_row),
    'can_renew', false,
    'renew_source_post_id', NULL,
    'renew_last_occurs_at', NULL,
    'conversation_title', v_conv.title,
    'conversation_description', v_conv.description,
    'source_context', v_source_context
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_group_up_for_conversation(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_group_up_for_conversation(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_my_group_up_for_conversation(uuid) IS
  'Group Up state for conversation: opportunity, renew hints, conversation identity, source_context from linked post.';
