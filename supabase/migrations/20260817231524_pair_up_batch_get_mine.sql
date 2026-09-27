-- Pair Up: batch-read caller join state for source posts.
-- Local only until explicitly applied. Does not change get_my_pair_up_for_source.
-- c_max_source_ids = 100 is a per-RPC DoS guardrail, not a product join cap.

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
    AND o.discoverable_until > now()
    AND public.people_source_is_eligible(o.source_post_id);

  RETURN jsonb_build_object(
    'opportunities', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_pair_ups_for_sources(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pair_ups_for_sources(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_my_pair_ups_for_sources(uuid[]) IS
  'Read-only batch of the caller''s active in-window eligible Pair Ups for the given source post ids. Sparse: omitted ids are not joined. c_max_source_ids=100 is a per-RPC DoS guardrail.';
