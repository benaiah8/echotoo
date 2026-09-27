-- Group Up G4: request groups summary + lazy requesters + composite view watermark.
-- Local build only — do not apply to production without explicit approval.
--
-- NEW ≠ PENDING. Mark-seen uses validated client-supplied (through_at, through_id) only —
-- never advances to server MAX(pending). Atomic ON CONFLICT upsert (no first-insert race).
-- Requests after the captured cursor stay NEW.

-- ---------------------------------------------------------------------------
-- group_up_request_view_state — one watermark per host + conversation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_up_request_view_state (
  host_user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL
    REFERENCES public.conversations (id) ON DELETE CASCADE,
  last_seen_request_at timestamptz NOT NULL,
  last_seen_request_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (host_user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS group_up_request_view_state_conversation_idx
  ON public.group_up_request_view_state (conversation_id);

ALTER TABLE public.group_up_request_view_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.group_up_request_view_state
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.group_up_request_view_state IS
  'Host Group Up request inbox watermark per conversation. Composite cursor (last_seen_request_at, last_seen_request_id). RPC-only.';

-- ---------------------------------------------------------------------------
-- list_my_group_up_request_groups — one summary row per conversation_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_group_up_request_groups(
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
  v_cursor_i uuid;
  v_cursor_v uuid;
  v_cursor_raw text;
  v_cursor_json jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_empty jsonb := jsonb_build_object(
    'groups', '[]'::jsonb,
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
      v_cursor_i := (v_cursor_json ->> 'i')::uuid;
      v_cursor_v := (v_cursor_json ->> 'v')::uuid;
      IF v_cursor_c IS NULL OR v_cursor_i IS NULL OR v_cursor_v IS NULL THEN
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
      o.id AS opportunity_id,
      o.conversation_id,
      vs.last_seen_request_at,
      vs.last_seen_request_id
    FROM public.group_up_requests r
    INNER JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    LEFT JOIN public.group_up_request_view_state vs
      ON vs.host_user_id = v_me
     AND vs.conversation_id = o.conversation_id
    WHERE r.status = 'pending'
      AND o.kind = 'group_up'
      AND o.creator_id = v_me
      AND o.status = 'active'
      AND o.conversation_id IS NOT NULL
      AND NOT public.users_are_blocked_pair(v_me, r.requester_id)
  ),
  agg AS (
    SELECT
      e.conversation_id,
      COUNT(*)::integer AS pending_count,
      COUNT(*) FILTER (
        WHERE e.last_seen_request_at IS NULL
           OR e.requested_at > e.last_seen_request_at
           OR (
             e.requested_at = e.last_seen_request_at
             AND e.request_id > e.last_seen_request_id
           )
      )::integer AS new_count
    FROM eligible e
    GROUP BY e.conversation_id
  ),
  latest AS (
    SELECT DISTINCT ON (e.conversation_id)
      e.conversation_id,
      e.requested_at AS latest_request_at,
      e.request_id AS latest_request_id,
      e.opportunity_id
    FROM eligible e
    ORDER BY e.conversation_id, e.requested_at DESC, e.request_id DESC
  ),
  enriched AS (
    SELECT
      a.conversation_id,
      l.opportunity_id,
      l.latest_request_at,
      l.latest_request_id,
      a.pending_count,
      a.new_count,
      c.title AS group_title,
      o.description,
      o.source_post_id,
      p.type AS source_type
    FROM agg a
    INNER JOIN latest l
      ON l.conversation_id = a.conversation_id
    INNER JOIN public.conversations c
      ON c.id = a.conversation_id
    INNER JOIN public.social_opportunities o
      ON o.id = l.opportunity_id
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
  ),
  paged AS (
    SELECT e.*
    FROM enriched e
    WHERE (
      NOT v_has_cursor
      OR e.latest_request_at < v_cursor_c
      OR (
        e.latest_request_at = v_cursor_c
        AND e.latest_request_id < v_cursor_i
      )
      OR (
        e.latest_request_at = v_cursor_c
        AND e.latest_request_id = v_cursor_i
        AND e.conversation_id < v_cursor_v
      )
    )
    ORDER BY e.latest_request_at DESC, e.latest_request_id DESC, e.conversation_id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'conversation_id', t.conversation_id,
        'opportunity_id', t.opportunity_id,
        'group_title', t.group_title,
        'description', t.description,
        'source_post_id', t.source_post_id,
        'source_type', t.source_type,
        'latest_request_at', t.latest_request_at,
        'latest_request_id', t.latest_request_id,
        'pending_count', t.pending_count,
        'new_count', t.new_count
      )
      ORDER BY t.latest_request_at DESC, t.latest_request_id DESC, t.conversation_id DESC
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
                'c', v_last ->> 'latest_request_at',
                'i', v_last ->> 'latest_request_id',
                'v', v_last ->> 'conversation_id'
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
    'groups', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_group_up_request_groups(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_group_up_request_groups(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_my_group_up_request_groups(integer, text) IS
  'Host Group Up request summaries: one row per conversation_id with pending_count/new_count vs composite watermark. Keyset on latest_request_at/id/conversation_id.';

-- ---------------------------------------------------------------------------
-- list_group_up_requesters — lazy pending requesters for one conversation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_group_up_requesters(
  p_conversation_id uuid,
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

  IF p_conversation_id IS NULL THEN
    RETURN v_empty;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.social_opportunities o
    WHERE o.kind = 'group_up'
      AND o.creator_id = v_me
      AND o.conversation_id = p_conversation_id
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
      r.opportunity_id,
      o.conversation_id,
      r.created_at AS requested_at,
      r.requester_id AS requester_user_id,
      req_pr.id AS requester_profile_id,
      req_pr.display_name,
      req_pr.username,
      req_pr.avatar_url,
      req_pr.profile_photos,
      req_pr.echo_preset,
      req_pr.bio
    FROM public.group_up_requests r
    INNER JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    INNER JOIN public.profiles req_pr
      ON req_pr.user_id = r.requester_id
     AND req_pr.deleted_at IS NULL
    WHERE r.status = 'pending'
      AND o.kind = 'group_up'
      AND o.creator_id = v_me
      AND o.status = 'active'
      AND o.conversation_id = p_conversation_id
      AND NOT public.users_are_blocked_pair(v_me, r.requester_id)
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
        'conversation_id', t.conversation_id,
        'requested_at', t.requested_at,
        'requester_user_id', t.requester_user_id,
        'requester_profile_id', t.requester_profile_id,
        'display_name', t.display_name,
        'username', t.username,
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

REVOKE ALL ON FUNCTION public.list_group_up_requesters(uuid, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_group_up_requesters(uuid, integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_group_up_requesters(uuid, integer, text) IS
  'Host lazy pending Group Up requesters for one conversation. Identified profiles. Keyset on requested_at/request_id.';

-- ---------------------------------------------------------------------------
-- mark_group_up_requests_seen — advance composite watermark through client cursor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_group_up_requests_seen(
  p_conversation_id uuid,
  p_through_request_at timestamptz,
  p_through_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_existing public.group_up_request_view_state%ROWTYPE;
  v_advanced boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL
     OR p_through_request_at IS NULL
     OR p_through_request_id IS NULL THEN
    RAISE EXCEPTION 'Missing mark-seen cursor';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.social_opportunities o
    WHERE o.kind = 'group_up'
      AND o.creator_id = v_me
      AND o.conversation_id = p_conversation_id
  ) THEN
    RAISE EXCEPTION 'Not the Group Up owner';
  END IF;

  -- Validate immutable request identity for this owned conversation.
  -- Status may be pending/accepted/declined/etc.; opportunity need not be active.
  -- Never invent a future watermark — refuse unknown (id, created_at) tuples.
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_up_requests r
    INNER JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    WHERE r.id = p_through_request_id
      AND r.created_at = p_through_request_at
      AND o.kind = 'group_up'
      AND o.creator_id = v_me
      AND o.conversation_id = p_conversation_id
  ) THEN
    RAISE EXCEPTION 'Invalid mark-seen cursor';
  END IF;

  -- Atomic create/update: concurrent first marks cannot unique-violate.
  -- Stored cursor = later of existing vs supplied; never moves backward.
  -- Does NOT use server MAX(pending.created_at).
  INSERT INTO public.group_up_request_view_state (
    host_user_id,
    conversation_id,
    last_seen_request_at,
    last_seen_request_id,
    updated_at
  )
  VALUES (
    v_me,
    p_conversation_id,
    p_through_request_at,
    p_through_request_id,
    now()
  )
  ON CONFLICT (host_user_id, conversation_id) DO UPDATE
  SET
    last_seen_request_at = EXCLUDED.last_seen_request_at,
    last_seen_request_id = EXCLUDED.last_seen_request_id,
    updated_at = now()
  WHERE
    EXCLUDED.last_seen_request_at > public.group_up_request_view_state.last_seen_request_at
    OR (
      EXCLUDED.last_seen_request_at = public.group_up_request_view_state.last_seen_request_at
      AND EXCLUDED.last_seen_request_id > public.group_up_request_view_state.last_seen_request_id
    )
  RETURNING * INTO v_existing;

  IF FOUND THEN
    v_advanced := true;
  ELSE
    SELECT *
    INTO v_existing
    FROM public.group_up_request_view_state vs
    WHERE vs.host_user_id = v_me
      AND vs.conversation_id = p_conversation_id;
    v_advanced := false;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'advanced', v_advanced,
    'conversation_id', p_conversation_id,
    'last_seen_request_at', v_existing.last_seen_request_at,
    'last_seen_request_id', v_existing.last_seen_request_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_group_up_requests_seen(uuid, timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_group_up_requests_seen(uuid, timestamptz, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.mark_group_up_requests_seen(uuid, timestamptz, uuid) IS
  'Advance host Group Up request watermark through validated client (at, id) only. Atomic upsert; never uses server MAX; never moves backward; accepts resolved request cursors; rejects foreign/mismatched tuples.';
