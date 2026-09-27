-- Phase 8B — Open Plans candidate list (local only).
-- Do NOT apply during Build without explicit approval.
-- Does not change Pair Up / Discover / create/cancel Open Plan / p2p_discover_enabled.
-- No request table. No People UI.

-- ---------------------------------------------------------------------------
-- Listing index: soonest occurs_at, then freshest created_at, then id.
-- discoverable_until > now() / occurs_at > now() remain runtime predicates.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS social_opportunities_open_plan_occurs_created_id_idx
  ON public.social_opportunities (occurs_at ASC, created_at DESC, id DESC)
  WHERE kind = 'open_plan' AND status = 'active';

COMMENT ON INDEX public.social_opportunities_open_plan_occurs_created_id_idx IS
  'Open Plans global browse by occurs_at ASC, created_at DESC, id DESC.';

-- ---------------------------------------------------------------------------
-- list_open_plan_candidates
-- Pre-accept privacy: no display_name, username, profile_id, or creator_id.
-- Private creators allowed; source author must remain public (8A source rules).
-- Independent of p2p_discover_enabled.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_open_plan_candidates(
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
  v_cursor_o timestamptz;
  v_cursor_c timestamptz;
  v_cursor_id uuid;
  v_cursor_raw text;
  v_cursor_json jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_empty jsonb := jsonb_build_object(
    'candidates', '[]'::jsonb,
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
      v_cursor_o := (v_cursor_json ->> 'o')::timestamptz;
      v_cursor_c := (v_cursor_json ->> 'c')::timestamptz;
      v_cursor_id := (v_cursor_json ->> 'i')::uuid;
      IF v_cursor_o IS NULL OR v_cursor_c IS NULL OR v_cursor_id IS NULL THEN
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
      o.id,
      o.source_post_id,
      o.description,
      o.occurs_at,
      o.discoverable_until,
      o.created_at,
      pr.avatar_url,
      pr.bio,
      p.caption AS source_caption,
      p.type AS source_type
    FROM public.social_opportunities o
    INNER JOIN public.profiles pr
      ON pr.user_id = o.creator_id
     AND pr.deleted_at IS NULL
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    WHERE o.kind = 'open_plan'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.occurs_at > now()
      AND o.creator_id <> v_me
      AND NOT public.users_are_blocked_pair(v_me, o.creator_id)
      AND p.type = 'experience'
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND NOT public.users_are_blocked_pair(v_me, p.author_id)
  ),
  paged AS (
    SELECT e.*
    FROM eligible e
    WHERE (
      NOT v_has_cursor
      OR e.occurs_at > v_cursor_o
      OR (
        e.occurs_at = v_cursor_o
        AND e.created_at < v_cursor_c
      )
      OR (
        e.occurs_at = v_cursor_o
        AND e.created_at = v_cursor_c
        AND e.id < v_cursor_id
      )
    )
    ORDER BY e.occurs_at ASC, e.created_at DESC, e.id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'opportunity_id', t.id,
        'source_post_id', t.source_post_id,
        'description', t.description,
        'occurs_at', t.occurs_at,
        'discoverable_until', t.discoverable_until,
        'created_at', t.created_at,
        'avatar_url', t.avatar_url,
        'bio', t.bio,
        'source_caption', t.source_caption,
        'source_type', t.source_type
      )
      ORDER BY t.occurs_at ASC, t.created_at DESC, t.id DESC
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
                'o', v_last ->> 'occurs_at',
                'c', v_last ->> 'created_at',
                'i', v_last ->> 'opportunity_id'
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
    'candidates', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_open_plan_candidates(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_open_plan_candidates(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_open_plan_candidates(integer, text) IS
  'Open Plans browse deck. User-facing active only; no creator identity fields; independent of Discover preference.';
