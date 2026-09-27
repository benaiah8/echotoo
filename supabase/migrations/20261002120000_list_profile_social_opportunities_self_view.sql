-- LOCAL ONLY — do not apply until explicitly approved.
-- Follow-up: list_profile_social_opportunities self-view.
--
-- Production already has 20261001120000_profile_social_opportunities (applied as
-- 20260911001258). This replaces ONLY list_profile_social_opportunities.
--
-- Self view:
--   - owner Discover OFF does NOT hide the rail from the owner
--   - owner may see their own active Duo + hosted Group rows
-- Other viewers: unchanged Discover / privacy / self-exclusion semantics.
--
-- Does NOT change connect_profile_pair_up.

CREATE OR REPLACE FUNCTION public.list_profile_social_opportunities(
  p_profile_user_id uuid
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
  v_empty jsonb := jsonb_build_object('opportunities', '[]'::jsonb);
  v_rows jsonb := '[]'::jsonb;
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

  WITH duo_rows AS (
    SELECT
      'duo'::text AS kind,
      o.id AS opportunity_id,
      o.source_post_id,
      p.type AS source_type,
      p.caption AS source_caption,
      p.author_id AS source_author_id,
      author_pr.id AS source_author_profile_id,
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
      NULL::timestamptz AS occurs_at,
      NULL::boolean AS occurs_time_explicit,
      NULL::text AS group_title,
      NULL::uuid AS conversation_id,
      o.discoverable_until,
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
      NULL::text AS viewer_group_state,
      NULL::uuid AS request_id,
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
  group_rows AS (
    SELECT
      'group'::text AS kind,
      o.id AS opportunity_id,
      o.source_post_id,
      p.type AS source_type,
      p.caption AS source_caption,
      p.author_id AS source_author_id,
      author_pr.id AS source_author_profile_id,
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
      o.conversation_id,
      o.discoverable_until,
      o.created_at,
      false AS viewer_duo_joined,
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
      -- Hosted only: creator_id filter above. Exclude declined requesters from browse-style UX.
      AND NOT EXISTS (
        SELECT 1
        FROM public.group_up_requests dec
        WHERE dec.opportunity_id = o.id
          AND dec.requester_id = v_me
          AND dec.status = 'declined'
      )
  ),
  mixed AS (
    SELECT * FROM duo_rows
    UNION ALL
    SELECT * FROM group_rows
  ),
  -- Compact Profile preview: next 8 actionable rows after mixed ordering.
  bounded AS (
    SELECT *
    FROM mixed m
    ORDER BY m.sort_at ASC NULLS LAST, m.created_at ASC, m.opportunity_id ASC
    LIMIT 8
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'kind', b.kind,
        'opportunity_id', b.opportunity_id,
        'source_post_id', b.source_post_id,
        'source_type', b.source_type,
        'source_caption', b.source_caption,
        'source_cover_url', b.source_cover_url,
        'source_author_id', b.source_author_id,
        'source_author_profile_id', b.source_author_profile_id,
        'source_selected_dates', b.source_selected_dates,
        'source_recurrence_days', b.source_recurrence_days,
        'source_is_recurring', b.source_is_recurring,
        'occurs_at', b.occurs_at,
        'occurs_time_explicit', b.occurs_time_explicit,
        'group_title', b.group_title,
        'created_at', b.created_at,
        'viewer_duo_joined', b.viewer_duo_joined,
        'viewer_group_state', b.viewer_group_state,
        'request_id', b.request_id
      )
      ORDER BY b.sort_at ASC NULLS LAST, b.created_at ASC, b.opportunity_id ASC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM bounded b;

  RETURN jsonb_build_object('opportunities', COALESCE(v_rows, '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.list_profile_social_opportunities(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_profile_social_opportunities(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.list_profile_social_opportunities(uuid) IS
  'Viewer-scoped Profile rail: up to 8 active Duo participations + hosted Groups for one profile owner (ordered by next actionable sort_at). Other viewers: empty when owner People discoverability is OFF. Self: Discover OFF does not hide own active opportunities. Does not expose match/DM/peer identities or p2p_discover_enabled.';
