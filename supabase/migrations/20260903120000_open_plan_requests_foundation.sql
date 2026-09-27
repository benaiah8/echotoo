-- Phase 8C — Open Plan requests foundation (local only).
-- Do NOT apply during Build without explicit approval.
-- I'm down + withdraw + get-mine + list my_request_status + cancel cleanup.
-- No Accept → DM. No People UI. No Pair Up / Discover changes.
--
-- Lock order for all mutations (never request-first):
--   1) social_opportunities FOR UPDATE
--   2) open_plan_requests FOR UPDATE / update

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE public.open_plan_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL
    REFERENCES public.social_opportunities (id) ON DELETE CASCADE,
  requester_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('pending', 'accepted', 'withdrawn', 'declined', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  conversation_id uuid NULL
    REFERENCES public.conversations (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX open_plan_requests_one_unresolved
  ON public.open_plan_requests (opportunity_id, requester_id)
  WHERE status IN ('pending', 'accepted');

CREATE INDEX open_plan_requests_opportunity_status_idx
  ON public.open_plan_requests (opportunity_id, status);

CREATE INDEX open_plan_requests_requester_opp_created_idx
  ON public.open_plan_requests (requester_id, opportunity_id, created_at DESC);

ALTER TABLE public.open_plan_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.open_plan_requests
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.open_plan_requests IS
  'Open Plan I''m-down requests. Pending/accepted uniqueness per (opportunity, requester). RPC-only.';

-- ---------------------------------------------------------------------------
-- Compact request JSON (no identity fields)
-- ---------------------------------------------------------------------------
-- Inline jsonb_build_object in each RPC.

-- ---------------------------------------------------------------------------
-- request_open_plan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_open_plan(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_opp public.social_opportunities%ROWTYPE;
  v_req public.open_plan_requests%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing opportunity';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_me
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  -- 1) Lock opportunity first
  SELECT *
  INTO v_opp
  FROM public.social_opportunities o
  WHERE o.id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open Plan not found';
  END IF;

  IF v_opp.kind <> 'open_plan'
     OR v_opp.status <> 'active'
     OR v_opp.discoverable_until <= now()
     OR v_opp.occurs_at IS NULL
     OR v_opp.occurs_at <= now() THEN
    RAISE EXCEPTION 'Open Plan is not available';
  END IF;

  IF v_opp.creator_id = v_me THEN
    RAISE EXCEPTION 'Cannot request your own Open Plan';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_opp.creator_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_opp.creator_id) THEN
    RAISE EXCEPTION 'Cannot request this Open Plan';
  END IF;

  IF NOT public.open_plan_source_is_eligible(v_opp.source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  -- 2) Existing unresolved request (pending or accepted)
  SELECT *
  INTO v_req
  FROM public.open_plan_requests r
  WHERE r.opportunity_id = p_opportunity_id
    AND r.requester_id = v_me
    AND r.status IN ('pending', 'accepted')
  ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'updated_at', v_req.updated_at,
        'resolved_at', v_req.resolved_at
      )
    );
  END IF;

  BEGIN
    INSERT INTO public.open_plan_requests (
      opportunity_id,
      requester_id,
      status
    )
    VALUES (
      p_opportunity_id,
      v_me,
      'pending'
    )
    RETURNING * INTO v_req;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO v_req
      FROM public.open_plan_requests r
      WHERE r.opportunity_id = p_opportunity_id
        AND r.requester_id = v_me
        AND r.status IN ('pending', 'accepted')
      ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE;
      END IF;
  END;

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_req.id,
      'opportunity_id', v_req.opportunity_id,
      'status', v_req.status,
      'created_at', v_req.created_at,
      'updated_at', v_req.updated_at,
      'resolved_at', v_req.resolved_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_open_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_open_plan(uuid) TO authenticated;

COMMENT ON FUNCTION public.request_open_plan(uuid) IS
  'I''m down: create or reuse pending/accepted Open Plan request. Opportunity lock then request. No Discover pref.';

