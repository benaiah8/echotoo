-- Optional Group Up request note.
-- Stored on group_up_requests. Not a direct message.
-- Local only. Do not apply without explicit approval.
--
-- Based on production-verified bodies of request_group_up and
-- list_group_up_requesters (project otfbgcvxevwtybfltvuf, 2026-11-03).
-- Does NOT include group_up_request_approval_push enqueue behavior
-- (that migration is not deployed).
--
-- Does not change accept_group_up_request, decline_group_up_request,
-- withdraw_group_up_request, membership, or messaging grants.

ALTER TABLE public.group_up_requests
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN public.group_up_requests.note IS
  'Optional organizer-visible request note. Null when blank. Written only on insert of a new pending request.';

DO $note_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_up_requests_note_len'
      AND conrelid = 'public.group_up_requests'::regclass
  ) THEN
    ALTER TABLE public.group_up_requests
      ADD CONSTRAINT group_up_requests_note_len
      CHECK (note IS NULL OR char_length(note) <= 200);
  END IF;
END
$note_checks$;

-- One signature. Old named calls omit p_note → DEFAULT NULL.
DROP FUNCTION IF EXISTS public.request_group_up(uuid);

CREATE OR REPLACE FUNCTION public.request_group_up(
  p_opportunity_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_opp public.social_opportunities%ROWTYPE;
  v_post public.posts%ROWTYPE;
  v_req public.group_up_requests%ROWTYPE;
  v_member_count integer;
  v_note text;
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

  SELECT *
  INTO v_opp
  FROM public.social_opportunities o
  WHERE o.id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group Up not found';
  END IF;

  IF v_opp.kind <> 'group_up'
     OR v_opp.status <> 'active'
     OR v_opp.discoverable_until <= now() THEN
    RAISE EXCEPTION 'Group Up is not available';
  END IF;

  IF NOT public.group_up_source_is_eligible(v_opp.source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  IF v_opp.creator_id = v_me THEN
    RAISE EXCEPTION 'Cannot request your own Group Up';
  END IF;

  SELECT *
  INTO v_post
  FROM public.posts p
  WHERE p.id = v_opp.source_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = v_opp.conversation_id
      AND cm.user_id = v_me
      AND cm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Already a group member';
  END IF;

  v_member_count := public._count_active_members(v_opp.conversation_id);
  IF v_member_count >= 200 THEN
    RAISE EXCEPTION 'Group member limit is 200';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_opp.creator_id) THEN
    RAISE EXCEPTION 'Cannot request this Group Up';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_post.author_id) THEN
    RAISE EXCEPTION 'Cannot request this Group Up';
  END IF;

  -- Existing unresolved request (pending or accepted) — no note change
  SELECT *
  INTO v_req
  FROM public.group_up_requests r
  WHERE r.opportunity_id = p_opportunity_id
    AND r.requester_id = v_me
  ORDER BY
    CASE r.status
      WHEN 'pending' THEN 0
      WHEN 'accepted' THEN 1
      WHEN 'declined' THEN 2
      WHEN 'withdrawn' THEN 3
      ELSE 4
    END,
    r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_req.status = 'pending' OR v_req.status = 'accepted' THEN
      RETURN jsonb_build_object(
        'request', jsonb_build_object(
          'id', v_req.id,
          'opportunity_id', v_req.opportunity_id,
          'status', v_req.status,
          'created_at', v_req.created_at
        )
      );
    END IF;

    IF v_req.status = 'declined' THEN
      RAISE EXCEPTION 'Cannot request this Group Up';
    END IF;
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 200 THEN
    RAISE EXCEPTION 'Group Up request note is too long';
  END IF;

  BEGIN
    INSERT INTO public.group_up_requests (
      opportunity_id,
      requester_id,
      status,
      note
    )
    VALUES (
      p_opportunity_id,
      v_me,
      'pending',
      v_note
    )
    RETURNING * INTO v_req;
  EXCEPTION
    WHEN unique_violation THEN
      -- Race recovery: reuse existing unresolved row — no note update
      SELECT *
      INTO v_req
      FROM public.group_up_requests r
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
      'created_at', v_req.created_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_group_up(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_group_up(uuid, text)
  TO authenticated, postgres, service_role;

COMMENT ON FUNCTION public.request_group_up(uuid, text) IS
  'Requester Join for Group Up. Optional p_note (trimmed, max 200) stored only on new insert. Refuses when conversation already has 200 active members. Does not add membership. Does not enqueue push.';

-- Host pending list: return note to authorized organizer.
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
      req_pr.bio,
      NULLIF(btrim(r.note), '') AS note
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
        'bio', t.bio,
        'note', t.note
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
  'Host lazy pending Group Up requesters for one conversation. Identified profiles plus optional note. Keyset on requested_at/request_id.';
