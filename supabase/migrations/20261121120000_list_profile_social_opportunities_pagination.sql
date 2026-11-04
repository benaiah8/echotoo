-- LOCAL ONLY — do not apply until explicitly approved.
-- Profile social rail: keyset pagination (remove hard 8-post ceiling).
--
-- Replaces ONLY list_profile_social_opportunities.
-- Preserves post-centric aggregation, eligibility / privacy / block gates,
-- self-view Discover bypass, hosted-only Groups, source-author identity,
-- and ASC NULLS LAST sort (sort_at, created_at, source_post_id).
-- Does NOT change connect_profile_pair_up, Discover, Open Plans, or messaging.
--
-- Overload strategy (PostgREST):
--   Existing live signature is list_profile_social_opportunities(uuid).
--   CREATE OR REPLACE with (uuid, integer, text) ADDS a second overload; it does
--   not replace the one-arg form. Keeping both makes
--   rpc('list_profile_social_opportunities', { p_profile_user_id }) ambiguous.
--   Audit: repo has no SQL views/triggers calling this RPC — only authenticated
--   clients via PostgREST. Therefore after creating the three-arg function we
--   DROP FUNCTION list_profile_social_opportunities(uuid) WITHOUT CASCADE so a
--   single resolvable signature remains. Defaults keep one-arg-shaped calls
--   working (p_limit=8, p_cursor=NULL). Frontend always sends named p_limit and
--   p_cursor for clarity.

