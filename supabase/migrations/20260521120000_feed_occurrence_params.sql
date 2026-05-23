-- Phase B1: Optional viewer-local occurrence params for home feed RPC (Today).
-- Drops the legacy six-argument overload before adding p_occurs_on / p_occurs_tz.

DROP FUNCTION IF EXISTS public.get_feed_with_related_data(
  public.post_type,
  text[],
  text,
  integer,
  integer,
  uuid
);

CREATE OR REPLACE FUNCTION public.get_feed_with_related_data(
  p_type public.post_type DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 12,
  p_offset integer DEFAULT 0,
  p_viewer_user_id uuid DEFAULT NULL,
  p_occurs_on date DEFAULT NULL,
  p_occurs_tz text DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
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
              WHERE (elem::timestamptz) >= now()
            )
          )
        )
      )
      AND (
        p_viewer_user_id IS NULL
        OR NOT public.users_are_blocked_pair(p_viewer_user_id, p.author_id)
      )
      -- Optional viewer-local Today filter (Phase B1): constrain to occurrence on p_occurs_on in TZ p_occurs_tz.
      -- When either param is NULL, this clause is skipped — behavior matches pre-B1 feed.
      -- Experiences qualify only via explicit selected_dates (A). Hangouts may also qualify via recurrence (B).
      AND (
        p_occurs_on IS NULL
        OR p_occurs_tz IS NULL
        OR EXISTS (
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
      ) AS viewer_rating
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
        'viewer_rating', fp.viewer_rating
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
$$;

COMMENT ON FUNCTION public.get_feed_with_related_data(
  public.post_type,
  text[],
  text,
  integer,
  integer,
  uuid,
  date,
  text
) IS
'Optimized feed function that returns posts with all related data (follows, likes, saves, RSVPs) in a single query.
[B1] Paginates on distinct post IDs first to guarantee full pages.
[B2] count = true total of eligible posts (stable across pages).
[Option A] Hangout eligibility in eligible_base: exclude PAST scheduled non-recurring; keep UNSCHEDULED, RECURRING, UPCOMING.
[B1 occurrences] Optional p_occurs_on + p_occurs_tz: viewer-local calendar filter (Today); both required to apply.

Parameters:

- p_type: Filter by post type (experience/hangout)

- p_tags: Filter by tags (array)

- p_search: Free-text search in caption OR posts.tags (tokens whitespace-split, OR across tokens; # stripped, case-insensitive)

- p_limit: Number of posts to return

- p_offset: Pagination offset

- p_viewer_user_id: Auth user ID for privacy/follow checks

- p_occurs_on: Viewer-local occurrence date for optional Today filtering (omit with NULL to disable)

- p_occurs_tz: IANA timezone for interpreting selected_dates timestamps (omit with NULL to disable)

Returns: JSONB with posts array and count (true total)';

