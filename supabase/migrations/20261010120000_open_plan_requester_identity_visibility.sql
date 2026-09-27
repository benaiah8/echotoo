-- Open Plan requester identity visibility (local only — do not apply without approval).
--
-- Product: host may see display_name before Accept only when the requester
-- submitted after the updated disclosure (explicit opt-in flag).
-- Existing rows and old clients remain identity_visible_to_host = false.
--
-- Does not change list_my_open_plan_request_groups anonymous previews,
-- accept_open_plan_request, or list_my_open_plan_requests.

-- ---------------------------------------------------------------------------
-- Column: defaults false so grandfathered + old clients stay anonymous
-- ---------------------------------------------------------------------------
ALTER TABLE public.open_plan_requests
  ADD COLUMN IF NOT EXISTS identity_visible_to_host boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.open_plan_requests.identity_visible_to_host IS
  'When true, host list_open_plan_requesters may return display_name. Set only by clients that presented the post-disclosure request copy. Default false for grandfathered and old app versions.';

-- ---------------------------------------------------------------------------
-- request_open_plan — DROP one-arg then recreate with DEFAULT false
-- (avoids PostgREST ambiguous overloads; old clients omit the new arg → false)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.request_open_plan(uuid);

CREATE OR REPLACE FUNCTION public.request_open_plan(
  p_opportunity_id uuid,
  p_identity_visible_to_host boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_opp public.social_opportunities%ROWTYPE;
  v_req public.open_plan_requests%ROWTYPE;
  v_created boolean := false;
  v_push_secret text;
  v_identity_visible boolean := COALESCE(p_identity_visible_to_host, false);
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

  -- 2) Existing unresolved request (pending or accepted) — no notify, no flag flip
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
      status,
      identity_visible_to_host
    )
    VALUES (
      p_opportunity_id,
      v_me,
      'pending',
      v_identity_visible
    )
    RETURNING * INTO v_req;
    v_created := true;
  EXCEPTION
    WHEN unique_violation THEN
      -- Race recovery: reuse existing unresolved row — no notify, no flag flip
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
      v_created := false;
  END;

  -- 3) New request only: durable outbox in same transaction (do not swallow)
  IF v_created THEN
    PERFORM public.enqueue_open_plan_request_push(v_req.id);

    BEGIN
      SELECT ds.decrypted_secret
      INTO v_push_secret
      FROM vault.decrypted_secrets ds
      WHERE ds.name = 'internal_push_secret'
      LIMIT 1;

      IF v_push_secret IS NOT NULL AND btrim(v_push_secret) <> '' THEN
        PERFORM net.http_post(
          url := 'https://otfbgcvxevwtybfltvuf.supabase.co/functions/v1/send-open-plan-request-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-internal-push-secret', btrim(v_push_secret)
          ),
          body := '{"drain_outbox":true,"limit":25}'::jsonb
        );
      ELSE
        RAISE WARNING
          'open_plan_request push drain kick skipped for request %: internal_push_secret missing',
          v_req.id;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING
          'open_plan_request push drain kick failed for request %: %',
          v_req.id,
          SQLERRM;
    END;
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

REVOKE ALL ON FUNCTION public.request_open_plan(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_open_plan(uuid, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.request_open_plan(uuid, boolean) IS
  'I''m down: create or reuse pending/accepted Open Plan request. p_identity_visible_to_host defaults false (old clients / grandfather). New disclosure clients pass true. Existing unresolved rows are never flipped.';

-- ---------------------------------------------------------------------------
-- list_open_plan_requesters — gated display_name only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_open_plan_requesters(
  p_opportunity_id uuid,
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

  IF p_opportunity_id IS NULL THEN
    RETURN v_empty;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.social_opportunities o
    WHERE o.kind = 'open_plan'
      AND o.creator_id = v_me
      AND o.id = p_opportunity_id
  ) THEN
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
      r.created_at AS requested_at,
      CASE
        WHEN r.identity_visible_to_host IS TRUE THEN req_pr.display_name
        ELSE NULL
      END AS display_name,
      req_pr.avatar_url,
      req_pr.profile_photos,
      req_pr.echo_preset,
      req_pr.bio
    FROM public.open_plan_requests r
    INNER JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    INNER JOIN public.profiles req_pr
      ON req_pr.user_id = r.requester_id
     AND req_pr.deleted_at IS NULL
    WHERE r.status = 'pending'
      AND o.kind = 'open_plan'
      AND o.creator_id = v_me
      AND o.id = p_opportunity_id
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
        'requested_at', t.requested_at,
        'display_name', t.display_name,
        'avatar_url', t.avatar_url,
        'profile_photos', t.profile_photos,
        'echo_preset', t.echo_preset,
        'bio', t.bio
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

REVOKE ALL ON FUNCTION public.list_open_plan_requesters(uuid, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_open_plan_requesters(uuid, integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_open_plan_requesters(uuid, integer, text) IS
  'Host lazy pending Open Plan requesters. display_name only when identity_visible_to_host. No username/email/requester_id. Keyset on requested_at/request_id.';
