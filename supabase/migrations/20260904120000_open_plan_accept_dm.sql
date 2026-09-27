-- Phase 8D — Open Plan creator requests + Accept → DM (local only).
-- Do NOT apply during Build without explicit approval.
-- Creator pending inbox + atomic Accept → canonical direct DM.
-- No People/Messages UI. No Pair Up / Discover changes. No push / system message.
--
-- Lock order for accept mutations (never request-first):
--   1) social_opportunities FOR UPDATE
--   2) open_plan_requests FOR UPDATE
-- Preliminary unlocked request_id → opportunity_id lookup is allowed only to
-- establish lock order; never trust it for authorization/state.

-- ---------------------------------------------------------------------------
-- Index for creator pending inbox (newest-first keyset)
-- ---------------------------------------------------------------------------
CREATE INDEX open_plan_requests_pending_created_id_idx
  ON public.open_plan_requests (created_at DESC, id DESC)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- list_my_open_plan_requests — creator pending inbox (anonymous rows)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_open_plan_requests(
  p_limit integer DEFAULT 20,
  p_cursor text DEFAULT NULL
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
  v_has_cursor boolean := false;
  v_cursor_c timestamptz;
  v_cursor_id uuid;
  v_cursor_raw text;
  v_cursor_json jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_empty jsonb := jsonb_build_object(
    'requests', '[]'::jsonb,
    'has_more', false,
    'next_cursor', NULL
  );
BEGIN
  IF v_me IS NULL THEN
    RETURN v_empty;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

  IF p_cursor IS NOT NULL AND btrim(p_cursor) <> '' THEN
    BEGIN
      v_cursor_raw := replace(replace(btrim(p_cursor), '-', '+'), '_', '/');
      WHILE length(v_cursor_raw) % 4 <> 0 LOOP
        v_cursor_raw := v_cursor_raw || '=';
      END LOOP;
      v_cursor_json := convert_from(decode(v_cursor_raw, 'base64'), 'UTF8')::jsonb;
      v_cursor_c := (v_cursor_json ->> 'c')::timestamptz;
      v_cursor_id := (v_cursor_json ->> 'i')::uuid;
      IF v_cursor_c IS NULL OR v_cursor_id IS NULL THEN
        RETURN v_empty;
      END IF;
      v_has_cursor := true;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN v_empty;
    END;
  END IF;

  WITH eligible AS (
    SELECT
      r.id AS request_id,
      r.opportunity_id,
      r.created_at AS requested_at,
      req_pr.avatar_url,
      req_pr.bio,
      o.source_post_id,
      p.caption AS source_caption,
      p.type AS source_type,
      o.description AS plan_description,
      o.occurs_at,
      o.discoverable_until
    FROM public.open_plan_requests r
    INNER JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    INNER JOIN public.profiles req_pr
      ON req_pr.user_id = r.requester_id
     AND req_pr.deleted_at IS NULL
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    WHERE r.status = 'pending'
      AND o.kind = 'open_plan'
      AND o.creator_id = v_me
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.occurs_at > now()
      AND NOT public.users_are_blocked_pair(v_me, r.requester_id)
      AND public.open_plan_source_is_eligible(o.source_post_id)
  ),
  paged AS (
    SELECT e.*
    FROM eligible e
    WHERE (
      NOT v_has_cursor
      OR e.requested_at < v_cursor_c
      OR (
        e.requested_at = v_cursor_c
        AND e.request_id < v_cursor_id
      )
    )
    ORDER BY e.requested_at DESC, e.request_id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'request_id', t.request_id,
        'opportunity_id', t.opportunity_id,
        'requested_at', t.requested_at,
        'avatar_url', t.avatar_url,
        'bio', t.bio,
        'source_post_id', t.source_post_id,
        'source_caption', t.source_caption,
        'source_type', t.source_type,
        'plan_description', t.plan_description,
        'occurs_at', t.occurs_at,
        'discoverable_until', t.discoverable_until
      )
      ORDER BY t.requested_at DESC, t.request_id DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM paged t;

  IF jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit THEN
    v_has_more := true;
    SELECT jsonb_agg(elem ORDER BY ordinality)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(elem, ordinality)
    WHERE ordinality <= v_limit;
  END IF;

  IF v_has_more AND jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > 0 THEN
    v_last := v_rows -> -1;
    v_next_cursor := replace(
      replace(
        rtrim(
          encode(
            convert_to(
              jsonb_build_object(
                'c', v_last ->> 'requested_at',
                'i', v_last ->> 'request_id'
              )::text,
              'UTF8'
            ),
            'base64'
          ),
          '='
        ),
        '+',
        '-'
      ),
      '/',
      '_'
    );
  END IF;

  RETURN jsonb_build_object(
    'requests', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_open_plan_requests(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_open_plan_requests(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_my_open_plan_requests(integer, text) IS
  'Creator Open Plan pending-request inbox. Anonymous rows only. Newest-first keyset. No Discover pref.';

-- ---------------------------------------------------------------------------
-- accept_open_plan_request — Accept → canonical direct DM
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

  -- Idempotent accepted with usable DM
  IF v_req.status = 'accepted' AND v_req.conversation_id IS NOT NULL THEN
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
  'Creator Accept → canonical direct DM. Opportunity then request locks. Does not close Open Plan. Attribution open_plan + request_id.';
