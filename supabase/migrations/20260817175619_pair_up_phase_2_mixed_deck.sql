-- Pair Up Phase 2: mixed candidate deck + private directional interest.
-- Local only until explicitly applied. No DM creation. No People UI.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE public.social_opportunity_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_opportunity_id uuid NOT NULL REFERENCES public.social_opportunities (id) ON DELETE CASCADE,
  to_opportunity_id uuid NOT NULL REFERENCES public.social_opportunities (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_opportunity_interests_not_self
    CHECK (from_opportunity_id <> to_opportunity_id),
  CONSTRAINT social_opportunity_interests_pair_unique
    UNIQUE (from_opportunity_id, to_opportunity_id)
);

CREATE INDEX social_opportunity_interests_to_idx
  ON public.social_opportunity_interests (to_opportunity_id);

CREATE INDEX social_opportunities_pair_up_source_created_id_idx
  ON public.social_opportunities (source_post_id, created_at DESC, id DESC)
  WHERE kind = 'pair_up' AND status = 'active';

ALTER TABLE public.social_opportunity_interests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.social_opportunity_interests FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.social_opportunity_interests IS
  'Directional Pair Up interest for one discovery window pair. Mutual is derived at query time from both opportunity ids. Leave/rejoin uses a new opportunity id so old rows cannot complete.';

-- ---------------------------------------------------------------------------
-- list_pair_up_candidates
-- Mixed deck across ALL of the caller's eligible in-window Pair Up sources.
-- c_max_caller_sources = 500 is a DoS guardrail (RAISE), not a product subset.
-- Per-source LATERAL LIMIT is (offset+limit+1) so LIMIT (limit+1) can set has_more.
-- p_offset > 200 returns empty has_more=false (pagination/DoS guardrail, not a clamp).
-- ---------------------------------------------------------------------------
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
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.src_rn ASC, t.created_at DESC, t.id DESC),
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

-- ---------------------------------------------------------------------------
-- express_pair_up_interest
-- Lock both opportunity rows by id ASC, then insert + reverse-check.
-- No DM creation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.express_pair_up_interest(
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
  v_from public.social_opportunities%ROWTYPE;
  v_from_id uuid;
  v_to_id uuid;
  v_matched boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_to_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing target opportunity';
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
    RAISE EXCEPTION 'Cannot express interest in yourself';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_to.creator_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  SELECT *
  INTO v_from
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = v_to.source_post_id
    AND o.kind = 'pair_up'
    AND o.status = 'active'
    AND o.discoverable_until > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not in pool';
  END IF;

  IF NOT public.people_source_is_eligible(v_to.source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_to.creator_id) THEN
    RAISE EXCEPTION 'Cannot Pair Up with this user';
  END IF;

  v_from_id := v_from.id;
  v_to_id := v_to.id;

  PERFORM o.id
  FROM public.social_opportunities o
  WHERE o.id IN (v_from_id, v_to_id)
  ORDER BY o.id
  FOR UPDATE;

  SELECT *
  INTO v_from
  FROM public.social_opportunities o
  WHERE o.id = v_from_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  SELECT *
  INTO v_to
  FROM public.social_opportunities o
  WHERE o.id = v_to_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF v_from.kind <> 'pair_up'
     OR v_from.status <> 'active'
     OR v_from.discoverable_until <= now()
     OR v_from.creator_id <> v_me
     OR v_to.kind <> 'pair_up'
     OR v_to.status <> 'active'
     OR v_to.discoverable_until <= now()
     OR v_from.source_post_id <> v_to.source_post_id
     OR NOT public.people_source_is_eligible(v_to.source_post_id)
     OR public.users_are_blocked_pair(v_me, v_to.creator_id) THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_me
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_to.creator_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  BEGIN
    INSERT INTO public.social_opportunity_interests (
      from_opportunity_id,
      to_opportunity_id
    )
    VALUES (v_from_id, v_to_id);
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  SELECT EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_to_id
      AND i.to_opportunity_id = v_from_id
  )
  INTO v_matched;

  RETURN jsonb_build_object(
    'from_opportunity_id', v_from_id,
    'to_opportunity_id', v_to_id,
    'matched', v_matched
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.express_pair_up_interest(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.express_pair_up_interest(uuid) TO authenticated;

COMMENT ON FUNCTION public.express_pair_up_interest(uuid) IS
  'Private directional Pair Up interest. Locks both opportunity rows by id ASC then inserts and derives matched. Does not create a DM.';
