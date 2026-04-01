-- ============================================
-- OPTIMIZED FEED FUNCTION
-- Replaces 6-10 separate queries with 1 optimized PostgreSQL function
-- Expected: 60-70% egress reduction, 60-75% faster load times
--
-- [FIX B1/B2] Paginate on distinct post IDs first; count = true total
-- - B1: LIMIT/OFFSET on joined rows caused short pages after DISTINCT collapse
-- - B2: count was jsonb_array_length(posts) = page size, not total
--
-- [Option A] Hangout eligibility in eligible_base (server-side)
-- - Exclude: PAST scheduled non-recurring hangouts
-- - Keep: UNSCHEDULED, RECURRING, UPCOMING, experiences
-- - After migration: run verify_feed_pagination.sql to compare true_total before/after
-- ============================================

-- Drop function if exists (for safe re-creation)
DROP FUNCTION IF EXISTS get_feed_with_related_data(
  p_type post_type,
  p_tags TEXT[],
  p_search TEXT,
  p_limit INTEGER,
  p_offset INTEGER,
  p_viewer_user_id UUID
);

-- Create the optimized feed function
CREATE OR REPLACE FUNCTION get_feed_with_related_data(
  p_type post_type DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 12,
  p_offset INTEGER DEFAULT 0,
  p_viewer_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Run with function owner's permissions (bypasses RLS for reads)
STABLE -- Function doesn't modify data, results are stable within a transaction
AS $$
DECLARE
  v_viewer_profile_id UUID;
  v_result JSONB;
  v_posts JSONB;
  v_true_total INTEGER;
BEGIN
  -- Step 1: Get viewer's profile ID if viewer_user_id is provided (exclude soft-deleted)
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Step 2: Paginate on distinct post IDs first (B1 fix), then join for full data
  -- Step 3: Compute true total from same filtered base (B2 fix)
  WITH
  -- Base: distinct eligible post IDs with same filters (privacy, visibility, type, tags, search)
  -- [Option A] Hangout eligibility: exclude PAST scheduled non-recurring; keep UNSCHEDULED, RECURRING, UPCOMING
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
      AND (p_search IS NULL OR p.caption ILIKE '%' || p_search || '%')
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
      -- [Option A] Hangout eligibility: exclude only PAST scheduled non-recurring
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
  ),
  -- True total count (B2: stable across pages)
  true_total_cte AS (
    SELECT COUNT(*)::INTEGER AS cnt FROM eligible_base
  ),
  -- Page of IDs for this request (B1: guarantees fetchedLen ≈ p_limit until end)
  -- Deterministic tie-breaker: id DESC for stable ordering across pages
  page_ids AS (
    SELECT id FROM eligible_base
    ORDER BY created_at DESC, id DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  -- Join page_ids to get full post data with related tables
  -- [SHRINK] Minimal fields only; NO full activities.images; rsvp_data = going_count + currentUserStatus only
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
      (
        SELECT COUNT(*)
        FROM comments c
        WHERE c.post_id = p.id AND c.is_deleted = false
      ) AS comment_count,
      -- [SHRINK] Activity summary only; NO full activities.images arrays
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
      -- [SHRINK] rsvp_data: going_count + currentUserStatus only (no user list/avatars)
      CASE
        WHEN p.type = 'hangout' THEN
          jsonb_build_object(
            'currentUserStatus', COALESCE(user_rsvp.status, NULL),
            'going_count', COALESCE(rsvp_going_cnt.cnt, 0)
          )
        ELSE NULL
      END AS rsvp_data
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
        'rsvp_data', fp.rsvp_data
      ) ORDER BY fp.created_at DESC
    ) FROM filtered_posts fp)
  INTO v_true_total, v_posts
  FROM true_total_cte
  LIMIT 1;

  -- Step 4: Build result with true total count (B2)
  v_result := jsonb_build_object(
    'posts', COALESCE(v_posts, '[]'::jsonb),
    'count', COALESCE(v_true_total, 0)
  );

  RETURN v_result;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION get_feed_with_related_data IS 
'Optimized feed function that returns posts with all related data (follows, likes, saves, RSVPs) in a single query.
[B1] Paginates on distinct post IDs first to guarantee full pages.
[B2] count = true total of eligible posts (stable across pages).
[Option A] Hangout eligibility in eligible_base: exclude PAST scheduled non-recurring; keep UNSCHEDULED, RECURRING, UPCOMING.
Parameters:
- p_type: Filter by post type (experience/hangout)
- p_tags: Filter by tags (array)
- p_search: Search in captions
- p_limit: Number of posts to return
- p_offset: Pagination offset
- p_viewer_user_id: Auth user ID for privacy/follow checks
Returns: JSONB with posts array and count (true total)';
