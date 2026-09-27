-- Pair Up Phase 1 foundation.
-- social_opportunities is one 14-day public discovery window per row.
-- Phase 1 inserts kind=pair_up only. No occurs_at. No production apply in this step.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE public.social_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('pair_up', 'group_up')),
  source_post_id uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
  description text NULL,
  discoverable_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL
);

CREATE UNIQUE INDEX social_opportunities_one_active_pair_up
  ON public.social_opportunities (creator_id, source_post_id)
  WHERE kind = 'pair_up' AND status = 'active';

CREATE INDEX social_opportunities_source_kind_status_until_idx
  ON public.social_opportunities (source_post_id, kind, status, discoverable_until DESC);

CREATE INDEX social_opportunities_creator_kind_status_idx
  ON public.social_opportunities (creator_id, kind, status);

ALTER TABLE public.social_opportunities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.social_opportunities FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.social_opportunities IS
  'People discovery windows. Each row is one 14-day public window. Pair Up membership is an active in-window pair_up row.';

-- ---------------------------------------------------------------------------
-- people_source_is_eligible (internal; not granted to clients)
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

-- ---------------------------------------------------------------------------
-- join_pair_up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_pair_up(
  p_source_post_id uuid,
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

  IF NOT public.people_source_is_eligible(p_source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  v_description := NULLIF(btrim(p_description), '');

  SELECT *
  INTO v_row
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = p_source_post_id
    AND o.kind = 'pair_up'
    AND o.status = 'active'
    AND o.discoverable_until > now()
  LIMIT 1;

  IF FOUND THEN
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
  END IF;

  UPDATE public.social_opportunities
  SET status = 'expired',
      closed_at = now()
  WHERE creator_id = v_me
    AND source_post_id = p_source_post_id
    AND kind = 'pair_up'
    AND status = 'active'
    AND discoverable_until <= now();

  BEGIN
    INSERT INTO public.social_opportunities (
      kind,
      source_post_id,
      creator_id,
      status,
      description,
      discoverable_until
    )
    VALUES (
      'pair_up',
      p_source_post_id,
      v_me,
      'active',
      v_description,
      now() + interval '14 days'
    )
    RETURNING * INTO v_row;
  EXCEPTION
    WHEN unique_violation THEN
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
        RAISE;
      END IF;
  END;

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

REVOKE ALL ON FUNCTION public.join_pair_up(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_pair_up(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- leave_pair_up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_pair_up(p_source_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_updated integer;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_source_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing source post';
  END IF;

  UPDATE public.social_opportunities
  SET status = 'closed',
      closed_at = now()
  WHERE creator_id = v_me
    AND source_post_id = p_source_post_id
    AND kind = 'pair_up'
    AND status = 'active'
    AND discoverable_until > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'opportunity', NULL,
    'closed', v_updated > 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.leave_pair_up(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_pair_up(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_my_pair_up_for_source (read-only; never writes expired)
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

  IF NOT public.people_source_is_eligible(p_source_post_id) THEN
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
