-- =====================================================
-- CLOUDINARY ACTIVITIES BACKFILL VISIBILITY QUERY
-- =====================================================
-- Run in Supabase SQL Editor to see how many activities
-- still have Cloudinary URLs (res.cloudinary.com) in images.
-- Use this to plan backfill migration.
-- =====================================================

-- Count activities where images array contains any Cloudinary URL
SELECT COUNT(*) AS cloudinary_activity_count
FROM activities a
WHERE EXISTS (
  SELECT 1 FROM unnest(COALESCE(a.images, '{}')) AS img
  WHERE img::text LIKE '%res.cloudinary.com%'
);

-- Top 20 rows: activity id, post_id, first image url
SELECT
  a.id AS activity_id,
  a.post_id,
  (a.images[1])::text AS first_image_url
FROM activities a
WHERE EXISTS (
  SELECT 1 FROM unnest(COALESCE(a.images, '{}')) AS img
  WHERE img::text LIKE '%res.cloudinary.com%'
)
ORDER BY a.created_at DESC NULLS LAST
LIMIT 20;