-- ---------------------------------------------------------------------------
-- withdraw_open_plan_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_open_plan_request(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_opp public.social_opportunities%ROWTYPE;
  v_req public.open_plan_requests%ROWTYPE;
  v_plan_valid boolean;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing opportunity';
  END IF;

  -- 1) Lock opportunity first
  SELECT *
  INTO v_opp
  FROM public.social_opportunities o
  WHERE o.id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open Plan not found';
  END IF;

  IF v_opp.kind <> 'open_plan' THEN
    RAISE EXCEPTION 'Not an Open Plan';
  END IF;

  -- 2) Lock caller's most relevant unresolved/history request for this opp
  SELECT *
  INTO v_req
  FROM public.open_plan_requests r
  WHERE r.opportunity_id = p_opportunity_id
    AND r.requester_id = v_me
  ORDER BY
    CASE r.status
      WHEN 'pending' THEN 0
      WHEN 'accepted' THEN 1
      ELSE 2
    END,
    r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open Plan request not found';
  END IF;

  IF v_req.status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot withdraw an accepted request';
  END IF;

  IF v_req.status = 'withdrawn' THEN
    RETURN jsonb_build_object(
      'request', jsonb_build_object(
        'id', v_req.id,
        'opportunity_id', v_req.opportunity_id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'updated_at', v_req.updated_at,
        'resolved_at', v_req.resolved_at
      )
    );
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Open Plan request is not pending';
  END IF;

  v_plan_valid :=
    v_opp.status = 'active'
    AND v_opp.discoverable_until > now()
    AND v_opp.occurs_at IS NOT NULL
    AND v_opp.occurs_at > now();

  IF v_plan_valid THEN
    UPDATE public.open_plan_requests
    SET status = 'withdrawn',
        resolved_at = now(),
        updated_at = now()
    WHERE id = v_req.id
    RETURNING * INTO v_req;
  ELSE
    UPDATE public.open_plan_requests
    SET status = 'closed',
        resolved_at = now(),
        updated_at = now()
    WHERE id = v_req.id
    RETURNING * INTO v_req;
  END IF;

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_req.id,
      'opportunity_id', v_req.opportunity_id,
      'status', v_req.status,
      'created_at', v_req.created_at,
      'updated_at', v_req.updated_at,
      'resolved_at', v_req.resolved_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.withdraw_open_plan_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_open_plan_request(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.withdraw_open_plan_request(uuid) IS
  'Withdraw pending Open Plan request. Opportunity lock then request. Invalid plan → closed.';

-- ---------------------------------------------------------------------------
-- get_my_open_plan_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_open_plan_request(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_req public.open_plan_requests%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('request', NULL);
  END IF;

  IF p_opportunity_id IS NULL THEN
    RETURN jsonb_build_object('request', NULL);
  END IF;

  SELECT *
  INTO v_req
  FROM public.open_plan_requests r
  WHERE r.opportunity_id = p_opportunity_id
    AND r.requester_id = v_me
    AND r.status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT *
    INTO v_req
    FROM public.open_plan_requests r
    WHERE r.opportunity_id = p_opportunity_id
      AND r.requester_id = v_me
      AND r.status = 'accepted'
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    SELECT *
    INTO v_req
    FROM public.open_plan_requests r
    WHERE r.opportunity_id = p_opportunity_id
      AND r.requester_id = v_me
    ORDER BY r.created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('request', NULL);
  END IF;

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_req.id,
      'opportunity_id', v_req.opportunity_id,
      'status', v_req.status,
      'created_at', v_req.created_at,
      'updated_at', v_req.updated_at,
      'resolved_at', v_req.resolved_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_open_plan_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_open_plan_request(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_my_open_plan_request(uuid) IS
  'Requester-only Open Plan request state. Prefer pending, then accepted, then latest history.';

-- ---------------------------------------------------------------------------
-- list_open_plan_candidates — add my_request_status; exclude accepted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_open_plan_candidates(
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
  v_cursor_o timestamptz;
  v_cursor_c timestamptz;
  v_cursor_id uuid;
  v_cursor_raw text;
  v_cursor_json jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_empty jsonb := jsonb_build_object(
    'candidates', '[]'::jsonb,
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
      v_cursor_o := (v_cursor_json ->> 'o')::timestamptz;
      v_cursor_c := (v_cursor_json ->> 'c')::timestamptz;
      v_cursor_id := (v_cursor_json ->> 'i')::uuid;
      IF v_cursor_o IS NULL OR v_cursor_c IS NULL OR v_cursor_id IS NULL THEN
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
      o.id,
      o.source_post_id,
      o.description,
      o.occurs_at,
      o.discoverable_until,
      o.created_at,
      pr.avatar_url,
      pr.bio,
      p.caption AS source_caption,
      p.type AS source_type,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.open_plan_requests pend
          WHERE pend.opportunity_id = o.id
            AND pend.requester_id = v_me
            AND pend.status = 'pending'
        ) THEN 'pending'
        ELSE NULL
      END AS my_request_status
    FROM public.social_opportunities o
    INNER JOIN public.profiles pr
      ON pr.user_id = o.creator_id
     AND pr.deleted_at IS NULL
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    WHERE o.kind = 'open_plan'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.occurs_at > now()
      AND o.creator_id <> v_me
      AND NOT public.users_are_blocked_pair(v_me, o.creator_id)
      AND p.type = 'experience'
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND NOT public.users_are_blocked_pair(v_me, p.author_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.open_plan_requests acc
        WHERE acc.opportunity_id = o.id
          AND acc.requester_id = v_me
          AND acc.status = 'accepted'
      )
  ),
  paged AS (
    SELECT e.*
    FROM eligible e
    WHERE (
      NOT v_has_cursor
      OR e.occurs_at > v_cursor_o
      OR (
        e.occurs_at = v_cursor_o
        AND e.created_at < v_cursor_c
      )
      OR (
        e.occurs_at = v_cursor_o
        AND e.created_at = v_cursor_c
        AND e.id < v_cursor_id
      )
    )
    ORDER BY e.occurs_at ASC, e.created_at DESC, e.id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'opportunity_id', t.id,
        'source_post_id', t.source_post_id,
        'description', t.description,
        'occurs_at', t.occurs_at,
        'discoverable_until', t.discoverable_until,
        'created_at', t.created_at,
        'avatar_url', t.avatar_url,
        'bio', t.bio,
        'source_caption', t.source_caption,
        'source_type', t.source_type,
        'my_request_status', t.my_request_status
      )
      ORDER BY t.occurs_at ASC, t.created_at DESC, t.id DESC
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
                'o', v_last ->> 'occurs_at',
                'c', v_last ->> 'created_at',
                'i', v_last ->> 'opportunity_id'
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
    'candidates', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_open_plan_candidates(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_open_plan_candidates(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_open_plan_candidates(integer, text) IS
  'Open Plans browse deck with my_request_status. Excludes accepted for viewer. No creator identity fields.';

-- ---------------------------------------------------------------------------
-- cancel_open_plan — close pending requests after opportunity close
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_open_plan(p_opportunity_id uuid)
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

  -- 1) Lock opportunity first
  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open Plan not found';
  END IF;

  IF v_row.kind <> 'open_plan' THEN
    RAISE EXCEPTION 'Not an Open Plan';
  END IF;

  IF v_row.creator_id <> v_me THEN
    RAISE EXCEPTION 'Not the Open Plan owner';
  END IF;

  IF v_row.status = 'active' THEN
    UPDATE public.social_opportunities
    SET status = 'closed',
        closed_at = now()
    WHERE id = p_opportunity_id
    RETURNING * INTO v_row;
  END IF;

  -- 2) Close leftover pending requests (idempotent for already-closed plans too)
  UPDATE public.open_plan_requests
  SET status = 'closed',
      resolved_at = COALESCE(resolved_at, now()),
      updated_at = now()
  WHERE opportunity_id = p_opportunity_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', v_row.id,
      'source_post_id', v_row.source_post_id,
      'creator_id', v_row.creator_id,
      'status', v_row.status,
      'description', v_row.description,
      'occurs_at', v_row.occurs_at,
      'discoverable_until', v_row.discoverable_until,
      'created_at', v_row.created_at,
      'closed_at', v_row.closed_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_open_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_open_plan(uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_open_plan(uuid) IS
  'Owner-only cancel: active Open Plan → closed; pending requests → closed. Opportunity then requests.';
