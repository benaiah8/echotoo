-- =====================================================
-- FIX ALL PROFILE FUNCTIONS TO RETURN ACTIVITIES WITH IMAGES
-- =====================================================
-- This fixes get_user_posts_created_with_related_data,
-- get_user_posts_liked_with_related_data, and 
-- get_user_posts_saved_with_related_data to return 
-- the actual images in the activities array.
-- =====================================================

-- The issue: These functions were returning activities like:
-- "activities": [{"id": "...", "images": [], "created_at": "..."}]
-- But the images array was always empty!

-- The fix: We need to aggregate the actual images from the activities table.
-- Each activity can have multiple images in its images column (array type).

-- Step 1: Check current structure
-- Run this to see what the activities table looks like:
-- SELECT id, post_id, images FROM activities LIMIT 5;

-- Step 2: The fix is to use jsonb_build_object with the actual images column
-- Replace the activities aggregation in each function with this pattern:

/*
COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'images', COALESCE(a.images, '[]'::jsonb),  -- Use actual images column!
        'created_at', a.created_at
      ) ORDER BY a.created_at DESC
    )
    FROM activities a
    WHERE a.post_id = p.id
  ),
  '[]'::jsonb
) as activities
*/

-- =====================================================
-- INSTRUCTIONS:
-- =====================================================
-- 1. Go to Supabase SQL Editor
-- 2. Find each of these functions:
--    - get_user_posts_created_with_related_data
--    - get_user_posts_liked_with_related_data  
--    - get_user_posts_saved_with_related_data
-- 3. In each function, find where it builds the activities array
-- 4. Look for something like:
--      'has_images', CASE WHEN EXISTS(...) THEN true ELSE false END
--    Or:
--      'activities', '[]'::jsonb
-- 5. Replace with the COALESCE pattern above

-- =====================================================
-- EXAMPLE FOR get_user_posts_saved_with_related_data:
-- =====================================================

-- Find the jsonb_build_object in the function and add:

CREATE OR REPLACE FUNCTION public.get_user_posts_saved_with_related_data(
  p_user_id uuid,
  p_viewer_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
-- ... (function body, find the SELECT section with jsonb_build_object)
-- In the jsonb_build_object, add this line:
--
--   'activities', COALESCE(
--     (
--       SELECT jsonb_agg(
--         jsonb_build_object(
--           'id', a.id,
--           'images', COALESCE(a.images, '[]'::jsonb),
--           'created_at', a.created_at
--         ) ORDER BY a.created_at DESC
--       )
--       FROM activities a
--       WHERE a.post_id = p.id
--     ),
--     '[]'::jsonb
--   ),
--
-- Repeat for all three functions!
$function$;

-- =====================================================
-- VERIFICATION:
-- =====================================================
-- After applying, run these to test:

-- Test Created:
-- SELECT public.get_user_posts_created_with_related_data(
--   'YOUR_USER_ID'::uuid,
--   'YOUR_USER_ID'::uuid,
--   5,
--   0,
--   true,
--   true
-- );

-- Test Liked:
-- SELECT public.get_user_posts_liked_with_related_data(
--   'YOUR_USER_ID'::uuid,
--   'YOUR_USER_ID'::uuid,
--   5,
--   0
-- );

-- Test Saved:
-- SELECT public.get_user_posts_saved_with_related_data(
--   'YOUR_USER_ID'::uuid,
--   'YOUR_USER_ID'::uuid,
--   5,
--   0
-- );

-- Check that the 'activities' array contains objects with non-empty 'images' arrays!
