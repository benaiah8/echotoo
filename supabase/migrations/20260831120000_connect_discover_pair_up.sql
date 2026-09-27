-- Phase 7 — Atomic Discover Connect (local only).
-- Do NOT apply during Build without explicit approval.
-- Does not change join_pair_up, express_pair_up_interest, complete_pair_up_match,
-- list_pair_up_candidates, list_discover_pair_up_candidates, or My Plans.
--
-- One transaction: Discover validation → join_pair_up → express_pair_up_interest.
-- Does NOT SELECT … FOR UPDATE target opportunity before express (express owns
-- opportunity locking via ORDER BY id FOR UPDATE). Profile rows may be locked
-- ORDER BY user_id to serialize Discover preference / deletion races.

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
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_to_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing target opportunity';
  END IF;

  -- Read target (no FOR UPDATE). Opportunity locking stays inside express.
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

  -- Deterministic profile locks: serialize Discover OFF / delete races.
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

  -- Nested call: same transaction. Failed express rolls back this join.
  v_join := public.join_pair_up(v_source_post_id, NULL);
  v_opportunity := v_join -> 'opportunity';

  IF v_opportunity IS NULL OR jsonb_typeof(v_opportunity) = 'null' THEN
    RAISE EXCEPTION 'Join failed';
  END IF;

  v_express := public.express_pair_up_interest(p_to_opportunity_id);

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
  'Atomic Discover Connect: validate Discover prefs + eligibility, join_pair_up(source, NULL), then express_pair_up_interest(target). Same transaction; no opportunity pre-lock (express locks by id ASC). Does not create DM/push. Does not change My Plans RPCs.';
