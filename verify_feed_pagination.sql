-- ============================================
-- Verify feed pagination - true total vs RPC count
-- [Option A] Compare BEFORE vs AFTER hangout eligibility in eligible_base
--
-- Run in Supabase SQL Editor. Compare output to PF logs from Home feed.
--
-- For "all" feed (anonymous): use as-is.
-- For AUTHENTICATED: replace NULL in mutual_follow/reverse_follow with your
--   profile UUID: (SELECT id FROM profiles WHERE user_id = 'your-auth-uuid' LIMIT 1)
-- ============================================

-- ---------------------------------------------------------------------------
-- Query 1: BEFORE (old eligible_base - no hangout filter)
-- Run before migration to capture baseline true_total and first 50 IDs
-- ---------------------------------------------------------------------------
WITH eligible_base_old AS (
  SELECT DISTINCT p.id, p.created_at
  FROM posts p
  INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id
  LEFT JOIN follows mutual_follow ON
    mutual_follow.follower_id = NULL  -- set to your profile UUID for auth
    AND mutual_follow.following_id = author_profile.id
  LEFT JOIN follows reverse_follow ON
    reverse_follow.follower_id = author_profile.id
    AND reverse_follow.following_id = NULL
  WHERE
    (author_profile.is_private = false
     OR (author_profile.is_private = true AND mutual_follow.status = 'approved'))
    AND (
      p.visibility IS NULL
      OR p.visibility IN ('public', 'anonymous')
      OR (p.visibility = 'friends' AND mutual_follow.status = 'approved' AND reverse_follow.status = 'approved')
    )
)
SELECT
  'BEFORE (no hangout filter)' AS run,
  (SELECT COUNT(*)::int FROM eligible_base_old) AS true_total,
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'created_at', created_at))
   FROM (SELECT id, created_at FROM eligible_base_old ORDER BY created_at DESC, id DESC LIMIT 50) sub) AS first_50_ids;

-- ---------------------------------------------------------------------------
-- Query 2: AFTER (new eligible_base - Option A hangout filter)
-- Run after migration. true_total should be <= BEFORE. first_50 should exclude
-- PAST scheduled non-recurring hangouts.
-- ---------------------------------------------------------------------------
WITH eligible_base_new AS (
  SELECT DISTINCT p.id, p.created_at
  FROM posts p
  INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id
  LEFT JOIN follows mutual_follow ON
    mutual_follow.follower_id = NULL  -- set to your profile UUID for auth
    AND mutual_follow.following_id = author_profile.id
  LEFT JOIN follows reverse_follow ON
    reverse_follow.follower_id = author_profile.id
    AND reverse_follow.following_id = NULL
  WHERE
    (author_profile.is_private = false
     OR (author_profile.is_private = true AND mutual_follow.status = 'approved'))
    AND (
      p.visibility IS NULL
      OR p.visibility IN ('public', 'anonymous')
      OR (p.visibility = 'friends' AND mutual_follow.status = 'approved' AND reverse_follow.status = 'approved')
    )
    -- [Option A] Hangout eligibility: exclude PAST scheduled non-recurring
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
)
SELECT
  'AFTER (Option A hangout filter)' AS run,
  (SELECT COUNT(*)::int FROM eligible_base_new) AS true_total,
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'created_at', created_at))
   FROM (SELECT id, created_at FROM eligible_base_new ORDER BY created_at DESC, id DESC LIMIT 50) sub) AS first_50_ids;

-- ---------------------------------------------------------------------------
-- Query 3: Direct RPC call - offset 0, limit 15 (matches Home initial load)
-- Run after migration. Compare posts array length and IDs to first_50_ids above.
-- ---------------------------------------------------------------------------
-- SELECT * FROM get_feed_with_related_data(
--   p_type := NULL,           -- all types
--   p_tags := NULL,
--   p_search := NULL,
--   p_limit := 15,
--   p_offset := 0,
--   p_viewer_user_id := NULL   -- anonymous; or your auth user UUID
-- );

-- ---------------------------------------------------------------------------
-- Query 4: Side-by-side count comparison (run both CTEs in one query)
-- ---------------------------------------------------------------------------
/*
WITH
eligible_old AS (
  SELECT p.id FROM posts p
  INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id
  LEFT JOIN follows mutual_follow ON mutual_follow.follower_id = NULL AND mutual_follow.following_id = author_profile.id
  LEFT JOIN follows reverse_follow ON reverse_follow.follower_id = author_profile.id AND reverse_follow.following_id = NULL
  WHERE (author_profile.is_private = false OR (author_profile.is_private = true AND mutual_follow.status = 'approved'))
    AND (p.visibility IS NULL OR p.visibility IN ('public','anonymous') OR (p.visibility = 'friends' AND mutual_follow.status = 'approved' AND reverse_follow.status = 'approved'))
),
eligible_new AS (
  SELECT p.id FROM posts p
  INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id
  LEFT JOIN follows mutual_follow ON mutual_follow.follower_id = NULL AND mutual_follow.following_id = author_profile.id
  LEFT JOIN follows reverse_follow ON reverse_follow.follower_id = author_profile.id AND reverse_follow.following_id = NULL
  WHERE (author_profile.is_private = false OR (author_profile.is_private = true AND mutual_follow.status = 'approved'))
    AND (p.visibility IS NULL OR p.visibility IN ('public','anonymous') OR (p.visibility = 'friends' AND mutual_follow.status = 'approved' AND reverse_follow.status = 'approved'))
    AND (p.type != 'hangout' OR (p.type = 'hangout' AND (COALESCE(p.is_recurring, false) = true OR COALESCE(jsonb_array_length(p.selected_dates), 0) = 0 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem WHERE (elem::timestamptz) >= now()))))
)
SELECT
  (SELECT COUNT(*) FROM eligible_old) AS true_total_before,
  (SELECT COUNT(*) FROM eligible_new) AS true_total_after,
  (SELECT COUNT(*) FROM eligible_old) - (SELECT COUNT(*) FROM eligible_new) AS past_hangouts_excluded;
*/
