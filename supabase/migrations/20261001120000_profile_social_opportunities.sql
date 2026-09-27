-- LOCAL ONLY — do not apply until explicitly approved.
-- Profile social opportunities (other-person Profile rail).
--
-- Adds:
--   list_profile_social_opportunities(p_profile_user_id)
--   connect_profile_pair_up(p_to_opportunity_id)
--
-- Does NOT change:
--   connect_discover_pair_up Discover preference semantics
--   list_discover_pair_up_candidates / My Plans / Group browse
--   Home feed ranking
--
-- Reuses:
--   people_source_is_eligible, group_up_source_is_eligible
--   can_view_post, users_are_blocked_pair
--   join_pair_up, express_pair_up_interest

-- ---------------------------------------------------------------------------
-- list_profile_social_opportunities
-- ---------------------------------------------------------------------------
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

  -- People discoverability OFF → no Profile Duo / hosted-Group rows.
  -- Never return p2p_discover_enabled to the client.
  IF v_owner.p2p_discover_enabled IS NOT TRUE THEN
    RETURN v_empty;
  END IF;

  IF public.users_are_blocked_pair(v_me, p_profile_user_id) THEN
    RETURN v_empty;
  END IF;

  SELECT pr.id
  INTO v_viewer_profile_id
  FROM public.profiles pr
  WHERE pr.user_id = v_me
    AND pr.deleted_at IS NULL;

  -- Private profile: approved follower (or self) required — mirrors feed access.
  IF COALESCE(v_owner.is_private, false) = true
     AND v_me <> p_profile_user_id THEN
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
      AND o.creator_id <> v_me
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
      AND o.creator_id <> v_me
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
  'Viewer-scoped Profile rail: up to 8 active Duo participations + hosted discoverable Groups for one profile owner (ordered by next actionable sort_at). Empty when owner People discoverability is OFF. Does not expose match/DM/peer identities or p2p_discover_enabled.';

-- ---------------------------------------------------------------------------
-- connect_profile_pair_up
-- Atomic Profile Connect: join pool if needed + express interest.
-- Does NOT require viewer p2p_discover_enabled (deliberate same-source join).
-- Still requires target opportunity active + people_source_is_eligible.
-- Does NOT flip viewer Discover preference.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.connect_profile_pair_up(
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
  v_target_creator uuid;
  v_source_post_id uuid;
  v_target_discover boolean;
  v_mine_id uuid;
  v_join jsonb;
  v_express jsonb;
  v_opportunity jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_to_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing target opportunity';
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
    RAISE EXCEPTION 'Cannot connect with yourself';
  END IF;

  v_target_creator := v_to.creator_id;
  v_source_post_id := v_to.source_post_id;

  -- Lock profiles to serialize Discover OFF / deletion races on the *target*
  -- (viewer Discover is intentionally not required for Profile Connect).
  PERFORM pr.user_id
  FROM public.profiles pr
  WHERE pr.user_id IN (v_me, v_target_creator)
  ORDER BY pr.user_id
  FOR UPDATE;

  SELECT pr.p2p_discover_enabled
  INTO v_target_discover
  FROM public.profiles pr
  WHERE pr.user_id = v_target_creator
    AND pr.deleted_at IS NULL;

  -- Profile opportunities only exist while target discoverability is ON.
  IF NOT FOUND OR v_target_discover IS NOT TRUE THEN
    RAISE EXCEPTION 'Target is not available on Profile';
  END IF;

  IF NOT public.people_source_is_eligible(v_source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_target_creator) THEN
    RAISE EXCEPTION 'Cannot Pair Up with this user';
  END IF;

  SELECT mine.id
  INTO v_mine_id
  FROM public.social_opportunities mine
  WHERE mine.kind = 'pair_up'
    AND mine.status = 'active'
    AND mine.discoverable_until > now()
    AND mine.creator_id = v_me
    AND mine.source_post_id = v_source_post_id
  LIMIT 1;

  IF v_mine_id IS NULL THEN
    v_join := public.join_pair_up(v_source_post_id, NULL);
    v_opportunity := v_join -> 'opportunity';
    IF v_opportunity IS NULL OR jsonb_typeof(v_opportunity) = 'null' THEN
      RAISE EXCEPTION 'Join failed';
    END IF;
  ELSE
    v_opportunity := (
      SELECT jsonb_build_object(
        'id', mine.id,
        'source_post_id', mine.source_post_id,
        'status', mine.status,
        'description', mine.description,
        'discoverable_until', mine.discoverable_until,
        'created_at', mine.created_at
      )
      FROM public.social_opportunities mine
      WHERE mine.id = v_mine_id
    );
  END IF;

  v_express := public.express_pair_up_interest(p_to_opportunity_id);

  RETURN jsonb_build_object(
    'opportunity', v_opportunity,
    'from_opportunity_id', v_express ->> 'from_opportunity_id',
    'to_opportunity_id', v_express ->> 'to_opportunity_id',
    'matched', COALESCE((v_express ->> 'matched')::boolean, false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.connect_profile_pair_up(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_profile_pair_up(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.connect_profile_pair_up(uuid) IS
  'Atomic Profile Connect: join_pair_up if needed then express_pair_up_interest. Does not require viewer Discover ON and does not flip Discover preference. Requires target People discoverability ON + eligible active Pair Up.';
