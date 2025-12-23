-- ============================================
-- TEST QUERIES FOR get_feed_with_related_data
-- Run these in Supabase SQL Editor to test the function
-- ============================================

-- Test 1: Basic feed (no filters, no viewer)
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := NULL,
  p_search := NULL,
  p_limit := 5,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- Test 2: Filter by type (hangouts only)
SELECT get_feed_with_related_data(
  p_type := 'hangout',
  p_tags := NULL,
  p_search := NULL,
  p_limit := 5,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- Test 2b: Filter by tags (should ONLY return posts with matching tags)
-- Replace 'Hiking' with a tag that exists in your database
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := ARRAY['Hiking']::TEXT[],
  p_search := NULL,
  p_limit := 10,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- Test 3: Filter by tags
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := ARRAY['tag1', 'tag2']::TEXT[],
  p_search := NULL,
  p_limit := 5,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- Test 4: Search filter
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := NULL,
  p_search := 'test',
  p_limit := 5,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- Test 5: With viewer (replace with actual auth user ID)
-- First, get a user_id to test with:
-- SELECT user_id FROM profiles LIMIT 1;
-- Then use that user_id:
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := NULL,
  p_search := NULL,
  p_limit := 5,
  p_offset := 0,
  p_viewer_user_id := 'YOUR_USER_ID_HERE'::UUID
);

-- Test 6: Pagination (second page)
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := NULL,
  p_search := NULL,
  p_limit := 5,
  p_offset := 5,
  p_viewer_user_id := NULL
);

-- Test 7: Check response structure
SELECT 
  jsonb_pretty(
    get_feed_with_related_data(
      p_type := NULL,
      p_tags := NULL,
      p_search := NULL,
      p_limit := 2,
      p_offset := 0,
      p_viewer_user_id := NULL
    )
  );

