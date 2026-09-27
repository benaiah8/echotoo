-- Phase 8F.3 — Persistent centered match-context messages (local only).
-- Do NOT apply during Build without explicit approval.
--
-- Extends messages with message_kind = match_context.
-- Inserted from accept_open_plan_request / complete_pair_up_match.
-- No unread bump, no dm_push_outbox.

-- ---------------------------------------------------------------------------
-- 1) Kind shape CHECK — keep text / shared_post intact; add match_context
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_kind_shape_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_kind_shape_check CHECK (
    (
      message_kind = 'text'
      AND reference_type IS NULL
      AND reference_id IS NULL
      AND reference_snapshot IS NULL
      AND length(btrim(body)) > 0
    )
    OR (
      message_kind = 'shared_post'
      AND reference_type = 'post'
      AND reference_id IS NOT NULL
      AND reference_snapshot IS NOT NULL
      AND jsonb_typeof(reference_snapshot) = 'object'
    )
    OR (
      message_kind = 'match_context'
      AND reference_type IN ('open_plan_request', 'pair_up_match')
      AND reference_id IS NOT NULL
      AND reference_snapshot IS NOT NULL
      AND jsonb_typeof(reference_snapshot) = 'object'
    )
  );

COMMENT ON COLUMN public.messages.message_kind IS
  'text | shared_post | match_context.';

-- ---------------------------------------------------------------------------
-- 2) Idempotency: one match_context per conversation + reference
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS messages_match_context_uniq
  ON public.messages (conversation_id, message_kind, reference_type, reference_id)
  WHERE message_kind = 'match_context';

