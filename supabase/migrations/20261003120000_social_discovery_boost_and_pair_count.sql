-- LOCAL ONLY — do not apply to production until explicitly approved.
-- Home social Event discovery foundation (rebased onto live feed tip):
-- 1) posts.social_discovery_boosted_at (editorial rail priority)
-- 2) reviewer-gated set_post_social_discovery_boost
-- 3) get_feed_with_related_data: discoverable_pair_count + social_discovery_boosted_at ONLY
--
-- Feed base: production tip 20260924120000_feed_profile_published_media_manifest
-- plus hangout Addis calendar-day eligibility from 20260924120100.
-- Preserves created_at pagination, media manifest, and Group count CTE.
-- Does NOT import unapplied 202609291 ranking/slot0/comment.
-- Hangout WHERE must stay in lockstep with 20260924120100 so this file cannot
-- overwrite the calendar-day correction with instant >= now().
-- No new indexes.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS social_discovery_boosted_at timestamptz NULL;

COMMENT ON COLUMN public.posts.social_discovery_boosted_at IS
  'Editorial Home social-discovery rail priority. NULL = not prioritized; non-NULL = reviewer boosted (timestamp).';

CREATE OR REPLACE FUNCTION public.set_post_social_discovery_boost(
  p_post_id uuid,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_type text;
  v_boosted_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_report_reviewer(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing post id';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Missing enabled flag';
  END IF;

  SELECT p.type::text
  INTO v_type
  FROM public.posts p
  WHERE p.id = p_post_id
  FOR UPDATE;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_type <> 'hangout' THEN
    RAISE EXCEPTION 'Only Event posts can be prioritized for social discovery';
  END IF;

  IF p_enabled THEN
    UPDATE public.posts
    SET social_discovery_boosted_at = now()
    WHERE id = p_post_id
    RETURNING social_discovery_boosted_at INTO v_boosted_at;
  ELSE
    UPDATE public.posts
    SET social_discovery_boosted_at = NULL
    WHERE id = p_post_id
    RETURNING social_discovery_boosted_at INTO v_boosted_at;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'post_id', p_post_id,
    'enabled', p_enabled,
    'social_discovery_boosted_at', v_boosted_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_post_social_discovery_boost(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_post_social_discovery_boost(uuid, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.set_post_social_discovery_boost(uuid, boolean) IS
  'Reviewer-only: set/clear posts.social_discovery_boosted_at for Event (hangout) social-discovery rail priority.';

CREATE OR REPLACE FUNCTION public.get_feed_with_related_data(p_type post_type DEFAULT NULL::post_type, p_tags text[] DEFAULT NULL::text[], p_search text DEFAULT NULL::text, p_limit integer DEFAULT 12, p_offset integer DEFAULT 0, p_viewer_user_id uuid DEFAULT NULL::uuid, p_occurs_on date DEFAULT NULL::date, p_occurs_tz text DEFAULT NULL::text, p_friends_only boolean DEFAULT false, p_occurs_from date DEFAULT NULL::date, p_occurs_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_result JSONB;
  v_posts JSONB;
  v_true_total INTEGER;
BEGIN
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  WITH
  eligible_base AS (
    SELECT DISTINCT p.id, p.created_at
    FROM posts p
    INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
    LEFT JOIN follows mutual_follow ON
      mutual_follow.follower_id = v_viewer_profile_id
      AND mutual_follow.following_id = author_profile.id
    LEFT JOIN follows reverse_follow ON
      reverse_follow.follower_id = author_profile.id
      AND reverse_follow.following_id = v_viewer_profile_id
    WHERE
      (p_type IS NULL OR p.type = p_type)
      AND (p_tags IS NULL OR (p.tags IS NOT NULL AND p.tags && p_tags))
      AND (
        p_search IS NULL
        OR EXISTS (
          SELECT 1
          FROM regexp_split_to_table(btrim(p_search), '[[:space:]]+') AS qsplit(raw_tok)
          CROSS JOIN LATERAL (
            SELECT NULLIF(regexp_replace(lower(btrim(qsplit.raw_tok)), '^#+', ''), '') AS nq
          ) n
          WHERE n.nq IS NOT NULL
          AND (
            p.caption ILIKE '%' || n.nq || '%'
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) AS tag_arr(t)
              WHERE NULLIF(regexp_replace(lower(btrim(tag_arr.t)), '^#+', ''), '') IS NOT NULL
              AND regexp_replace(lower(btrim(tag_arr.t)), '^#+', '') ILIKE '%' || n.nq || '%'
            )
          )
        )
      )
      AND (
        author_profile.is_private = false
        OR v_viewer_profile_id = author_profile.id
        OR (author_profile.is_private = true AND mutual_follow.status = 'approved')
      )
      AND (
        p.visibility IS NULL
        OR p.visibility = 'public'
        OR p.visibility = 'anonymous'
        OR v_viewer_profile_id = author_profile.id
        OR (p.visibility = 'friends' AND mutual_follow.status = 'approved' AND reverse_follow.status = 'approved')
      )
      AND COALESCE(p.status, 'published') = 'published'
      AND (
        p.type != 'hangout'
        OR (
          p.type = 'hangout'
          AND (
            COALESCE(p.is_recurring, false) = true
            OR COALESCE(jsonb_array_length(p.selected_dates), 0) = 0
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
              WHERE NULLIF(trim(elem), '') IS NOT NULL
                AND ((trim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
                  >= (timezone('Africa/Addis_Ababa', now()))::date
            )
          )
        )
      )
      AND (
        p_viewer_user_id IS NULL
        OR NOT public.users_are_blocked_pair(p_viewer_user_id, p.author_id)
      )
      -- Optional friends-only filter: mutual approved follow in both directions (excludes self posts).
      AND (
        NOT COALESCE(p_friends_only, false)
        OR (
          mutual_follow.status = 'approved'
          AND reverse_follow.status = 'approved'
        )
      )
      -- Optional viewer-local occurrence filter (three modes; all skipped when inactive):
      -- 1) No filter â€” neither range nor single-day params fully set.
      -- 2) Range mode (week filters) â€” p_occurs_from + p_occurs_to + p_occurs_tz all set.
      --    Experiences qualify only via selected_dates in range (A).
      --    Recurring hangouts may qualify via any weekday in range (B).
      -- 3) Single-day mode (Today/Tomorrow spotlight) â€” p_occurs_on + p_occurs_tz when range inactive.
      AND (
        (
          (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
          AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
        )
        OR (
          p_occurs_from IS NOT NULL
          AND p_occurs_to IS NOT NULL
          AND p_occurs_tz IS NOT NULL
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS sched
              WHERE NULLIF(trim(sched), '') IS NOT NULL
                AND (((trim(sched))::timestamptz AT TIME ZONE p_occurs_tz)::date
                     BETWEEN p_occurs_from AND p_occurs_to)
            )
            OR (
              p.type = 'hangout'
              AND COALESCE(p.is_recurring, false) = true
              AND EXISTS (
                SELECT 1
                FROM generate_series(
                  p_occurs_from::timestamp,
                  p_occurs_to::timestamp,
                  interval '1 day'
                ) AS gs(d)
                CROSS JOIN unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
                WHERE trim(rec.code) = CASE EXTRACT(ISODOW FROM gs.d::date)::int
                  WHEN 1 THEN 'MO'
                  WHEN 2 THEN 'TU'
                  WHEN 3 THEN 'WE'
                  WHEN 4 THEN 'TH'
                  WHEN 5 THEN 'FR'
                  WHEN 6 THEN 'SA'
                  WHEN 7 THEN 'SU'
                END
              )
            )
          )
        )
        OR (
          (p_occurs_from IS NULL OR p_occurs_to IS NULL)
          AND p_occurs_on IS NOT NULL
          AND p_occurs_tz IS NOT NULL
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS sched
              WHERE NULLIF(trim(sched), '') IS NOT NULL
                AND (((trim(sched))::timestamptz AT TIME ZONE p_occurs_tz)::date = p_occurs_on)
            )
            OR (
              p.type = 'hangout'
              AND COALESCE(p.is_recurring, false) = true
              AND EXISTS (
                SELECT 1
                FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
                WHERE trim(rec.code) = CASE EXTRACT(ISODOW FROM p_occurs_on)::int
                  WHEN 1 THEN 'MO'
                  WHEN 2 THEN 'TU'
                  WHEN 3 THEN 'WE'
                  WHEN 4 THEN 'TH'
                  WHEN 5 THEN 'FR'
                  WHEN 6 THEN 'SA'
                  WHEN 7 THEN 'SU'
                END
              )
            )
          )
        )
      )
  ),
  true_total_cte AS (
    SELECT COUNT(*)::INTEGER AS cnt FROM eligible_base
  ),
  page_ids AS (
    SELECT id FROM eligible_base
    ORDER BY created_at DESC, id DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  -- Social snapshot: page_ids only (never eligible_base).
  viewer_pair_own AS (
    SELECT DISTINCT o.source_post_id
    FROM public.social_opportunities o
    INNER JOIN page_ids pi ON pi.id = o.source_post_id
    WHERE p_viewer_user_id IS NOT NULL
      AND o.kind = 'pair_up'
      AND o.status = 'active'
      AND o.creator_id = p_viewer_user_id
  ),
  viewer_open_plan_own AS (
    SELECT DISTINCT o.source_post_id
    FROM public.social_opportunities o
    INNER JOIN page_ids pi ON pi.id = o.source_post_id
    WHERE p_viewer_user_id IS NOT NULL
      AND o.kind = 'open_plan'
      AND o.status = 'active'
      AND o.creator_id = p_viewer_user_id
  ),
  viewer_group_own AS (
    SELECT DISTINCT o.source_post_id
    FROM public.social_opportunities o
    INNER JOIN page_ids pi ON pi.id = o.source_post_id
    WHERE p_viewer_user_id IS NOT NULL
      AND o.kind = 'group_up'
      AND o.status = 'active'
      AND o.creator_id = p_viewer_user_id
  ),
  -- Same discoverable filters as get_group_up_counts_for_sources.
  group_discoverable_counts AS (
    SELECT
      o.source_post_id,
      count(*)::integer AS cnt
    FROM public.social_opportunities o
    INNER JOIN page_ids pi ON pi.id = o.source_post_id
    INNER JOIN public.conversations c
      ON c.id = o.conversation_id
    INNER JOIN public.posts sp
      ON sp.id = o.source_post_id
    INNER JOIN public.profiles src_author
      ON src_author.user_id = sp.author_id
     AND src_author.deleted_at IS NULL
    WHERE p_viewer_user_id IS NOT NULL
      AND o.kind = 'group_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND public.group_up_source_is_eligible(o.source_post_id)
      AND public.can_view_post(sp.id)
      AND COALESCE(sp.status, 'published') = 'published'
      AND sp.visibility = 'public'
      AND COALESCE(src_author.is_private, false) = false
      AND sp.type IN ('hangout', 'experience')
      AND NOT public.users_are_blocked_pair(p_viewer_user_id, o.creator_id)
      AND NOT public.users_are_blocked_pair(p_viewer_user_id, sp.author_id)
      AND (
        o.creator_id = p_viewer_user_id
        OR EXISTS (
          SELECT 1
          FROM public.conversation_members cm
          WHERE cm.conversation_id = o.conversation_id
            AND cm.user_id = p_viewer_user_id
            AND cm.left_at IS NULL
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.group_up_requests dec
            WHERE dec.opportunity_id = o.id
              AND dec.requester_id = p_viewer_user_id
              AND dec.status = 'declined'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.group_up_requests acc
            WHERE acc.opportunity_id = o.id
              AND acc.requester_id = p_viewer_user_id
              AND acc.status = 'accepted'
          )
        )
      )
    GROUP BY o.source_post_id
  ),
  -- Active discoverable Pair Ups (Duo) for page_ids only — mirrors Group page-scoped aggregate.
  pair_discoverable_counts AS (
    SELECT
      o.source_post_id,
      count(*)::integer AS cnt
    FROM public.social_opportunities o
    INNER JOIN page_ids pi ON pi.id = o.source_post_id
    INNER JOIN public.posts sp
      ON sp.id = o.source_post_id
    WHERE p_viewer_user_id IS NOT NULL
      AND o.kind = 'pair_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND public.people_source_is_eligible(o.source_post_id)
      AND NOT public.users_are_blocked_pair(p_viewer_user_id, o.creator_id)
      AND NOT public.users_are_blocked_pair(p_viewer_user_id, sp.author_id)
    GROUP BY o.source_post_id
  ),
  filtered_posts AS (
    SELECT
      p.id,
      p.type,
      p.caption,
      p.is_anonymous,
      p.anonymous_name,
      p.anonymous_avatar,
      p.created_at,
      p.selected_dates,
      p.tags,
      p.author_id,
      jsonb_build_object(
        'id', author_profile.id,
        'username', author_profile.username,
        'display_name', author_profile.display_name,
        'avatar_url', author_profile.avatar_url
      ) AS author,
      CASE
        WHEN v_viewer_profile_id IS NULL THEN 'none'
        WHEN v_viewer_profile_id = author_profile.id THEN 'self'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
             AND reverse_follow.follower_id IS NOT NULL AND reverse_follow.status = 'approved'
        THEN 'friends'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'approved'
        THEN 'following'
        WHEN mutual_follow.follower_id IS NOT NULL AND mutual_follow.status = 'pending'
        THEN 'pending'
        ELSE 'none'
      END AS follow_status,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_like.post_id IS NOT NULL THEN true ELSE false END AS is_liked,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_save.post_id IS NOT NULL THEN true ELSE false END AS is_saved,
      COALESCE(p.like_count, 0) AS like_count,
      COALESCE(p.save_count, 0) AS save_count,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(p.like_count, 0) + COALESCE(demo.demo_like_count, 0)
        ELSE COALESCE(p.like_count, 0)
      END AS effective_like_count,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(p.save_count, 0) + COALESCE(demo.demo_save_count, 0)
        ELSE COALESCE(p.save_count, 0)
      END AS effective_save_count,
      COALESCE(p.comment_count, 0) AS comment_count,
      (SELECT COUNT(*)::int FROM activities a WHERE a.post_id = p.id) AS activity_count,
      EXISTS(
        SELECT 1 FROM activities a
        WHERE a.post_id = p.id AND a.images IS NOT NULL AND array_length(a.images, 1) > 0
      ) AS has_images,
      (
        SELECT (a.images)[1]::text
        FROM activities a
        WHERE a.post_id = p.id AND a.images IS NOT NULL AND array_length(a.images, 1) > 0
        ORDER BY a.order_idx ASC NULLS LAST
        LIMIT 1
      ) AS first_image_url,
      (
        SELECT COALESCE(SUM(array_length(a.images, 1)), 0)::int
        FROM activities a
        WHERE a.post_id = p.id
      ) AS image_count,
      CASE
        WHEN p.type = 'hangout' THEN
          jsonb_build_object(
            'currentUserStatus', COALESCE(user_rsvp.status, NULL),
            'going_count', COALESCE(rsvp_going_cnt.cnt, 0)
          )
        ELSE NULL
      END AS rsvp_data,
      p.rsvp_capacity AS rsvp_capacity,
      p.rating_enabled,
      p.rating_average,
      p.rating_count,
      CASE
        WHEN p.type = 'experience' THEN
          CASE
            WHEN (COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0)) = 0 THEN 0
            ELSE ROUND(
              (
                (COALESCE(demo.demo_rating_average, 0)::numeric * COALESCE(demo.demo_rating_count, 0)::numeric) +
                (COALESCE(p.rating_average, 0)::numeric * COALESCE(p.rating_count, 0)::numeric)
              ) / NULLIF((COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0))::numeric, 0),
              2
            )
          END
        ELSE COALESCE(p.rating_average, 0)
      END AS effective_rating_average,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0)
        ELSE COALESCE(p.rating_count, 0)
      END AS effective_rating_count,
      (
        SELECT pr.stars
        FROM post_ratings pr
        WHERE pr.post_id = p.id
          AND pr.user_id = p_viewer_user_id
        LIMIT 1
      ) AS viewer_rating,
      p.is_recurring AS is_recurring,
      p.recurrence_days AS recurrence_days,
      CASE
        WHEN p_viewer_user_id IS NULL THEN NULL
        WHEN p.type = 'hangout' THEN (viewer_pair_own.source_post_id IS NOT NULL)
        WHEN p.type = 'experience' THEN (viewer_open_plan_own.source_post_id IS NOT NULL)
        ELSE false
      END AS duo_own_active,
      CASE
        WHEN p_viewer_user_id IS NULL THEN NULL
        ELSE (viewer_group_own.source_post_id IS NOT NULL)
      END AS group_own_active,
      CASE
        WHEN p_viewer_user_id IS NULL THEN NULL
        ELSE COALESCE(group_discoverable_counts.cnt, 0)
      END AS discoverable_group_count,
      CASE
        WHEN p_viewer_user_id IS NULL THEN NULL
        ELSE COALESCE(pair_discoverable_counts.cnt, 0)
      END AS discoverable_pair_count,
      p.social_discovery_boosted_at AS social_discovery_boosted_at,
      p.media_order AS media_order,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', pm.id,
              'bunny_video_id', pm.bunny_video_id,
              'video_status', pm.video_status,
              'poster_url', pm.poster_url,
              'duration_sec', pm.duration_sec,
              'width', pm.width,
              'height', pm.height,
              'sort_order', pm.sort_order
            )
            ORDER BY pm.sort_order ASC NULLS LAST, pm.id ASC
          )
          FROM public.post_media pm
          WHERE pm.post_id = p.id
        ),
        '[]'::jsonb
      ) AS post_media
    FROM page_ids
    INNER JOIN posts p ON p.id = page_ids.id
    INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
    LEFT JOIN follows mutual_follow ON
      mutual_follow.follower_id = v_viewer_profile_id
      AND mutual_follow.following_id = author_profile.id
    LEFT JOIN follows reverse_follow ON
      reverse_follow.follower_id = author_profile.id
      AND reverse_follow.following_id = v_viewer_profile_id
    LEFT JOIN post_likes user_like ON
      user_like.post_id = p.id AND user_like.user_id = p_viewer_user_id
    LEFT JOIN saved_posts user_save ON
      user_save.post_id = p.id AND user_save.user_id = p_viewer_user_id
    LEFT JOIN public.post_demo_engagement demo ON
      demo.post_id = p.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt
      FROM rsvp_responses r
      WHERE r.post_id = p.id AND r.status = 'going'
    ) rsvp_going_cnt ON true
    LEFT JOIN rsvp_responses user_rsvp ON
      user_rsvp.post_id = p.id AND user_rsvp.user_id = p_viewer_user_id
    LEFT JOIN viewer_pair_own ON viewer_pair_own.source_post_id = p.id
    LEFT JOIN viewer_open_plan_own ON viewer_open_plan_own.source_post_id = p.id
    LEFT JOIN viewer_group_own ON viewer_group_own.source_post_id = p.id
    LEFT JOIN group_discoverable_counts ON group_discoverable_counts.source_post_id = p.id
    LEFT JOIN pair_discoverable_counts ON pair_discoverable_counts.source_post_id = p.id
    ORDER BY p.created_at DESC, p.id DESC
  )
  SELECT
    (SELECT cnt FROM true_total_cte),
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id', fp.id,
        'caption', fp.caption,
        'author', fp.author,
        'created_at', fp.created_at,
        'type', fp.type,
        'tags', fp.tags,
        'is_liked', fp.is_liked,
        'is_saved', fp.is_saved,
        'like_count', fp.like_count,
        'save_count', fp.save_count,
        'effective_like_count', fp.effective_like_count,
        'effective_save_count', fp.effective_save_count,
        'comment_count', fp.comment_count,
        'follow_status', fp.follow_status,
        'activity_count', fp.activity_count,
        'first_image_url', fp.first_image_url,
        'has_images', fp.has_images,
        'image_count', fp.image_count,
        'is_anonymous', fp.is_anonymous,
        'anonymous_name', fp.anonymous_name,
        'anonymous_avatar', fp.anonymous_avatar,
        'selected_dates', fp.selected_dates,
        'author_id', fp.author_id,
        'rsvp_data', fp.rsvp_data,
        'rsvp_capacity', fp.rsvp_capacity,
        'rating_enabled', fp.rating_enabled,
        'rating_average', fp.rating_average,
        'rating_count', fp.rating_count,
        'effective_rating_average', fp.effective_rating_average,
        'effective_rating_count', fp.effective_rating_count,
        'viewer_rating', fp.viewer_rating,
        'is_recurring', fp.is_recurring,
        'recurrence_days', fp.recurrence_days,
        'duo_own_active', fp.duo_own_active,
        'group_own_active', fp.group_own_active,
        'discoverable_group_count', fp.discoverable_group_count,
        'discoverable_pair_count', fp.discoverable_pair_count,
        'social_discovery_boosted_at', fp.social_discovery_boosted_at,
        'media_order', fp.media_order,
        'post_media', fp.post_media
      ) ORDER BY fp.created_at DESC
    ) FROM filtered_posts fp)
  INTO v_true_total, v_posts
  FROM true_total_cte
  LIMIT 1;

  v_result := jsonb_build_object(
    'posts', COALESCE(v_posts, '[]'::jsonb),
    'count', COALESCE(v_true_total, 0)
  );

  RETURN v_result;
END;
$function$;
