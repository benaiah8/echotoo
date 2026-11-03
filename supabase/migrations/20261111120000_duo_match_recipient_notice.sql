-- Duo match notice for the participant who is not completing the match.
-- Local only. Do not apply without explicit approval.
--
-- insert_match_context_message stays void. accept_open_plan_request is not replaced.
-- A new match_context row is detected inside complete_pair_up_match, which already
-- holds both opportunity locks, so a repeat or a second completer sees the row.
-- Unread and unhide apply only to the other member. Push enqueue and drain kick
-- are best-effort. Muted recipients still get the unread row and no outbox row.

-- ---------------------------------------------------------------------------
-- 1) Recipient notice (private to SECURITY DEFINER callers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_duo_match_recipient(
  p_conversation_id uuid,
  p_message_id uuid,
  p_sender_user_id uuid,
  p_recipient_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_push_secret text;
BEGIN
  IF p_conversation_id IS NULL
     OR p_message_id IS NULL
     OR p_sender_user_id IS NULL
     OR p_recipient_user_id IS NULL
     OR p_sender_user_id = p_recipient_user_id THEN
    RETURN;
  END IF;

  UPDATE public.conversation_members m
  SET
    inbox_hidden_at = NULL,
    unread_count = m.unread_count + 1
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = p_recipient_user_id
    AND m.left_at IS NULL;

  BEGIN
    INSERT INTO public.dm_push_outbox (
      recipient_user_id,
      conversation_id,
      sender_user_id,
      message_id,
      body,
      sender_name,
      conversation_kind
    )
    SELECT
      p_recipient_user_id,
      p_conversation_id,
      p_sender_user_id,
      p_message_id,
      'You matched through P2P',
      coalesce(pr.display_name, pr.username, 'Someone'),
      'direct'
    FROM public.conversation_members m
    LEFT JOIN public.profiles pr ON pr.user_id = p_sender_user_id
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = p_recipient_user_id
      AND m.user_id <> p_sender_user_id
      AND m.left_at IS NULL
      AND m.notifications_muted = false
    ON CONFLICT (recipient_user_id, message_id)
      WHERE message_id IS NOT NULL
    DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING
        'duo match push enqueue failed for conversation %: %',
        p_conversation_id,
        SQLERRM;
  END;

  BEGIN
    SELECT ds.decrypted_secret
    INTO v_push_secret
    FROM vault.decrypted_secrets ds
    WHERE ds.name = 'internal_push_secret'
    LIMIT 1;

    IF v_push_secret IS NOT NULL AND btrim(v_push_secret) <> '' THEN
      PERFORM net.http_post(
        url := 'https://otfbgcvxevwtybfltvuf.supabase.co/functions/v1/send-dm-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-push-secret', btrim(v_push_secret)
        ),
        body := '{"drain_outbox":true,"limit":25}'::jsonb
      );
    ELSE
      RAISE WARNING
        'duo match push drain kick skipped for conversation %: internal_push_secret missing',
        p_conversation_id;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING
        'duo match push drain kick failed for conversation %: %',
        p_conversation_id,
        SQLERRM;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_duo_match_recipient(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.notify_duo_match_recipient(uuid, uuid, uuid, uuid) IS
  'One unread and one dm_push_outbox row for the other Duo member. Mute skips the outbox row. Enqueue and drain failures do not propagate.';

-- ---------------------------------------------------------------------------
-- 2) complete_pair_up_match — same completion, notice only for a new message
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
  v_prior_match_msg uuid;
  v_match_msg_id uuid;
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

  SELECT m.id
  INTO v_prior_match_msg
  FROM public.messages m
  WHERE m.conversation_id = v_conv_id
    AND m.message_kind = 'match_context'
    AND m.reference_type = 'pair_up_match'
    AND m.reference_id = v_from.source_post_id
  LIMIT 1;

  PERFORM public.insert_match_context_message(
    v_conv_id,
    v_me,
    'pair_up_match',
    v_from.source_post_id,
    v_from.source_post_id,
    NULL,
    'You matched through P2P'
  );

  IF v_prior_match_msg IS NULL THEN
    SELECT m.id
    INTO v_match_msg_id
    FROM public.messages m
    WHERE m.conversation_id = v_conv_id
      AND m.message_kind = 'match_context'
      AND m.reference_type = 'pair_up_match'
      AND m.reference_id = v_from.source_post_id
    LIMIT 1;

    IF v_match_msg_id IS NOT NULL THEN
      PERFORM public.notify_duo_match_recipient(
        v_conv_id,
        v_match_msg_id,
        v_me,
        v_other
      );
    END IF;
  END IF;

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
  'Mutual Pair Up: reuse direct DM, FULL grants, idempotent match_context. A new match message notifies only the other member.';
