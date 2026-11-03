-- Discover Heart R3 — interest origin.
-- LOCAL FILE ONLY. Do NOT apply without explicit production approval.
--
-- Baseline Connect and withdrawal bodies are the applied pin migration
-- 20261108120000_discover_pair_up_candidate_pins.sql (production version
-- 20261101203758). This file does not replace express_pair_up_interest,
-- complete_pair_up_match, join_pair_up, leave_pair_up, or either candidate list.
--
-- A retained Discover pin is not enough to withdraw a later interest.
-- connect_discover_pair_up stamps the outgoing interest it just created or
-- confirmed. Withdrawal requires that stamp on the current row and the pin.
-- A new Duo insert keeps the column default false.

-- ---------------------------------------------------------------------------
-- Origin flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_opportunity_interests
  ADD COLUMN discover_sourced boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.social_opportunity_interests.discover_sourced IS
  'True only after connect_discover_pair_up stamps this exact outgoing interest. A later insert, including Duo express_pair_up_interest, starts false. The Discover pin is separate and stays after withdrawal.';

-- Backfill only a current outgoing interest that already existed when its
-- Discover pin was written (same transaction, or an older interest that
-- Discover Connect then confirmed). now() is the transaction timestamp, so
-- the first Connect stores equal interest and pin times.
--
-- An interest newer than the pin is left false. That row can be a later Duo
-- interest or a repeated Discover Connect after withdrawal, because pin insert
-- uses ON CONFLICT DO NOTHING and does not refresh created_at. Those two
-- cannot be told apart from existing columns, so neither is guessed true.
-- The next successful Discover Connect stamps that current row.
UPDATE public.social_opportunity_interests AS interest
SET discover_sourced = true
FROM public.social_opportunities AS mine
INNER JOIN public.social_opportunities AS target
  ON target.source_post_id = mine.source_post_id
 AND target.kind = 'pair_up'
INNER JOIN public.discover_pair_up_candidate_pins AS pin
  ON pin.viewer_id = mine.creator_id
 AND pin.to_opportunity_id = target.id
WHERE interest.from_opportunity_id = mine.id
  AND interest.to_opportunity_id = target.id
  AND mine.kind = 'pair_up'
  AND mine.status = 'active'
  AND mine.discoverable_until > now()
  AND interest.created_at <= pin.created_at;

