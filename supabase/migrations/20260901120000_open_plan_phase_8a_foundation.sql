-- Phase 8A: Open Plan foundation.
-- Local only until explicitly applied. Does not change Pair Up / Discover /
-- people_source_is_eligible / interests / Connect. No request table. No list deck.

-- ---------------------------------------------------------------------------
-- Schema: kind + occurs_at + uniqueness
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.social_opportunities'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%kind%pair_up%'
      AND c.conname <> 'social_opportunities_open_plan_occurs_at_check'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.social_opportunities DROP CONSTRAINT %I',
      v_conname
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_opportunities_kind_check'
      AND conrelid = 'public.social_opportunities'::regclass
  ) THEN
    ALTER TABLE public.social_opportunities
      ADD CONSTRAINT social_opportunities_kind_check
      CHECK (kind IN ('pair_up', 'group_up', 'open_plan'));
  END IF;
END
$$;

ALTER TABLE public.social_opportunities
  ADD COLUMN IF NOT EXISTS occurs_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_opportunities_open_plan_occurs_at_check'
      AND conrelid = 'public.social_opportunities'::regclass
  ) THEN
    ALTER TABLE public.social_opportunities
      ADD CONSTRAINT social_opportunities_open_plan_occurs_at_check
      CHECK (kind <> 'open_plan' OR occurs_at IS NOT NULL);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS social_opportunities_one_active_open_plan
  ON public.social_opportunities (creator_id, source_post_id)
  WHERE kind = 'open_plan' AND status = 'active';

COMMENT ON COLUMN public.social_opportunities.occurs_at IS
  'Open Plan meetup timestamptz. Required when kind=open_plan; NULL for pair_up/group_up.';

-- ---------------------------------------------------------------------------
-- open_plan_source_is_eligible (internal; not granted to clients)
-- Experience-only. Independent of p2p_discover_enabled.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_plan_source_is_eligible(p_post_id uuid)
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
      AND p.type = 'experience'
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND (
        auth.uid() IS NULL
        OR NOT public.users_are_blocked_pair(auth.uid(), p.author_id)
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.open_plan_source_is_eligible(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.open_plan_source_is_eligible(uuid) IS
  'Internal Open Plan source gate. Public published experience by a public author; can_view_post + viewer-author block. Not coupled to Discover preference.';

-- ---------------------------------------------------------------------------
-- Compact opportunity JSON helper shape (inline in each RPC)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- create_open_plan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_open_plan(
  p_source_post_id uuid,
  p_occurs_at timestamptz,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_row public.social_opportunities%ROWTYPE;
  v_description text;
  v_until timestamptz;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_me
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF p_source_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing source post';
  END IF;

  IF p_occurs_at IS NULL THEN
    RAISE EXCEPTION 'Missing occurs_at';
  END IF;

  IF p_occurs_at <= now() THEN
    RAISE EXCEPTION 'occurs_at must be in the future';
  END IF;

  IF NOT public.open_plan_source_is_eligible(p_source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  v_description := NULLIF(btrim(p_description), '');

  -- Reuse user-facing active Open Plan (no silent overwrite).
  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = p_source_post_id
    AND o.kind = 'open_plan'
    AND o.status = 'active'
    AND o.discoverable_until > now()
    AND o.occurs_at > now()
  LIMIT 1;

  IF FOUND THEN
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
  END IF;

  -- Expire stale active rows (past window or past meetup) before insert.
  UPDATE public.social_opportunities
  SET status = 'expired',
      closed_at = now()
  WHERE creator_id = v_me
    AND source_post_id = p_source_post_id
    AND kind = 'open_plan'
    AND status = 'active'
    AND (
      discoverable_until <= now()
      OR occurs_at IS NULL
      OR occurs_at <= now()
    );

  v_until := LEAST(now() + interval '14 days', p_occurs_at);

  BEGIN
    INSERT INTO public.social_opportunities (
      kind,
      source_post_id,
      creator_id,
      status,
      description,
      occurs_at,
      discoverable_until
    )
    VALUES (
      'open_plan',
      p_source_post_id,
      v_me,
      'active',
      v_description,
      p_occurs_at,
      v_until
    )
    RETURNING * INTO v_row;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO v_row
      FROM public.social_opportunities o
      WHERE o.creator_id = v_me
        AND o.source_post_id = p_source_post_id
        AND o.kind = 'open_plan'
        AND o.status = 'active'
        AND o.discoverable_until > now()
        AND o.occurs_at > now()
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE;
      END IF;
  END;

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

REVOKE ALL ON FUNCTION public.create_open_plan(uuid, timestamptz, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_open_plan(uuid, timestamptz, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_open_plan(uuid, timestamptz, text) IS
  'Create or reuse user-facing active Open Plan for an eligible experience source. discoverable_until = least(now()+14d, occurs_at).';

-- ---------------------------------------------------------------------------
-- cancel_open_plan
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

  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.id = p_opportunity_id;

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
  'Owner-only cancel: active Open Plan → closed. Idempotent for already closed/expired.';

-- ---------------------------------------------------------------------------
-- get_my_open_plan_for_source
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_open_plan_for_source(p_source_post_id uuid)
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
    AND o.kind = 'open_plan'
    AND o.status = 'active'
    AND o.discoverable_until > now()
    AND o.occurs_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('opportunity', NULL);
  END IF;

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

REVOKE ALL ON FUNCTION public.get_my_open_plan_for_source(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_open_plan_for_source(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_my_open_plan_for_source(uuid) IS
  'Caller user-facing active Open Plan for a source. Does not require source eligibility.';
