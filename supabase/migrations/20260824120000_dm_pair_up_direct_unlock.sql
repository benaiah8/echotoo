-- Pair Up durable direct-message unlock.
-- LOCAL only until explicitly applied. Forward-only; no historical backfill.
-- Does not modify interest/join RPCs, Group Up, push/Edge, or client code.
--
-- Depends on: R1A dm_direct_is_unlocked, Pair Up complete_pair_up_match.

-- ---------------------------------------------------------------------------
-- 1) dm_direct_unlocks — private durable unlock by canonical auth-user pair
-- ---------------------------------------------------------------------------
CREATE TABLE public.dm_direct_unlocks (
  user_low uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dm_direct_unlocks_pair_order CHECK (user_low < user_high),
  CONSTRAINT dm_direct_unlocks_reason_check CHECK (reason IN ('pair_up')),
  PRIMARY KEY (user_low, user_high)
);

ALTER TABLE public.dm_direct_unlocks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dm_direct_unlocks FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.dm_direct_unlocks IS
  'Durable direct-DM unlocks keyed by canonical auth user pair. Written only by SECURITY DEFINER match completion; never derived from ephemeral Pair Up interests.';

-- ---------------------------------------------------------------------------
-- 2) dm_direct_is_unlocked — enable durable unlock EXISTS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dm_direct_is_unlocked(
  p_conversation_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_pa uuid;
  v_pb uuid;
BEGIN
  IF p_conversation_id IS NULL
     OR p_user_a IS NULL
     OR p_user_b IS NULL
     OR p_user_a = p_user_b THEN
    RETURN false;
  END IF;

  -- Mutual approved follows (profile ids).
  SELECT pr.id
  INTO v_pa
  FROM public.profiles pr
  WHERE pr.user_id = p_user_a
    AND pr.deleted_at IS NULL
  LIMIT 1;

  SELECT pr.id
  INTO v_pb
  FROM public.profiles pr
  WHERE pr.user_id = p_user_b
    AND pr.deleted_at IS NULL
  LIMIT 1;

  IF v_pa IS NOT NULL AND v_pb IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = v_pa
        AND f.following_id = v_pb
        AND f.status = 'approved'
    ) AND EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = v_pb
        AND f.following_id = v_pa
        AND f.status = 'approved'
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- Reply unlock: both participants authored >=1 qualifying message.
  IF EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_user_id = p_user_a
      AND m.message_kind IN ('text', 'shared_post')
  ) AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_user_id = p_user_b
      AND m.message_kind IN ('text', 'shared_post')
  ) THEN
    RETURN true;
  END IF;

  -- Durable unlock (Pair Up completion today; any future reason row).
  -- Do NOT derive from expiring Pair Up interests/opportunities.
  IF EXISTS (
    SELECT 1
    FROM public.dm_direct_unlocks u
    WHERE u.user_low = least(p_user_a, p_user_b)
      AND u.user_high = greatest(p_user_a, p_user_b)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.dm_direct_is_unlocked(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.dm_direct_is_unlocked(uuid, uuid, uuid) IS
  'Direct DM unlocked via mutual approved follows, both-sides qualifying messages, or durable dm_direct_unlocks. Auth user ids.';

-- ---------------------------------------------------------------------------
-- 3) complete_pair_up_match — stamp durable unlock after DM resolve
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

  -- Durable Pair Up → unrestricted DM (idempotent; survives listing expiry).
  INSERT INTO public.dm_direct_unlocks (user_low, user_high, reason)
  VALUES (v_low, v_high, 'pair_up')
  ON CONFLICT (user_low, user_high) DO NOTHING;

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
  'After mutual Pair Up: reuse unique direct conversation, reactivate both members, and stamp durable dm_direct_unlocks. Interest alone does not unlock.';
