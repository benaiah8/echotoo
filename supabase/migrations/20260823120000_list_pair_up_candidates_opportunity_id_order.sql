-- Local only until explicitly applied. No production execute.
-- Forward fix for list_pair_up_candidates: jsonb_agg ORDER BY referenced t.id,
-- but the subquery aliases that column as opportunity_id. Preserve the Phase 2
-- body exactly except that ordering reference.

CREATE OR REPLACE FUNCTION public.list_pair_up_candidates(
  p_source_post_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  c_max_caller_sources integer := 500;
  v_limit integer;
  v_offset integer;
  v_per_source integer;
  v_source_count integer;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('candidates', '[]'::jsonb, 'has_more', false);
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

  -- Offset > 200 is a pagination/DoS guardrail, not product behavior and not a silent clamp.
  IF COALESCE(p_offset, 0) > 200 THEN
    RETURN jsonb_build_object('candidates', '[]'::jsonb, 'has_more', false);
  END IF;

  v_offset := GREATEST(COALESCE(p_offset, 0), 0);
  v_per_source := v_offset + v_limit + 1;

  SELECT COUNT(*)::integer
  INTO v_source_count
  FROM (
    SELECT DISTINCT o.source_post_id
    FROM public.social_opportunities o
    WHERE o.creator_id = v_me
      AND o.kind = 'pair_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND public.people_source_is_eligible(o.source_post_id)
      AND (p_source_post_id IS NULL OR o.source_post_id = p_source_post_id)
  ) s;

  IF v_source_count > c_max_caller_sources THEN
    RAISE EXCEPTION 'Too many active Pair Ups';
  END IF;

  IF v_source_count = 0 THEN
    RETURN jsonb_build_object('candidates', '[]'::jsonb, 'has_more', false);
  END IF;

  WITH my_opps AS (
    SELECT o.id, o.source_post_id
    FROM public.social_opportunities o
    WHERE o.creator_id = v_me
      AND o.kind = 'pair_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND public.people_source_is_eligible(o.source_post_id)
      AND (p_source_post_id IS NULL OR o.source_post_id = p_source_post_id)
  ),
  my_sources AS (
    SELECT DISTINCT source_post_id FROM my_opps
  ),
  sourced AS (
    SELECT c.id, c.source_post_id, c.creator_id, c.description,
           c.discoverable_until, c.created_at
    FROM my_sources s
    CROSS JOIN LATERAL (
      SELECT o.id, o.source_post_id, o.creator_id, o.description,
             o.discoverable_until, o.created_at
      FROM public.social_opportunities o
      INNER JOIN public.profiles pr
        ON pr.user_id = o.creator_id
       AND pr.deleted_at IS NULL
      WHERE o.source_post_id = s.source_post_id
        AND o.kind = 'pair_up'
        AND o.status = 'active'
        AND o.discoverable_until > now()
        AND o.creator_id <> v_me
        AND NOT public.users_are_blocked_pair(v_me, o.creator_id)
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT v_per_source
    ) c
  ),
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (
        PARTITION BY s.source_post_id
        ORDER BY s.created_at DESC, s.id DESC
      ) AS src_rn
    FROM sourced s
  ),
  mixed AS (
    SELECT *
    FROM ranked
    ORDER BY src_rn ASC, created_at DESC, id DESC
    OFFSET v_offset
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.src_rn ASC, t.created_at DESC, t.opportunity_id DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      m.id AS opportunity_id,
      m.source_post_id,
      m.creator_id,
      m.description,
      m.discoverable_until,
      m.created_at,
      pr.display_name,
      pr.username,
      pr.avatar_url,
      EXISTS (
        SELECT 1
        FROM public.social_opportunity_interests i
        INNER JOIN my_opps mo
          ON mo.id = i.from_opportunity_id
         AND mo.source_post_id = m.source_post_id
        WHERE i.to_opportunity_id = m.id
      ) AS expressed_by_me,
      m.src_rn
    FROM mixed m
    INNER JOIN public.profiles pr
      ON pr.user_id = m.creator_id
     AND pr.deleted_at IS NULL
  ) t;

  IF jsonb_array_length(v_rows) > v_limit THEN
    v_has_more := true;
    SELECT jsonb_agg(elem ORDER BY ordinality)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(elem, ordinality)
    WHERE ordinality <= v_limit;
  END IF;

  SELECT COALESCE(
    jsonb_agg(elem - 'src_rn' ORDER BY ordinality),
    '[]'::jsonb
  )
  INTO v_rows
  FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb))
    WITH ORDINALITY AS x(elem, ordinality);

  RETURN jsonb_build_object(
    'candidates', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer) IS
  'Mixed Pair Up deck across all of the caller''s eligible in-window sources. Optional p_source_post_id scopes to one source. No free peek. c_max_caller_sources=500 is a DoS guardrail.';
