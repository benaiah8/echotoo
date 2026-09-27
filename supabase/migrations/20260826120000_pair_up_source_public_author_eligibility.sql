-- Phase 3: P2P source eligibility — public posts with public authors only.
-- Local only until explicitly applied. Does not change can_view_post, leave_pair_up,
-- list_pair_up_candidates, express, complete, or schema.

-- ---------------------------------------------------------------------------
-- people_source_is_eligible
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_source_is_eligible(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.posts p
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    WHERE p.id = p_post_id
      AND p.type IN ('hangout', 'experience')
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND (
        auth.uid() IS NULL
        OR NOT public.users_are_blocked_pair(auth.uid(), p.author_id)
      )
      AND (
        p.type <> 'hangout'
        OR COALESCE(p.is_recurring, false) = true
        OR COALESCE(jsonb_array_length(p.selected_dates), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
          WHERE NULLIF(btrim(elem), '') IS NOT NULL
            AND (btrim(elem))::timestamptz >= now()
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.people_source_is_eligible(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.people_source_is_eligible(uuid) IS
  'Internal Pair Up source gate. Public published hangout/experience by a public author; can_view_post + source-author block + hangout date rules unchanged.';

-- ---------------------------------------------------------------------------
-- get_my_pair_up_for_source
-- Own active in-window row only. No people_source_is_eligible so Leave still
-- works after the source becomes ineligible. Does not expose other users.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_pair_up_for_source(p_source_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_row public.social_opportunities%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('opportunity', NULL);
  END IF;

  IF p_source_post_id IS NULL THEN
    RETURN jsonb_build_object('opportunity', NULL);
  END IF;

  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = p_source_post_id
    AND o.kind = 'pair_up'
    AND o.status = 'active'
    AND o.discoverable_until > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('opportunity', NULL);
  END IF;

  RETURN jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', v_row.id,
      'source_post_id', v_row.source_post_id,
      'status', v_row.status,
      'description', v_row.description,
      'discoverable_until', v_row.discoverable_until,
      'created_at', v_row.created_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_pair_up_for_source(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pair_up_for_source(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_my_pair_up_for_source(uuid) IS
  'Read-only: the caller''s own active in-window Pair Up for one source. Does not require current source eligibility so Leave remains available.';

-- ---------------------------------------------------------------------------
-- get_my_pair_ups_for_sources
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_pair_ups_for_sources(
  p_source_post_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  c_max_source_ids integer := 100;
  v_ids uuid[];
  v_count integer;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('opportunities', '[]'::jsonb);
  END IF;

  IF p_source_post_ids IS NULL OR COALESCE(cardinality(p_source_post_ids), 0) = 0 THEN
    RETURN jsonb_build_object('opportunities', '[]'::jsonb);
  END IF;

  SELECT ARRAY_AGG(DISTINCT x)
  INTO v_ids
  FROM unnest(p_source_post_ids) AS x
  WHERE x IS NOT NULL;

  v_count := COALESCE(cardinality(v_ids), 0);
  IF v_count = 0 THEN
    RETURN jsonb_build_object('opportunities', '[]'::jsonb);
  END IF;

  IF v_count > c_max_source_ids THEN
    RAISE EXCEPTION 'Too many source ids';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'source_post_id', o.source_post_id,
        'status', o.status,
        'description', o.description,
        'discoverable_until', o.discoverable_until,
        'created_at', o.created_at
      )
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = ANY (v_ids)
    AND o.kind = 'pair_up'
    AND o.status = 'active'
    AND o.discoverable_until > now();

  RETURN jsonb_build_object(
    'opportunities', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_pair_ups_for_sources(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pair_ups_for_sources(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_my_pair_ups_for_sources(uuid[]) IS
  'Read-only batch of the caller''s own active in-window Pair Ups for the given source post ids. Sparse: omitted ids are not joined. Does not require current source eligibility so Leave remains available. c_max_source_ids=100 is a per-RPC DoS guardrail.';
