-- People catalog: distinct eligible source posts with current Pair Up activity.
-- Local only until explicitly applied. Does not change list_pair_up_candidates
-- or get_my_pair_ups_for_sources. No new index.
-- Later (do not implement now): inner WHERE can become active Pair Up OR active
-- Group Up, still GROUP BY source_post_id, still one row, still no counts.

CREATE OR REPLACE FUNCTION public.list_people_sources(
  p_limit integer DEFAULT 15,
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
  v_limit integer;
  v_offset integer;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('sources', '[]'::jsonb, 'has_more', false);
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 15), 1), 50);

  -- Offset > 200 is a pagination/DoS guardrail, not a silent clamp (would repeat pages).
  IF COALESCE(p_offset, 0) > 200 THEN
    RETURN jsonb_build_object('sources', '[]'::jsonb, 'has_more', false);
  END IF;

  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  WITH active_pair_up AS (
    SELECT o.source_post_id,
           MAX(o.created_at) AS last_activity_at
    FROM public.social_opportunities o
    WHERE o.kind = 'pair_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
    GROUP BY o.source_post_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('source_post_id', q.source_post_id)
      ORDER BY q.last_activity_at DESC, q.source_post_id DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT s.source_post_id, s.last_activity_at
    FROM active_pair_up s
    WHERE public.people_source_is_eligible(s.source_post_id)
    ORDER BY s.last_activity_at DESC, s.source_post_id DESC
    OFFSET v_offset
    LIMIT (v_limit + 1)
  ) q;

  IF jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit THEN
    v_has_more := true;
    SELECT COALESCE(
      jsonb_agg(elem ORDER BY ordinality),
      '[]'::jsonb
    )
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(elem, ordinality)
    WHERE ordinality <= v_limit;
  END IF;

  RETURN jsonb_build_object(
    'sources', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_people_sources(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_people_sources(integer, integer) TO authenticated;

COMMENT ON FUNCTION public.list_people_sources(integer, integer) IS
  'Read-only catalog of distinct eligible source posts with current Pair Up activity. Sparse: source_post_id only, no counts. Default limit 15, max 50. p_offset > 200 returns an empty terminal page.';