-- ---------------------------------------------------------------------------
-- 3) Shared insert helper (private to SECURITY DEFINER callers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_match_context_message(
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_reference_type text,
  p_reference_id uuid,
  p_source_post_id uuid,
  p_occurs_at timestamptz DEFAULT NULL,
  p_preview text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_caption text := '';
  v_subtype text;
  v_preview text;
  v_body text;
  v_snapshot jsonb;
  v_msg_id uuid;
  v_created_at timestamptz;
BEGIN
  IF p_conversation_id IS NULL
     OR p_actor_user_id IS NULL
     OR p_reference_id IS NULL
     OR p_source_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing match_context insert args';
  END IF;

  IF p_reference_type = 'open_plan_request' THEN
    v_subtype := 'open_plan_match';
  ELSIF p_reference_type = 'pair_up_match' THEN
    v_subtype := 'pair_up_match';
  ELSE
    RAISE EXCEPTION 'Invalid match_context reference_type: %', p_reference_type;
  END IF;

  SELECT COALESCE(p.caption, '')
  INTO v_caption
  FROM public.posts p
  WHERE p.id = p_source_post_id;

  IF NOT FOUND THEN
    v_caption := '';
  END IF;

  v_preview := COALESCE(NULLIF(btrim(COALESCE(p_preview, '')), ''), '');
  v_body := v_preview;

  v_snapshot := jsonb_build_object(
    'v', 1,
    'subtype', v_subtype,
    'source_post_id', p_source_post_id,
    'caption', v_caption,
    'occurs_at', to_jsonb(p_occurs_at)
  );

  INSERT INTO public.messages (
    conversation_id,
    sender_user_id,
    body,
    client_message_id,
    message_kind,
    reference_type,
    reference_id,
    reference_snapshot
  )
  VALUES (
    p_conversation_id,
    p_actor_user_id,
    v_body,
    gen_random_uuid(),
    'match_context',
    p_reference_type,
    p_reference_id,
    v_snapshot
  )
  ON CONFLICT (conversation_id, message_kind, reference_type, reference_id)
    WHERE message_kind = 'match_context'
  DO NOTHING
  RETURNING id, created_at INTO v_msg_id, v_created_at;

  IF v_msg_id IS NULL THEN
    RETURN;
  END IF;

  -- Conversation metadata only when a NEW row was inserted. No unread / push.
  UPDATE public.conversations c
  SET
    last_message_at = v_created_at,
    last_message_preview = left(
      COALESCE(NULLIF(v_preview, ''), 'Match'),
      200
    ),
    last_message_sender_id = p_actor_user_id,
    updated_at = now()
  WHERE c.id = p_conversation_id
    AND (
      c.last_message_at IS NULL
      OR c.last_message_at <= v_created_at
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.insert_match_context_message(
  uuid, uuid, text, uuid, uuid, timestamptz, text
) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.insert_match_context_message(
  uuid, uuid, text, uuid, uuid, timestamptz, text
) IS
  'Idempotent match_context message insert. Updates conversation preview only on new row. No unread/push.';

-- ---------------------------------------------------------------------------
-- 4) accept_open_plan_request — insert match_context (self-heal on re-accept)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_open_plan_request(
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
  v_req public.open_plan_requests%ROWTYPE;
  v_other uuid;
  v_low uuid;
  v_high uuid;
  v_conv_id uuid;
  v_plan_valid boolean;
  v_repair boolean := false;
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

  -- Preliminary unlocked lookup (lock-order only; never authorize from this).
  SELECT r.opportunity_id
  INTO v_opp_id
  FROM public.open_plan_requests r
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open Plan request not found';
  END IF;

  -- 1) Lock opportunity first
  SELECT *
  INTO v_opp
  FROM public.social_opportunities o
  WHERE o.id = v_opp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open Plan not found';
  END IF;

  -- 2) Lock request second; revalidate ownership of opportunity
  SELECT *
  INTO v_req
  FROM public.open_plan_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open Plan request not found';
  END IF;

  IF v_req.opportunity_id <> v_opp.id THEN
    RAISE EXCEPTION 'Open Plan request not found';
  END IF;

  IF v_opp.kind <> 'open_plan' THEN
    RAISE EXCEPTION 'Not an Open Plan';
  END IF;

  IF v_opp.creator_id <> v_me THEN
    RAISE EXCEPTION 'Not the Open Plan owner';
  END IF;

  -- Idempotent accepted with usable DM — self-heal missing match_context
  IF v_req.status = 'accepted' AND v_req.conversation_id IS NOT NULL THEN
    PERFORM public.insert_match_context_message(
      v_req.conversation_id,
      v_me,
      'open_plan_request',
      v_req.id,
      v_opp.source_post_id,
      v_opp.occurs_at,
      'You matched on an Open Plan'
    );

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
      'conversation_id', v_req.conversation_id
    );
  END IF;

  IF v_req.status = 'accepted' AND v_req.conversation_id IS NULL THEN
    -- Repair path: accepted without conversation_id — create DM then stamp.
    v_repair := true;
  ELSIF v_req.status IN ('withdrawn', 'declined', 'closed') THEN
    RAISE EXCEPTION 'Open Plan request is not pending';
  ELSIF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Open Plan request is not pending';
  END IF;

  v_plan_valid :=
    v_opp.status = 'active'
    AND v_opp.discoverable_until > now()
    AND v_opp.occurs_at IS NOT NULL
    AND v_opp.occurs_at > now();

  IF NOT v_repair AND NOT v_plan_valid THEN
    UPDATE public.open_plan_requests
    SET status = 'closed',
        resolved_at = now(),
        updated_at = now()
    WHERE id = v_req.id
    RETURNING * INTO v_req;

    RETURN jsonb_build_object(
      'accepted', false,
      'reason', 'plan_unavailable',
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'updated_at', v_req.updated_at,
        'resolved_at', v_req.resolved_at
      ),
      'conversation_id', NULL
    );
  END IF;

  -- Repair of accepted-without-DM still requires people validation; plan may be past.
  v_other := v_req.requester_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_other
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_other) THEN
    RAISE EXCEPTION 'Cannot accept this Open Plan request';
  END IF;

  IF v_me < v_other THEN
    v_low := v_me;
    v_high := v_other;
  ELSE
    v_low := v_other;
    v_high := v_me;
  END IF;

  INSERT INTO public.conversations (
    kind,
    created_by,
    direct_user_low,
    direct_user_high
  )
  VALUES (
    'direct',
    v_me,
    v_low,
    v_high
  )
  ON CONFLICT (direct_user_low, direct_user_high) DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NULL THEN
    SELECT c.id
    INTO v_conv_id
    FROM public.conversations c
    WHERE c.kind = 'direct'
      AND c.direct_user_low = v_low
      AND c.direct_user_high = v_high;

    IF v_conv_id IS NULL THEN
      RAISE EXCEPTION 'Failed to resolve direct conversation';
    END IF;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conv_id, v_me)
  ON CONFLICT (conversation_id, user_id) DO UPDATE
  SET left_at = NULL;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conv_id, v_other)
  ON CONFLICT (conversation_id, user_id) DO UPDATE
  SET left_at = NULL;

  PERFORM public.dm_grant_direct_access(
    v_me, v_other, 'full', 'open_plan', p_request_id, NULL
  );
  PERFORM public.dm_grant_direct_access(
    v_other, v_me, 'full', 'open_plan', p_request_id, NULL
  );

  UPDATE public.open_plan_requests
  SET status = 'accepted',
      resolved_at = COALESCE(resolved_at, now()),
      updated_at = now(),
      conversation_id = v_conv_id
  WHERE id = v_req.id
  RETURNING * INTO v_req;

  -- Do not close or mutate the Open Plan opportunity.

  PERFORM public.insert_match_context_message(
    v_conv_id,
    v_me,
    'open_plan_request',
    v_req.id,
    v_opp.source_post_id,
    v_opp.occurs_at,
    'You matched on an Open Plan'
  );

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
    'conversation_id', v_conv_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_open_plan_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_open_plan_request(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.accept_open_plan_request(uuid) IS
  'Creator Accept → canonical direct DM + idempotent match_context. Does not close Open Plan.';

-- ---------------------------------------------------------------------------
-- 5) complete_pair_up_match — insert match_context after mutual complete
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_pair_up_match(
  p_to_opportunity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_to public.social_opportunities%ROWTYPE;
  v_from public.social_opportunities%ROWTYPE;
  v_from_id uuid;
  v_to_id uuid;
  v_other uuid;
  v_low uuid;
  v_high uuid;
  v_conv_id uuid;
  v_created boolean := false;
  v_has_outgoing boolean := false;
  v_has_incoming boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_to_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing target opportunity';
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
  INTO v_to
  FROM public.social_opportunities o
  WHERE o.id = p_to_opportunity_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target opportunity not found';
  END IF;

  IF v_to.kind <> 'pair_up'
     OR v_to.status <> 'active'
     OR v_to.discoverable_until <= now() THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF v_to.creator_id = v_me THEN
    RAISE EXCEPTION 'Cannot complete a match with yourself';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_to.creator_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  SELECT *
  INTO v_from
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = v_to.source_post_id
    AND o.kind = 'pair_up'
    AND o.status = 'active'
    AND o.discoverable_until > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not in pool';
  END IF;

  IF NOT public.people_source_is_eligible(v_to.source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_to.creator_id) THEN
    RAISE EXCEPTION 'Cannot Pair Up with this user';
  END IF;

  v_from_id := v_from.id;
  v_to_id := v_to.id;

  PERFORM o.id
  FROM public.social_opportunities o
  WHERE o.id IN (v_from_id, v_to_id)
  ORDER BY o.id
  FOR UPDATE;

  SELECT *
  INTO v_from
  FROM public.social_opportunities o
  WHERE o.id = v_from_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  SELECT *
  INTO v_to
  FROM public.social_opportunities o
  WHERE o.id = v_to_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF v_from.kind <> 'pair_up'
     OR v_from.status <> 'active'
     OR v_from.discoverable_until <= now()
     OR v_from.creator_id <> v_me
     OR v_to.kind <> 'pair_up'
     OR v_to.status <> 'active'
     OR v_to.discoverable_until <= now()
     OR v_to.creator_id = v_me
     OR v_from.source_post_id <> v_to.source_post_id
     OR NOT public.people_source_is_eligible(v_to.source_post_id)
     OR public.users_are_blocked_pair(v_me, v_to.creator_id) THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_me
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_to.creator_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_from_id
      AND i.to_opportunity_id = v_to_id
  )
  INTO v_has_outgoing;

  SELECT EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_to_id
      AND i.to_opportunity_id = v_from_id
  )
  INTO v_has_incoming;

  IF NOT v_has_outgoing OR NOT v_has_incoming THEN
    RAISE EXCEPTION 'Not a mutual Pair Up';
  END IF;

  v_other := v_to.creator_id;

  IF v_me < v_other THEN
    v_low := v_me;
    v_high := v_other;
  ELSE
    v_low := v_other;
    v_high := v_me;
  END IF;

  INSERT INTO public.conversations (
    kind,
    created_by,
    direct_user_low,
    direct_user_high
  )
  VALUES (
    'direct',
    v_me,
    v_low,
    v_high
  )
  ON CONFLICT (direct_user_low, direct_user_high) DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NOT NULL THEN
    v_created := true;
  ELSE
    SELECT c.id
    INTO v_conv_id
    FROM public.conversations c
    WHERE c.kind = 'direct'
      AND c.direct_user_low = v_low
      AND c.direct_user_high = v_high;

    IF v_conv_id IS NULL THEN
      RAISE EXCEPTION 'Failed to resolve direct conversation';
    END IF;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conv_id, v_me)
  ON CONFLICT (conversation_id, user_id) DO UPDATE
  SET left_at = NULL;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conv_id, v_other)
  ON CONFLICT (conversation_id, user_id) DO UPDATE
  SET left_at = NULL;

  PERFORM public.dm_grant_direct_access(v_me, v_other, 'full', 'pair_up', NULL, NULL);
  PERFORM public.dm_grant_direct_access(v_other, v_me, 'full', 'pair_up', NULL, NULL);

  PERFORM public.insert_match_context_message(
    v_conv_id,
    v_me,
    'pair_up_match',
    v_from.source_post_id,
    v_from.source_post_id,
    NULL,
    'You matched through P2P'
  );

  RETURN jsonb_build_object(
    'conversation_id', v_conv_id,
    'other_user_id', v_other,
    'source_post_id', v_from.source_post_id,
    'created', v_created
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_pair_up_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_pair_up_match(uuid) TO authenticated;

COMMENT ON FUNCTION public.complete_pair_up_match(uuid) IS
  'Mutual Pair Up: reuse direct DM, FULL grants, idempotent match_context. No unread/push.';
