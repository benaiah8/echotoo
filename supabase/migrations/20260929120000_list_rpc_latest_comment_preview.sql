-- Bundle one latest eligible top-level comment preview into list RPCs.
-- Replaces only get_feed_with_related_data, get_user_posts_created_with_related_data,
-- and get_user_posts_saved_with_related_data. Does not replace Post Detail.
-- Base: exact LIVE production bodies (slot0 location/key-info enrichment already present).
-- Only semantic addition: page-scoped LEFT JOIN LATERAL latest_comment_preview
-- { id, author_label, text<=160 }. No new indexes. No comment arrays.

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
    SELECT DISTINCT
      p.id,
      p.created_at,
      p.type AS post_type,
      COALESCE(p.like_count, 0) AS like_count,
      COALESCE(p.save_count, 0) AS save_count,
      COALESCE(p.comment_count, 0) AS comment_count,
      COALESCE(p.rating_count, 0) AS rating_count,
      CASE
        WHEN v_viewer_profile_id IS NULL THEN 3
        WHEN v_viewer_profile_id = author_profile.id THEN 0
        WHEN mutual_follow.status = 'approved'
             AND reverse_follow.status = 'approved'
        THEN 1
        WHEN mutual_follow.status = 'approved' THEN 2
        ELSE 3
      END AS rel_rank
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
            OR (
              p_type IS NULL
              AND COALESCE(jsonb_array_length(p.selected_dates), 0) = 0
            )
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
      AND (
        NOT COALESCE(p_friends_only, false)
        OR (
          mutual_follow.status = 'approved'
          AND reverse_follow.status = 'approved'
        )
      )
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
  eligible_ranked AS (
    SELECT
      eb.id,
      eb.created_at,
      eb.rel_rank,
      eb.post_type,
      eb.like_count,
      eb.save_count,
      eb.comment_count,
      eb.rating_count,
      CASE
        WHEN p_occurs_from IS NOT NULL
          AND p_occurs_to IS NOT NULL
          AND p_occurs_tz IS NOT NULL
        THEN (
          SELECT MIN(matches.match_day)
          FROM (
            SELECT ((trim(sched))::timestamptz AT TIME ZONE p_occurs_tz)::date AS match_day
            FROM public.posts p
            CROSS JOIN LATERAL jsonb_array_elements_text(
              COALESCE(p.selected_dates, '[]'::jsonb)
            ) AS sched
            WHERE p.id = eb.id
              AND NULLIF(trim(sched), '') IS NOT NULL
              AND (((trim(sched))::timestamptz AT TIME ZONE p_occurs_tz)::date
                   BETWEEN p_occurs_from AND p_occurs_to)
            UNION ALL
            SELECT gs.d::date AS match_day
            FROM public.posts p
            CROSS JOIN generate_series(
              p_occurs_from::timestamp,
              p_occurs_to::timestamp,
              interval '1 day'
            ) AS gs(d)
            CROSS JOIN unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
            WHERE p.id = eb.id
              AND p.type = 'hangout'
              AND COALESCE(p.is_recurring, false) = true
              AND trim(rec.code) = CASE EXTRACT(ISODOW FROM gs.d::date)::int
                WHEN 1 THEN 'MO'
                WHEN 2 THEN 'TU'
                WHEN 3 THEN 'WE'
                WHEN 4 THEN 'TH'
                WHEN 5 THEN 'FR'
                WHEN 6 THEN 'SA'
                WHEN 7 THEN 'SU'
              END
          ) matches
        )
        ELSE NULL
      END AS earliest_match_day,
      CASE
        WHEN (
          (
            p_type = 'hangout'
            AND (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
            AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
          )
          OR (
            COALESCE(p_friends_only, false)
            AND p_type IS NULL
            AND (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
            AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
          )
          OR (
            p_type IS NULL
            AND NOT COALESCE(p_friends_only, false)
            AND p_search IS NULL
            AND p_tags IS NULL
            AND (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
            AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
          )
        )
        THEN (
          SELECT MIN(cands.d)
          FROM (
            SELECT ((trim(sched))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date AS d
            FROM public.posts p
            CROSS JOIN LATERAL jsonb_array_elements_text(
              COALESCE(p.selected_dates, '[]'::jsonb)
            ) AS sched
            WHERE p.id = eb.id
              AND NULLIF(trim(sched), '') IS NOT NULL
              AND ((trim(sched))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
                >= (timezone('Africa/Addis_Ababa', now()))::date
            UNION ALL
            SELECT gs.d::date AS d
            FROM public.posts p
            CROSS JOIN generate_series(
              (timezone('Africa/Addis_Ababa', now()))::date::timestamp,
              ((timezone('Africa/Addis_Ababa', now()))::date + 6)::timestamp,
              interval '1 day'
            ) AS gs(d)
            CROSS JOIN unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
            WHERE p.id = eb.id
              AND p.type = 'hangout'
              AND COALESCE(p.is_recurring, false) = true
              AND trim(rec.code) = CASE EXTRACT(ISODOW FROM gs.d::date)::int
                WHEN 1 THEN 'MO'
                WHEN 2 THEN 'TU'
                WHEN 3 THEN 'WE'
                WHEN 4 THEN 'TH'
                WHEN 5 THEN 'FR'
                WHEN 6 THEN 'SA'
                WHEN 7 THEN 'SU'
              END
          ) cands
        )
        ELSE NULL
      END AS next_relevant_day
    FROM eligible_base eb
  ),
  ranked_keys AS (
    SELECT
      er.id,
      er.created_at,
      er.rel_rank,
      er.post_type,
      er.earliest_match_day,
      er.next_relevant_day,
      CASE
        WHEN COALESCE(p_friends_only, false)
          AND p_type IS NULL
          AND (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
          AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
          AND er.post_type = 'hangout'
          AND er.next_relevant_day IS NOT NULL
          AND er.next_relevant_day >= (timezone('Africa/Addis_Ababa', now()))::date
          AND er.next_relevant_day < ((timezone('Africa/Addis_Ababa', now()))::date + 7)
        THEN 0
        ELSE 1
      END AS urgency_bucket,
      CASE
        WHEN er.created_at >= (now() - interval '1 day') THEN 4
        WHEN er.created_at >= (now() - interval '3 days') THEN 3
        WHEN er.created_at >= (now() - interval '7 days') THEN 2
        WHEN er.created_at >= (now() - interval '30 days') THEN 1
        ELSE 0
      END AS freshness_pts,
      CASE er.rel_rank
        WHEN 1 THEN 4
        WHEN 2 THEN 3
        WHEN 0 THEN 1
        ELSE 0
      END AS rel_pts,
      CASE
        WHEN er.post_type = 'hangout'
          AND er.next_relevant_day IS NOT NULL
          AND er.next_relevant_day >= (timezone('Africa/Addis_Ababa', now()))::date
          AND er.next_relevant_day < ((timezone('Africa/Addis_Ababa', now()))::date + 7)
        THEN 3
        ELSE 0
      END AS urgency_pts,
      LEAST(
        2,
        FLOOR((
          ln(1::numeric + COALESCE(er.like_count, 0)::numeric)
          + ln(1::numeric + COALESCE(er.save_count, 0)::numeric)
          + ln(1::numeric + COALESCE(er.comment_count, 0)::numeric)
          + CASE
              WHEN er.post_type = 'experience'
              THEN 0.25 * ln(1::numeric + COALESCE(er.rating_count, 0)::numeric)
              ELSE 0::numeric
            END
        ) / 2)::integer
      ) AS engagement_pts
    FROM eligible_ranked er
  ),
  ordered_ids AS (
    SELECT
      rk.*,
      (
        rk.freshness_pts
        + rk.rel_pts
        + rk.urgency_pts
        + rk.engagement_pts
      ) AS all_score,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE
            WHEN p_type IS NULL
              AND NOT COALESCE(p_friends_only, false)
              AND p_search IS NULL
              AND p_tags IS NULL
              AND (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
              AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
            THEN (
              rk.freshness_pts
              + rk.rel_pts
              + rk.urgency_pts
              + rk.engagement_pts
            )
            ELSE NULL
          END DESC NULLS LAST,
          CASE
            WHEN p_occurs_from IS NOT NULL
              AND p_occurs_to IS NOT NULL
              AND p_occurs_tz IS NOT NULL
            THEN rk.earliest_match_day
            ELSE NULL
          END ASC NULLS LAST,
          CASE
            WHEN p_type = 'hangout'
              AND (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
              AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
            THEN rk.next_relevant_day
            ELSE NULL
          END ASC NULLS LAST,
          CASE
            WHEN p_type = 'hangout'
              AND (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
              AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
            THEN rk.rel_rank
            ELSE NULL
          END ASC NULLS LAST,
          CASE
            WHEN p_type = 'experience'
              AND (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
              AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
            THEN rk.rel_rank
            ELSE NULL
          END ASC NULLS LAST,
          CASE
            WHEN COALESCE(p_friends_only, false)
              AND p_type IS NULL
              AND (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
              AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
            THEN rk.urgency_bucket
            ELSE NULL
          END ASC NULLS LAST,
          CASE
            WHEN COALESCE(p_friends_only, false)
              AND p_type IS NULL
              AND (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
              AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
              AND rk.urgency_bucket = 0
            THEN rk.next_relevant_day
            ELSE NULL
          END ASC NULLS LAST,
          rk.created_at DESC,
          rk.id DESC
      ) AS page_ord
    FROM ranked_keys rk
  ),
  page_ids AS (
    SELECT
      id,
      created_at,
      earliest_match_day,
      page_ord
    FROM ordered_ids
    WHERE page_ord > COALESCE(p_offset, 0)
      AND page_ord <= COALESCE(p_offset, 0) + GREATEST(COALESCE(p_limit, 12), 0)
  ),
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
  filtered_posts AS (
    SELECT
      p.id,
      p.type,
      p.caption,
      p.is_anonymous,
      p.anonymous_name,
      p.anonymous_avatar,
      p.created_at,
      page_ids.earliest_match_day,
      page_ids.page_ord,
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
      ) AS post_media,
      slot0.slot0_location_name,
      slot0.slot0_location_url,
      slot0.slot0_key_info,
      latest_comment.latest_comment_preview
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
    LEFT JOIN LATERAL (
      SELECT
        a.location_name AS slot0_location_name,
        a.location_url AS slot0_location_url,
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'title', 'V4KeyInfo',
                'value', COALESCE(ki.elem->>'value', '')
              )
              ORDER BY ki.ord
            ),
            '[]'::jsonb
          )
          FROM (
            SELECT x.elem, x.ord
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(a.additional_info) = 'array' THEN a.additional_info
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY AS x(elem, ord)
            WHERE btrim(COALESCE(x.elem->>'title', '')) = 'V4KeyInfo'
              AND NULLIF(btrim(COALESCE(x.elem->>'value', '')), '') IS NOT NULL
            ORDER BY x.ord
            LIMIT 4
          ) ki
        ) AS slot0_key_info
      FROM activities a
      WHERE a.post_id = p.id
      ORDER BY a.order_idx ASC NULLS LAST, a.created_at ASC
      LIMIT 1
    ) slot0 ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'id', c.id,
        'author_label', COALESCE(
          NULLIF(btrim(pr.display_name), ''),
          NULLIF(btrim(pr.username), ''),
          'Unknown User'
        ),
        'text', left(btrim(c.content), 160)
      ) AS latest_comment_preview
      FROM public.comments c
      LEFT JOIN public.profiles pr
        ON pr.user_id = c.author_id
       AND pr.deleted_at IS NULL
      WHERE c.post_id = p.id
        AND c.parent_id IS NULL
        AND c.is_deleted = false
        AND btrim(c.content) <> ''
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 1
    ) latest_comment ON true
    ORDER BY page_ids.page_ord ASC
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
        'media_order', fp.media_order,
        'post_media', fp.post_media,
        'slot0_location_name', fp.slot0_location_name,
        'slot0_location_url', fp.slot0_location_url,
        'slot0_key_info', fp.slot0_key_info,
        'latest_comment_preview', fp.latest_comment_preview
      ) ORDER BY fp.page_ord ASC
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

CREATE OR REPLACE FUNCTION public.get_user_posts_created_with_related_data(p_user_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_include_drafts boolean DEFAULT false, p_is_owner boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_user_profile_id UUID;
  v_is_owner BOOLEAN;
  v_result JSONB;
  v_posts JSONB;
BEGIN
  v_is_owner := (
    auth.uid() IS NOT NULL
    AND p_user_id = auth.uid()
  );

  SELECT id INTO v_user_profile_id
  FROM profiles
  WHERE user_id = p_user_id AND deleted_at IS NULL
  LIMIT 1;

  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  WITH filtered_posts AS (
    SELECT DISTINCT
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
      p.status,
      jsonb_build_object(
        'id', author_profile.id,
        'username', author_profile.username,
        'display_name', author_profile.display_name,
        'avatar_url', author_profile.avatar_url,
        'is_private', author_profile.is_private
      ) as author,
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
      END as follow_status,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_like.post_id IS NOT NULL THEN true ELSE false END as is_liked,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_save.post_id IS NOT NULL THEN true ELSE false END as is_saved,
      COALESCE(p.like_count, 0) as like_count,
      COALESCE(p.save_count, 0) as save_count,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(p.like_count, 0) + COALESCE(demo.demo_like_count, 0)
        ELSE COALESCE(p.like_count, 0)
      END as effective_like_count,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(p.save_count, 0) + COALESCE(demo.demo_save_count, 0)
        ELSE COALESCE(p.save_count, 0)
      END as effective_save_count,
      COALESCE(p.comment_count, 0) as comment_count,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM activities a
          WHERE a.post_id = p.id
            AND a.images IS NOT NULL
            AND array_length(a.images, 1) > 0
        ) THEN true
        ELSE false
      END as has_images,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'images', to_jsonb(a.images),
              'created_at', a.created_at
            ) ORDER BY a.created_at
          )
          FROM activities a
          WHERE a.post_id = p.id
        ),
        '[]'::jsonb
      ) as activities,
      CASE
        WHEN p.type = 'hangout' THEN
          jsonb_build_object(
            'users', COALESCE(rsvp_users.json_array, '[]'::jsonb),
            'currentUserStatus', COALESCE(user_rsvp.status, NULL)
          )
        ELSE NULL
      END as rsvp_data,
      p.rsvp_capacity as rsvp_capacity,
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
      END as effective_rating_average,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0)
        ELSE COALESCE(p.rating_count, 0)
      END as effective_rating_count,
      (
        SELECT pr.stars
        FROM post_ratings pr
        WHERE pr.post_id = p.id
          AND pr.user_id = p_viewer_user_id
        LIMIT 1
      ) as viewer_rating,
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
      ) AS post_media,
      slot0.slot0_location_name,
      slot0.slot0_location_url,
      slot0.slot0_key_info,
      latest_comment.latest_comment_preview
    FROM posts p
    INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
    LEFT JOIN follows mutual_follow ON
      mutual_follow.follower_id = v_viewer_profile_id
      AND mutual_follow.following_id = author_profile.id
    LEFT JOIN follows reverse_follow ON
      reverse_follow.follower_id = author_profile.id
      AND reverse_follow.following_id = v_viewer_profile_id
    LEFT JOIN post_likes user_like ON
      user_like.post_id = p.id
      AND user_like.user_id = p_viewer_user_id
    LEFT JOIN saved_posts user_save ON
      user_save.post_id = p.id
      AND user_save.user_id = p_viewer_user_id
    LEFT JOIN public.post_demo_engagement demo ON
      demo.post_id = p.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        (
          SELECT jsonb_agg(
          jsonb_build_object(
            'id', sub.profile_id,
            'username', sub.username,
            'display_name', sub.display_name,
            'avatar_url', sub.avatar_url,
            'status', sub.status,
            'created_at', sub.created_at
          ) ORDER BY sub.created_at DESC
          )
          FROM (
            SELECT
              rsvp_profile.id as profile_id,
              rsvp_profile.username,
              rsvp_profile.display_name,
              rsvp_profile.avatar_url,
              rsvp_response.status,
              rsvp_response.created_at
            FROM rsvp_responses rsvp_response
            INNER JOIN profiles rsvp_profile ON rsvp_profile.user_id = rsvp_response.user_id AND rsvp_profile.deleted_at IS NULL
            WHERE rsvp_response.post_id = p.id
              AND rsvp_response.status = 'going'
            ORDER BY rsvp_response.created_at DESC
            LIMIT 10
          ) sub
        ),
        '[]'::jsonb
      ) as json_array
    ) rsvp_users ON true
    LEFT JOIN rsvp_responses user_rsvp ON
      user_rsvp.post_id = p.id
      AND user_rsvp.user_id = p_viewer_user_id
    LEFT JOIN LATERAL (
      SELECT
        a.location_name AS slot0_location_name,
        a.location_url AS slot0_location_url,
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'title', 'V4KeyInfo',
                'value', COALESCE(ki.elem->>'value', '')
              )
              ORDER BY ki.ord
            ),
            '[]'::jsonb
          )
          FROM (
            SELECT x.elem, x.ord
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(a.additional_info) = 'array' THEN a.additional_info
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY AS x(elem, ord)
            WHERE btrim(COALESCE(x.elem->>'title', '')) = 'V4KeyInfo'
              AND NULLIF(btrim(COALESCE(x.elem->>'value', '')), '') IS NOT NULL
            ORDER BY x.ord
            LIMIT 4
          ) ki
        ) AS slot0_key_info
      FROM activities a
      WHERE a.post_id = p.id
      ORDER BY a.order_idx ASC NULLS LAST, a.created_at ASC
      LIMIT 1
    ) slot0 ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'id', c.id,
        'author_label', COALESCE(
          NULLIF(btrim(pr.display_name), ''),
          NULLIF(btrim(pr.username), ''),
          'Unknown User'
        ),
        'text', left(btrim(c.content), 160)
      ) AS latest_comment_preview
      FROM public.comments c
      LEFT JOIN public.profiles pr
        ON pr.user_id = c.author_id
       AND pr.deleted_at IS NULL
      WHERE c.post_id = p.id
        AND c.parent_id IS NULL
        AND c.is_deleted = false
        AND btrim(c.content) <> ''
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 1
    ) latest_comment ON true
    WHERE
      p.author_id = p_user_id
      AND (v_is_owner OR p.is_anonymous IS NULL OR p.is_anonymous = false)
      AND (
        CASE
          WHEN v_is_owner THEN
            (COALESCE(p_include_drafts, false)
             OR COALESCE(p.status, 'published') = 'published')
          ELSE
            public.can_view_post(p.id)
        END
      )
      AND (
        v_is_owner
        OR auth.uid() IS NULL
        OR NOT public.users_are_blocked_pair(auth.uid(), p_user_id)
      )
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'type', type,
      'caption', caption,
      'is_anonymous', is_anonymous,
      'anonymous_name', anonymous_name,
      'anonymous_avatar', anonymous_avatar,
      'created_at', created_at,
      'selected_dates', selected_dates,
      'tags', tags,
      'author_id', author_id,
      'status', status,
      'author', author,
      'follow_status', follow_status,
      'is_liked', is_liked,
      'is_saved', is_saved,
      'like_count', like_count,
      'save_count', save_count,
      'effective_like_count', effective_like_count,
      'effective_save_count', effective_save_count,
      'comment_count', comment_count,
      'has_images', has_images,
      'activities', activities,
      'rsvp_data', rsvp_data,
      'rsvp_capacity', rsvp_capacity,
      'rating_enabled', rating_enabled,
      'rating_average', rating_average,
      'rating_count', rating_count,
      'effective_rating_average', effective_rating_average,
      'effective_rating_count', effective_rating_count,
      'viewer_rating', viewer_rating,
      'media_order', media_order,
      'post_media', post_media,
      'slot0_location_name', slot0_location_name,
      'slot0_location_url', slot0_location_url,
      'slot0_key_info', slot0_key_info,
      'latest_comment_preview', latest_comment_preview
    ) ORDER BY created_at DESC
  )
  INTO v_posts
  FROM filtered_posts;

  v_result := jsonb_build_object(
    'posts', COALESCE(v_posts, '[]'::jsonb),
    'count', jsonb_array_length(COALESCE(v_posts, '[]'::jsonb))
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_posts_saved_with_related_data(p_user_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_result JSONB;
  v_posts JSONB;
BEGIN
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  WITH filtered_posts AS (
    SELECT DISTINCT
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
      sp.id as saved_post_id,
      sp.created_at as saved_at,
      jsonb_build_object(
        'id', author_profile.id,
        'username', author_profile.username,
        'display_name', author_profile.display_name,
        'avatar_url', author_profile.avatar_url,
        'is_private', author_profile.is_private
      ) as author,
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
      END as follow_status,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_like.post_id IS NOT NULL THEN true ELSE false END as is_liked,
      CASE WHEN p_viewer_user_id IS NOT NULL AND user_save.post_id IS NOT NULL THEN true ELSE false END as is_saved,
      (
        SELECT COUNT(*)
        FROM comments c
        WHERE c.post_id = p.id
          AND c.is_deleted = false
      ) as comment_count,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM activities a
          WHERE a.post_id = p.id
            AND a.images IS NOT NULL
            AND array_length(a.images, 1) > 0
        ) THEN true
        ELSE false
      END as has_images,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'images', to_jsonb(a.images),
              'created_at', a.created_at
            ) ORDER BY a.created_at
          )
          FROM activities a
          WHERE a.post_id = p.id
        ),
        '[]'::jsonb
      ) as activities,
      CASE
        WHEN p.type = 'hangout' THEN
          jsonb_build_object(
            'users', COALESCE(rsvp_users.json_array, '[]'::jsonb),
            'currentUserStatus', COALESCE(user_rsvp.status, NULL)
          )
        ELSE NULL
      END as rsvp_data,
      slot0.slot0_location_name,
      slot0.slot0_location_url,
      slot0.slot0_key_info,
      latest_comment.latest_comment_preview
    FROM saved_posts sp
    INNER JOIN posts p ON p.id = sp.post_id
    INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
    LEFT JOIN follows mutual_follow ON
      mutual_follow.follower_id = v_viewer_profile_id
      AND mutual_follow.following_id = author_profile.id
    LEFT JOIN follows reverse_follow ON
      reverse_follow.follower_id = author_profile.id
      AND reverse_follow.following_id = v_viewer_profile_id
    LEFT JOIN post_likes user_like ON
      user_like.post_id = p.id
      AND user_like.user_id = p_viewer_user_id
    LEFT JOIN saved_posts user_save ON
      user_save.post_id = p.id
      AND user_save.user_id = p_viewer_user_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', sub.profile_id,
              'username', sub.username,
              'display_name', sub.display_name,
              'avatar_url', sub.avatar_url,
              'status', sub.status,
              'created_at', sub.created_at
            ) ORDER BY sub.created_at DESC
          )
          FROM (
            SELECT
              rsvp_profile.id as profile_id,
              rsvp_profile.username,
              rsvp_profile.display_name,
              rsvp_profile.avatar_url,
              rsvp_response.status,
              rsvp_response.created_at
            FROM rsvp_responses rsvp_response
            INNER JOIN profiles rsvp_profile ON rsvp_profile.user_id = rsvp_response.user_id AND rsvp_profile.deleted_at IS NULL
            WHERE rsvp_response.post_id = p.id
              AND rsvp_response.status = 'going'
            ORDER BY rsvp_response.created_at DESC
            LIMIT 10
          ) sub
        ),
        '[]'::jsonb
      ) as json_array
    ) rsvp_users ON true
    LEFT JOIN rsvp_responses user_rsvp ON
      user_rsvp.post_id = p.id
      AND user_rsvp.user_id = p_viewer_user_id
    LEFT JOIN LATERAL (
      SELECT
        a.location_name AS slot0_location_name,
        a.location_url AS slot0_location_url,
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'title', 'V4KeyInfo',
                'value', COALESCE(ki.elem->>'value', '')
              )
              ORDER BY ki.ord
            ),
            '[]'::jsonb
          )
          FROM (
            SELECT x.elem, x.ord
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(a.additional_info) = 'array' THEN a.additional_info
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY AS x(elem, ord)
            WHERE btrim(COALESCE(x.elem->>'title', '')) = 'V4KeyInfo'
              AND NULLIF(btrim(COALESCE(x.elem->>'value', '')), '') IS NOT NULL
            ORDER BY x.ord
            LIMIT 4
          ) ki
        ) AS slot0_key_info
      FROM activities a
      WHERE a.post_id = p.id
      ORDER BY a.order_idx ASC NULLS LAST, a.created_at ASC
      LIMIT 1
    ) slot0 ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'id', c.id,
        'author_label', COALESCE(
          NULLIF(btrim(pr.display_name), ''),
          NULLIF(btrim(pr.username), ''),
          'Unknown User'
        ),
        'text', left(btrim(c.content), 160)
      ) AS latest_comment_preview
      FROM public.comments c
      LEFT JOIN public.profiles pr
        ON pr.user_id = c.author_id
       AND pr.deleted_at IS NULL
      WHERE c.post_id = p.id
        AND c.parent_id IS NULL
        AND c.is_deleted = false
        AND btrim(c.content) <> ''
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 1
    ) latest_comment ON true
    WHERE
      sp.user_id = p_user_id
      AND p.status = 'published'
      AND (
        author_profile.is_private = false
        OR v_viewer_profile_id = author_profile.id
        OR (author_profile.is_private = true AND mutual_follow.status = 'approved')
      )
    ORDER BY sp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'type', type,
      'caption', caption,
      'is_anonymous', is_anonymous,
      'anonymous_name', anonymous_name,
      'anonymous_avatar', anonymous_avatar,
      'created_at', created_at,
      'selected_dates', selected_dates,
      'tags', tags,
      'author_id', author_id,
      'saved_post_id', saved_post_id,
      'saved_at', saved_at,
      'author', author,
      'follow_status', follow_status,
      'is_liked', is_liked,
      'is_saved', is_saved,
      'comment_count', comment_count,
      'has_images', has_images,
      'activities', activities,
      'rsvp_data', rsvp_data,
      'slot0_location_name', slot0_location_name,
      'slot0_location_url', slot0_location_url,
      'slot0_key_info', slot0_key_info,
      'latest_comment_preview', latest_comment_preview
    ) ORDER BY saved_at DESC
  )
  INTO v_posts
  FROM filtered_posts;

  v_result := jsonb_build_object(
    'posts', COALESCE(v_posts, '[]'::jsonb),
    'count', jsonb_array_length(COALESCE(v_posts, '[]'::jsonb))
  );

  RETURN v_result;
END;
$function$;