CREATE OR REPLACE FUNCTION public.list_profile_social_opportunities(
  p_profile_user_id uuid,
  p_limit integer DEFAULT 8,
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
  v_owner public.profiles%ROWTYPE;
  v_viewer_profile_id uuid;
  v_is_self boolean;
  v_limit integer;
  v_has_cursor boolean := false;
  v_cursor_s timestamptz;
  v_cursor_c timestamptz;
  v_cursor_i uuid;
  v_cursor_raw text;
  v_cursor_json jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_empty jsonb := jsonb_build_object(
    'opportunities', '[]'::jsonb,
    'has_more', false,
    'next_cursor', NULL
  );
BEGIN
  IF v_me IS NULL THEN
    RETURN v_empty;
  END IF;

  IF p_profile_user_id IS NULL THEN
    RETURN v_empty;
  END IF;

  SELECT *
  INTO v_owner
  FROM public.profiles pr
  WHERE pr.user_id = p_profile_user_id
    AND pr.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN v_empty;
  END IF;

  v_is_self := (v_me = p_profile_user_id);

  -- People discoverability OFF → empty for OTHER viewers only.
  -- Self may still inspect own active opportunities.
  -- Never return p2p_discover_enabled to the client.
  IF NOT v_is_self AND v_owner.p2p_discover_enabled IS NOT TRUE THEN
    RETURN v_empty;
  END IF;

  -- Block gate is other-viewer only (self cannot block self).
  IF NOT v_is_self
     AND public.users_are_blocked_pair(v_me, p_profile_user_id) THEN
    RETURN v_empty;
  END IF;

  SELECT pr.id
  INTO v_viewer_profile_id
  FROM public.profiles pr
  WHERE pr.user_id = v_me
    AND pr.deleted_at IS NULL;

  -- Private profile: approved follower required for other viewers — mirrors feed.
  IF COALESCE(v_owner.is_private, false) = true
     AND NOT v_is_self THEN
    IF v_viewer_profile_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.follows f
         WHERE f.follower_id = v_viewer_profile_id
           AND f.following_id = v_owner.id
           AND f.status = 'approved'
       ) THEN
      RETURN v_empty;
    END IF;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 50);

  IF p_cursor IS NOT NULL AND btrim(p_cursor) <> '' THEN
    BEGIN
      v_cursor_raw := regexp_replace(
        replace(replace(btrim(p_cursor), '-', '+'), '_', '/'),
        E'\\s+',
        '',
        'g'
      );
      WHILE length(v_cursor_raw) % 4 <> 0 LOOP
        v_cursor_raw := v_cursor_raw || '=';
      END LOOP;
      v_cursor_json := convert_from(decode(v_cursor_raw, 'base64'), 'UTF8')::jsonb;
      -- s/c may be JSON null (ASC NULLS LAST keyset); i is required.
      IF NOT (v_cursor_json ? 'i')
         OR NULLIF(btrim(COALESCE(v_cursor_json ->> 'i', '')), '') IS NULL THEN
        RETURN v_empty;
      END IF;
      v_cursor_i := (v_cursor_json ->> 'i')::uuid;
      IF v_cursor_json ->> 's' IS NULL OR btrim(v_cursor_json ->> 's') = '' THEN
        v_cursor_s := NULL;
      ELSE
        v_cursor_s := (v_cursor_json ->> 's')::timestamptz;
      END IF;
      IF v_cursor_json ->> 'c' IS NULL OR btrim(v_cursor_json ->> 'c') = '' THEN
        v_cursor_c := NULL;
      ELSE
        v_cursor_c := (v_cursor_json ->> 'c')::timestamptz;
      END IF;
      v_has_cursor := true;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN v_empty;
    END;
  END IF;

  WITH duo_raw AS (
    SELECT
      o.id AS opportunity_id,
      o.source_post_id,
      p.type AS source_type,
      p.caption AS source_caption,
      p.author_id AS source_author_id,
      author_pr.id AS source_author_profile_id,
      author_pr.display_name AS source_author_display_name,
      author_pr.username AS source_author_username,
      author_pr.avatar_url AS source_author_avatar_url,
      (
        SELECT (a.images)[1]::text
        FROM public.activities a
        WHERE a.post_id = p.id
          AND a.images IS NOT NULL
          AND array_length(a.images, 1) > 0
        ORDER BY a.order_idx ASC NULLS LAST
        LIMIT 1
      ) AS source_cover_url,
      p.selected_dates AS source_selected_dates,
      p.recurrence_days AS source_recurrence_days,
      p.is_recurring AS source_is_recurring,
      o.created_at,
      EXISTS (
        SELECT 1
        FROM public.social_opportunities mine
        WHERE mine.kind = 'pair_up'
          AND mine.status = 'active'
          AND mine.discoverable_until > now()
          AND mine.creator_id = v_me
          AND mine.source_post_id = o.source_post_id
      ) AS viewer_duo_joined,
      CASE
        WHEN COALESCE(p.is_recurring, false) = true THEN now()
        ELSE COALESCE(
          (
            SELECT MIN((btrim(elem))::timestamptz)
            FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
            WHERE NULLIF(btrim(elem), '') IS NOT NULL
              AND ((btrim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
                >= (now() AT TIME ZONE 'Africa/Addis_Ababa')::date
          ),
          o.discoverable_until
        )
      END AS sort_at
    FROM public.social_opportunities o
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    INNER JOIN public.profiles author_pr
      ON author_pr.user_id = p.author_id
     AND author_pr.deleted_at IS NULL
    WHERE o.kind = 'pair_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.creator_id = p_profile_user_id
      AND (v_is_self OR o.creator_id <> v_me)
      AND public.people_source_is_eligible(o.source_post_id)
      AND public.can_view_post(p.id)
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND p.type = 'hangout'
      AND COALESCE(author_pr.is_private, false) = false
      AND NOT public.users_are_blocked_pair(v_me, p.author_id)
  ),
  -- One hosted Duo per source (deterministic if multiples ever exist).
  duo_rows AS (
    SELECT DISTINCT ON (d.source_post_id)
      d.*
    FROM duo_raw d
    ORDER BY d.source_post_id, d.created_at ASC, d.opportunity_id ASC
  ),
  group_raw AS (
    SELECT
      o.id AS opportunity_id,
      o.source_post_id,
      p.type AS source_type,
      p.caption AS source_caption,
      p.author_id AS source_author_id,
      author_pr.id AS source_author_profile_id,
      author_pr.display_name AS source_author_display_name,
      author_pr.username AS source_author_username,
      author_pr.avatar_url AS source_author_avatar_url,
      (
        SELECT (a.images)[1]::text
        FROM public.activities a
        WHERE a.post_id = p.id
          AND a.images IS NOT NULL
          AND array_length(a.images, 1) > 0
        ORDER BY a.order_idx ASC NULLS LAST
        LIMIT 1
      ) AS source_cover_url,
      p.selected_dates AS source_selected_dates,
      p.recurrence_days AS source_recurrence_days,
      p.is_recurring AS source_is_recurring,
      o.occurs_at,
      o.occurs_time_explicit,
      c.title AS group_title,
      o.created_at,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.conversation_members cm
          WHERE cm.conversation_id = o.conversation_id
            AND cm.user_id = v_me
            AND cm.left_at IS NULL
        ) THEN 'member'
        WHEN EXISTS (
          SELECT 1
          FROM public.group_up_requests pend
          WHERE pend.opportunity_id = o.id
            AND pend.requester_id = v_me
            AND pend.status = 'pending'
        ) THEN 'pending'
        ELSE 'none'
      END AS viewer_group_state,
      (
        SELECT pend.id
        FROM public.group_up_requests pend
        WHERE pend.opportunity_id = o.id
          AND pend.requester_id = v_me
          AND pend.status = 'pending'
        LIMIT 1
      ) AS request_id,
      COALESCE(o.occurs_at, o.discoverable_until) AS sort_at
    FROM public.social_opportunities o
    INNER JOIN public.conversations c
      ON c.id = o.conversation_id
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    INNER JOIN public.profiles author_pr
      ON author_pr.user_id = p.author_id
     AND author_pr.deleted_at IS NULL
    WHERE o.kind = 'group_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND o.creator_id = p_profile_user_id
      AND (v_is_self OR o.creator_id <> v_me)
      AND public.group_up_source_is_eligible(o.source_post_id)
      AND public.can_view_post(p.id)
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND p.type IN ('hangout', 'experience')
      AND COALESCE(author_pr.is_private, false) = false
      AND NOT public.users_are_blocked_pair(v_me, p.author_id)
      -- Hosted only: creator_id filter above. Exclude declined requesters.
      AND NOT EXISTS (
        SELECT 1
        FROM public.group_up_requests dec
        WHERE dec.opportunity_id = o.id
          AND dec.requester_id = v_me
          AND dec.status = 'declined'
      )
  ),
  group_rows AS (
    SELECT DISTINCT ON (g.source_post_id)
      g.*
    FROM group_raw g
    ORDER BY g.source_post_id, g.created_at ASC, g.opportunity_id ASC
  ),
  post_ids AS (
    SELECT source_post_id FROM duo_rows
    UNION
    SELECT source_post_id FROM group_rows
  ),
  aggregated AS (
    SELECT
      pid.source_post_id,
      COALESCE(d.source_type, g.source_type) AS source_type,
      COALESCE(d.source_caption, g.source_caption) AS source_caption,
      COALESCE(d.source_cover_url, g.source_cover_url) AS source_cover_url,
      COALESCE(d.source_author_id, g.source_author_id) AS source_author_id,
      COALESCE(d.source_author_profile_id, g.source_author_profile_id)
        AS source_author_profile_id,
      COALESCE(d.source_author_display_name, g.source_author_display_name)
        AS source_author_display_name,
      COALESCE(d.source_author_username, g.source_author_username)
        AS source_author_username,
      COALESCE(d.source_author_avatar_url, g.source_author_avatar_url)
        AS source_author_avatar_url,
      COALESCE(d.source_selected_dates, g.source_selected_dates)
        AS source_selected_dates,
      COALESCE(d.source_recurrence_days, g.source_recurrence_days)
        AS source_recurrence_days,
      COALESCE(d.source_is_recurring, g.source_is_recurring)
        AS source_is_recurring,
      CASE
        WHEN d.created_at IS NULL THEN g.created_at
        WHEN g.created_at IS NULL THEN d.created_at
        ELSE LEAST(d.created_at, g.created_at)
      END AS created_at,
      CASE
        WHEN d.sort_at IS NULL THEN g.sort_at
        WHEN g.sort_at IS NULL THEN d.sort_at
        ELSE LEAST(d.sort_at, g.sort_at)
      END AS sort_at,
      CASE
        WHEN d.opportunity_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'opportunity_id', d.opportunity_id,
          'viewer_duo_joined', d.viewer_duo_joined
        )
      END AS duo,
      CASE
        WHEN g.opportunity_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'opportunity_id', g.opportunity_id,
          'group_title', g.group_title,
          'occurs_at', g.occurs_at,
          'occurs_time_explicit', g.occurs_time_explicit,
          'viewer_group_state', g.viewer_group_state,
          'request_id', g.request_id
        )
      END AS group_payload
    FROM post_ids pid
    LEFT JOIN duo_rows d
      ON d.source_post_id = pid.source_post_id
    LEFT JOIN group_rows g
      ON g.source_post_id = pid.source_post_id
  ),
  ranked AS (
    SELECT
      a.*,
      row_number() OVER (
        ORDER BY a.sort_at ASC NULLS LAST,
                 a.created_at ASC NULLS LAST,
                 a.source_post_id ASC
      ) AS ord
    FROM aggregated a
    -- ASC NULLS LAST keyset: nulls-last flag bits first so nullable timestamps
    -- do not break lexicographic ">" the way bare ROW(ts,…) comparisons do.
    -- Equivalent order: (sort_at IS NULL), sort_at, (created_at IS NULL),
    -- created_at, source_post_id. PG treats NULL=NULL as equal inside row cmp
    -- and continues to the next field (UUID tie-break).
    WHERE NOT v_has_cursor
       OR ROW(
            (a.sort_at IS NULL)::integer,
            a.sort_at,
            (a.created_at IS NULL)::integer,
            a.created_at,
            a.source_post_id
          ) > ROW(
            (v_cursor_s IS NULL)::integer,
            v_cursor_s,
            (v_cursor_c IS NULL)::integer,
            v_cursor_c,
            v_cursor_i
          )
  )
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'source_post_id', r.source_post_id,
            'source_type', r.source_type,
            'source_caption', r.source_caption,
            'source_cover_url', r.source_cover_url,
            'source_author_id', r.source_author_id,
            'source_author_profile_id', r.source_author_profile_id,
            'source_author_display_name', r.source_author_display_name,
            'source_author_username', r.source_author_username,
            'source_author_avatar_url', r.source_author_avatar_url,
            'source_selected_dates', r.source_selected_dates,
            'source_recurrence_days', r.source_recurrence_days,
            'source_is_recurring', r.source_is_recurring,
            'created_at', r.created_at,
            'duo', r.duo,
            'group', r.group_payload
          )
          ORDER BY r.sort_at ASC NULLS LAST,
                   r.created_at ASC NULLS LAST,
                   r.source_post_id ASC
        )
        FROM ranked r
        WHERE r.ord <= v_limit
      ),
      '[]'::jsonb
    ),
    EXISTS (SELECT 1 FROM ranked r WHERE r.ord = v_limit + 1),
    (
      SELECT jsonb_build_object(
        's', r.sort_at,
        'c', r.created_at,
        'i', r.source_post_id
      )
      FROM ranked r
      WHERE r.ord = LEAST(
        v_limit,
        (SELECT COALESCE(MAX(x.ord), 0) FROM ranked x WHERE x.ord <= v_limit)
      )
    )
  INTO v_rows, v_has_more, v_last;

  IF v_has_more AND v_last IS NOT NULL AND (v_last ? 'i') THEN
    v_next_cursor := replace(
      replace(
        rtrim(
          regexp_replace(
            encode(
              convert_to(v_last::text, 'UTF8'),
              'base64'
            ),
            E'\\s+',
            '',
            'g'
          ),
          '='
        ),
        '+',
        '-'
      ),
      '/',
      '_'
    );
  ELSE
    v_has_more := false;
    v_next_cursor := NULL;
  END IF;

  -- Never advertise another page unless a usable next_cursor was produced.
  IF v_has_more AND (v_next_cursor IS NULL OR btrim(v_next_cursor) = '') THEN
    v_has_more := false;
    v_next_cursor := NULL;
  END IF;

  RETURN jsonb_build_object(
    'opportunities', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

-- Remove the pre-pagination one-arg overload (see header). No CASCADE: fail if
-- an unexpected dependent appears rather than silently dropping callers.
DROP FUNCTION IF EXISTS public.list_profile_social_opportunities(uuid);

REVOKE ALL ON FUNCTION public.list_profile_social_opportunities(uuid, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_profile_social_opportunities(uuid, integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_profile_social_opportunities(uuid, integer, text) IS
  'Viewer-scoped Profile rail (post-centric keyset pages). Default p_limit=8 (max 50). Opaque next_cursor is base64url JSON {s,c,i} over (sort_at, created_at, source_post_id) ASC NULLS LAST. Returns opportunities + has_more + next_cursor. Other viewers: empty when owner People discoverability is OFF. Self: Discover OFF does not hide own actives. Joined-only Groups excluded. Does not expose match/DM/peer identities or p2p_discover_enabled.';
