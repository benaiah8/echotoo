-- ============================================
-- PHASE 1 FINAL VALIDATION TESTS
-- Run these tests to verify the function works correctly
-- ============================================

-- IMPORTANT: Replace 'YOUR_USER_ID_HERE' with an actual user_id from your database
-- Get one with: SELECT user_id FROM profiles LIMIT 1;

-- ============================================
-- TEST 1: Basic feed (no filters, no viewer)
-- Expected: Returns posts, all follow_status should be "none"
-- ============================================
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := NULL,
  p_search := NULL,
  p_limit := 5,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- ============================================
-- TEST 2: Tag filter (CRITICAL - tests the bug fix)
-- Expected: ONLY returns posts that have the specified tag(s)
-- Should NOT return posts with null tags or different tags
-- ============================================
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := ARRAY['Hiking']::TEXT[],
  p_search := NULL,
  p_limit := 10,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- Verify: Check that ALL returned posts have 'Hiking' in their tags array
-- None should have null tags or tags that don't include 'Hiking'

-- ============================================
-- TEST 3: Type filter (hangouts only)
-- Expected: All posts should have type = 'hangout'
-- ============================================
SELECT get_feed_with_related_data(
  p_type := 'hangout',
  p_tags := NULL,
  p_search := NULL,
  p_limit := 5,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- ============================================
-- TEST 4: Type filter (experiences only)
-- Expected: All posts should have type = 'experience'
-- ============================================
SELECT get_feed_with_related_data(
  p_type := 'experience',
  p_tags := NULL,
  p_search := NULL,
  p_limit := 5,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- ============================================
-- TEST 5: Search filter
-- Expected: Only posts with matching caption text
-- ============================================
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := NULL,
  p_search := 'test',
  p_limit := 5,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- ============================================
-- TEST 6: With viewer (follow status, likes, saves)
-- Replace 'YOUR_USER_ID_HERE' with actual user_id
-- Expected: follow_status should show "following" or "friends" if user follows authors
-- ============================================
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := NULL,
  p_search := NULL,
  p_limit := 5,
  p_offset := 0,
  p_viewer_user_id := 'YOUR_USER_ID_HERE'::UUID
);

-- ============================================
-- TEST 7: Combined filters (type + tags)
-- Expected: Only hangout posts with 'Hiking' tag
-- ============================================
SELECT get_feed_with_related_data(
  p_type := 'hangout',
  p_tags := ARRAY['Hiking']::TEXT[],
  p_search := NULL,
  p_limit := 5,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- ============================================
-- TEST 8: Pagination (second page)
-- Expected: Different posts than first page
-- ============================================
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := NULL,
  p_search := NULL,
  p_limit := 5,
  p_offset := 5,
  p_viewer_user_id := NULL
);

-- ============================================
-- TEST 9: Multiple tags filter
-- Expected: Posts that have at least one of the specified tags
-- ============================================
SELECT get_feed_with_related_data(
  p_type := NULL,
  p_tags := ARRAY['Hiking', 'Food']::TEXT[],
  p_search := NULL,
  p_limit := 10,
  p_offset := 0,
  p_viewer_user_id := NULL
);

-- ============================================
-- VALIDATION CHECKLIST
-- ============================================
-- After running tests, verify:
-- [ ] Test 1: Returns posts with correct structure
-- [ ] Test 2: Tag filter ONLY returns posts with matching tags (no null tags)
-- [ ] Test 3: Type filter returns only hangouts
-- [ ] Test 4: Type filter returns only experiences
-- [ ] Test 5: Search filter returns only matching posts
-- [ ] Test 6: Follow status shows correctly ("friends", "following", "none")
-- [ ] Test 7: Combined filters work correctly
-- [ ] Test 8: Pagination returns different posts
-- [ ] Test 9: Multiple tags filter works (OR logic)
-- [ ] All posts have author data
-- [ ] Hangout posts have rsvp_data
-- [ ] Experience posts have rsvp_data = null
-- [ ] Like/save statuses are boolean
-- [ ] Response structure matches FeedItem type