-- ---------------------------------------------------------------------------
-- connect_discover_pair_up
-- Same validation, join, express, and pin insert. Stamp the interest express
-- just returned, including a repeat Connect that finds the row already there.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.connect_discover_pair_up(
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
  v_target_creator uuid;
  v_source_post_id uuid;
  v_viewer_discover boolean;
  v_target_discover boolean;
  v_join jsonb;
  v_express jsonb;
  v_opportunity jsonb;
  v_interest_from uuid;
  v_interest_to uuid;
  v_stamped integer := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_to_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing target opportunity';
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
    RAISE EXCEPTION 'Cannot connect with yourself';
  END IF;

  v_target_creator := v_to.creator_id;
  v_source_post_id := v_to.source_post_id;

  PERFORM pr.user_id
  FROM public.profiles pr
  WHERE pr.user_id IN (v_me, v_target_creator)
  ORDER BY pr.user_id
  FOR UPDATE;

  SELECT pr.p2p_discover_enabled
  INTO v_viewer_discover
  FROM public.profiles pr
  WHERE pr.user_id = v_me
    AND pr.deleted_at IS NULL;

  IF NOT FOUND OR v_viewer_discover IS NOT TRUE THEN
    RAISE EXCEPTION 'Discover is not enabled';
  END IF;

  SELECT pr.p2p_discover_enabled
  INTO v_target_discover
  FROM public.profiles pr
  WHERE pr.user_id = v_target_creator
    AND pr.deleted_at IS NULL;

  IF NOT FOUND OR v_target_discover IS NOT TRUE THEN
    RAISE EXCEPTION 'Target is not available in Discover';
  END IF;

  IF NOT public.people_source_is_eligible(v_source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_target_creator) THEN
    RAISE EXCEPTION 'Cannot Pair Up with this user';
  END IF;

  v_join := public.join_pair_up(v_source_post_id, NULL);
  v_opportunity := v_join -> 'opportunity';

  IF v_opportunity IS NULL OR jsonb_typeof(v_opportunity) = 'null' THEN
    RAISE EXCEPTION 'Join failed';
  END IF;

  v_express := public.express_pair_up_interest(p_to_opportunity_id);
  v_interest_from := NULLIF(v_express ->> 'from_opportunity_id', '')::uuid;
  v_interest_to := NULLIF(v_express ->> 'to_opportunity_id', '')::uuid;

  IF v_interest_from IS NULL OR v_interest_to IS DISTINCT FROM p_to_opportunity_id THEN
    RAISE EXCEPTION 'Discover interest was not recorded';
  END IF;

  UPDATE public.social_opportunity_interests AS interest
  SET discover_sourced = true
  WHERE interest.from_opportunity_id = v_interest_from
    AND interest.to_opportunity_id = v_interest_to;

  GET DIAGNOSTICS v_stamped = ROW_COUNT;
  IF v_stamped <> 1 THEN
    RAISE EXCEPTION 'Discover interest was not recorded';
  END IF;

  INSERT INTO public.discover_pair_up_candidate_pins (
    viewer_id,
    to_opportunity_id
  )
  VALUES (v_me, p_to_opportunity_id)
  ON CONFLICT (viewer_id, to_opportunity_id) DO NOTHING;

  RETURN jsonb_build_object(
    'opportunity', v_opportunity,
    'from_opportunity_id', v_express ->> 'from_opportunity_id',
    'to_opportunity_id', v_express ->> 'to_opportunity_id',
    'matched', COALESCE((v_express ->> 'matched')::boolean, false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.connect_discover_pair_up(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_discover_pair_up(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.connect_discover_pair_up(uuid) IS
  'Atomic Discover Connect: validate, join, express, stamp that outgoing interest discover_sourced, then insert one Discover pin. Repeat Connect stamps the current row again. Does not create DM/push.';

-- ---------------------------------------------------------------------------
-- withdraw_discover_pair_up_interest
-- Same lock order and reverse-interest refusal. The current outgoing row must
-- be discover_sourced and the Discover pin must exist. The pin is not deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_discover_pair_up_interest(
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
  v_deleted integer := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_to_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing target opportunity';
  END IF;

  SELECT *
  INTO v_to
  FROM public.social_opportunities o
  WHERE o.id = p_to_opportunity_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target opportunity not found';
  END IF;

  IF v_to.kind <> 'pair_up' OR v_to.creator_id = v_me THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
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
     OR v_from.source_post_id <> v_to.source_post_id THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_to_id
      AND i.to_opportunity_id = v_from_id
  ) THEN
    RAISE EXCEPTION 'Discover interest is matched';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.discover_pair_up_candidate_pins pin
    WHERE pin.viewer_id = v_me
      AND pin.to_opportunity_id = v_to_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_from_id
      AND i.to_opportunity_id = v_to_id
      AND i.discover_sourced IS TRUE
  ) THEN
    RAISE EXCEPTION 'Not a Discover interest';
  END IF;

  DELETE FROM public.social_opportunity_interests i
  WHERE i.from_opportunity_id = v_from_id
    AND i.to_opportunity_id = v_to_id
    AND i.discover_sourced IS TRUE;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'to_opportunity_id', v_to_id,
    'from_opportunity_id', v_from_id,
    'withdrawn', v_deleted > 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.withdraw_discover_pair_up_interest(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_discover_pair_up_interest(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.withdraw_discover_pair_up_interest(uuid) IS
  'Delete the caller outgoing Pair Up interest when that current row is discover_sourced, the Discover pin exists, and no reverse interest exists. Does not delete the pin, the pool row, or direct-message grants.';
