-- ============================================
-- PROFILE RPCs: Soft-delete (deleted_at IS NULL) updates
-- Run each CREATE OR REPLACE FUNCTION block in Supabase SQL Editor
-- ============================================

-- -----------------------------------------------------------------------------
-- 1. get_post_detail_with_related_data
-- deleted_at IS NULL added:
--   - viewer profile lookup (WHERE user_id = p_viewer_user_id)
--   - author profile join (INNER JOIN profiles ON author_profile.user_id = p.author_id)
--   - rsvp users profile join if present (profiles for RSVP list)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_post_detail_with_related_data(
  p_post_id UUID,
  p_viewer_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $func$
DECLARE
  v_viewer_profile_id UUID;
  v_result JSONB;
BEGIN
  -- Viewer profile (exclude soft-deleted)
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  SELECT jsonb_build_object(
    'post', (
      SELECT jsonb_build_object(
        'id', p.id,
        'type', p.type,
        'caption', p.caption,
        'is_anonymous', p.is_anonymous,
        'anonymous_name', p.anonymous_name,
        'anonymous_avatar', p.anonymous_avatar,
        'created_at', p.created_at,
        'selected_dates', p.selected_dates,
        'tags', p.tags,
        'author_id', p.author_id,
        'author', CASE
          WHEN p.is_anonymous THEN NULL
          ELSE jsonb_build_object(
            'id', author_profile.id,
            'username', author_profile.username,
            'display_name', author_profile.display_name,
            'avatar_url', author_profile.avatar_url
          )
        END,
        'follow_status', CASE
          WHEN v_viewer_profile_id IS NULL THEN 'none'
          WHEN v_viewer_profile_id = author_profile.id THEN 'self'
          WHEN mf.follower_id IS NOT NULL AND mf.status = 'approved'
               AND rf.follower_id IS NOT NULL AND rf.status = 'approved' THEN 'friends'
          WHEN mf.follower_id IS NOT NULL AND mf.status = 'approved' THEN 'following'
          WHEN mf.follower_id IS NOT NULL AND mf.status = 'pending' THEN 'pending'
          ELSE 'none'
        END,
        'is_liked', p_viewer_user_id IS NOT NULL AND ul.post_id IS NOT NULL,
        'is_saved', p_viewer_user_id IS NOT NULL AND us.post_id IS NOT NULL,
        'like_count', COALESCE(like_cnt.cnt, 0),
        'save_count', COALESCE(save_cnt.cnt, 0),
        'comment_count', (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_deleted = false),
        'has_images', EXISTS(SELECT 1 FROM activities a WHERE a.post_id = p.id AND a.images IS NOT NULL AND array_length(a.images, 1) > 0),
        'rsvp_data', CASE
          WHEN p.type = 'hangout' THEN jsonb_build_object(
            'currentUserStatus', ur.status,
            'going_count', COALESCE(rsvp_cnt.cnt, 0)
          )
          ELSE NULL
        END,
        'status', p.status,
        'visibility', p.visibility,
        'rsvp_capacity', p.rsvp_capacity,
        'is_recurring', p.is_recurring,
        'recurrence_days', p.recurrence_days,
        'activities', COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'title', a.title,
              'images', COALESCE(a.images, '[]'::jsonb),
              'order_idx', a.order_idx,
              'location_name', a.location_name,
              'location_desc', a.location_desc,
              'location_url', a.location_url,
              'location_notes', a.location_notes,
              'additional_info', a.additional_info,
              'tags', a.tags
            ) ORDER BY a.order_idx ASC NULLS LAST
          )
          FROM activities a WHERE a.post_id = p.id),
          '[]'::jsonb
        )
      )
      FROM posts p
      LEFT JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
      LEFT JOIN follows mf ON mf.follower_id = v_viewer_profile_id AND mf.following_id = author_profile.id
      LEFT JOIN follows rf ON rf.follower_id = author_profile.id AND rf.following_id = v_viewer_profile_id
      LEFT JOIN post_likes ul ON ul.post_id = p.id AND ul.user_id = p_viewer_user_id
      LEFT JOIN saved_posts us ON us.post_id = p.id AND us.user_id = p_viewer_user_id
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS cnt FROM post_likes pl WHERE pl.post_id = p.id) like_cnt ON true
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS cnt FROM saved_posts sp WHERE sp.post_id = p.id) save_cnt ON true
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS cnt FROM rsvp_responses rr WHERE rr.post_id = p.id AND rr.status = 'going') rsvp_cnt ON true
      LEFT JOIN rsvp_responses ur ON ur.post_id = p.id AND ur.user_id = p_viewer_user_id
      WHERE p.id = p_post_id
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$func$;


-- -----------------------------------------------------------------------------
-- 2. get_rsvp_list_with_profiles
-- deleted_at IS NULL added:
--   - viewer profile lookup (WHERE user_id = p_viewer_user_id)
--   - RSVP user profile join (profiles for each rsvp_response.user_id)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_rsvp_list_with_profiles(
  p_post_id UUID,
  p_viewer_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $func$
DECLARE
  v_viewer_profile_id UUID;
  v_users JSONB;
  v_current_status TEXT;
  v_result JSONB;
BEGIN
  -- Viewer profile (exclude soft-deleted)
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Current user's RSVP status
  SELECT status INTO v_current_status
  FROM rsvp_responses
  WHERE post_id = p_post_id AND user_id = p_viewer_user_id
  LIMIT 1;

  -- RSVP users with profile data (exclude soft-deleted profiles)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pr.id,
      'username', pr.username,
      'display_name', pr.display_name,
      'avatar_url', pr.avatar_url,
      'status', r.status,
      'created_at', r.created_at
    ) ORDER BY r.created_at DESC
  )
  INTO v_users
  FROM rsvp_responses r
  INNER JOIN profiles pr ON pr.user_id = r.user_id AND pr.deleted_at IS NULL
  WHERE r.post_id = p_post_id
  ORDER BY r.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;

  v_result := jsonb_build_object(
    'users', COALESCE(v_users, '[]'::jsonb),
    'currentUserStatus', v_current_status
  );

  RETURN v_result;
END;
$func$;


-- -----------------------------------------------------------------------------
-- 3. get_user_posts_created_with_related_data
-- deleted_at IS NULL added:
--   - owner profile lookup (WHERE user_id = p_user_id) - used for access/privacy
--   - viewer profile lookup (WHERE user_id = p_viewer_user_id)
--   - author profile join (profiles for post author - owner in this case)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_posts_created_with_related_data(
  p_user_id UUID,
  p_viewer_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_include_drafts BOOLEAN DEFAULT true,
  p_is_owner BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $func$
DECLARE
  v_owner_profile_id UUID;
  v_viewer_profile_id UUID;
  v_posts JSONB;
  v_result JSONB;
BEGIN
  -- Owner profile (exclude soft-deleted)
  SELECT id INTO v_owner_profile_id
  FROM profiles
  WHERE user_id = p_user_id AND deleted_at IS NULL
  LIMIT 1;

  IF v_owner_profile_id IS NULL THEN
    RETURN jsonb_build_object('posts', '[]'::jsonb);
  END IF;

  -- Viewer profile (exclude soft-deleted)
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'type', p.type,
      'caption', p.caption,
      'is_anonymous', p.is_anonymous,
      'anonymous_name', p.anonymous_name,
      'anonymous_avatar', p.anonymous_avatar,
      'created_at', p.created_at,
      'selected_dates', p.selected_dates,
      'tags', p.tags,
      'author_id', p.author_id,
      'author', CASE
        WHEN p.is_anonymous THEN NULL
        ELSE jsonb_build_object(
          'id', author_profile.id,
          'username', author_profile.username,
          'display_name', author_profile.display_name,
          'avatar_url', author_profile.avatar_url
        )
      END,
      'follow_status', CASE
        WHEN v_viewer_profile_id IS NULL THEN 'none'
        WHEN v_viewer_profile_id = author_profile.id THEN 'self'
        WHEN mf.follower_id IS NOT NULL AND mf.status = 'approved'
             AND rf.follower_id IS NOT NULL AND rf.status = 'approved' THEN 'friends'
        WHEN mf.follower_id IS NOT NULL AND mf.status = 'approved' THEN 'following'
        WHEN mf.follower_id IS NOT NULL AND mf.status = 'pending' THEN 'pending'
        ELSE 'none'
      END,
      'is_liked', p_viewer_user_id IS NOT NULL AND ul.post_id IS NOT NULL,
      'is_saved', p_viewer_user_id IS NOT NULL AND us.post_id IS NOT NULL,
      'like_count', (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id),
      'comment_count', (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_deleted = false),
      'has_images', EXISTS(SELECT 1 FROM activities a WHERE a.post_id = p.id AND a.images IS NOT NULL AND array_length(a.images, 1) > 0),
      'activities', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'title', a.title,
            'images', COALESCE(a.images, '[]'::jsonb),
            'order_idx', a.order_idx
          ) ORDER BY a.order_idx ASC NULLS LAST
        )
        FROM activities a WHERE a.post_id = p.id),
        '[]'::jsonb
      ),
      'rsvp_data', CASE
        WHEN p.type = 'hangout' THEN jsonb_build_object(
          'currentUserStatus', ur.status,
          'going_count', (SELECT COUNT(*) FROM rsvp_responses rr WHERE rr.post_id = p.id AND rr.status = 'going')
        )
        ELSE NULL
      END
    ) ORDER BY p.created_at DESC
  )
  INTO v_posts
  FROM posts p
  INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
  LEFT JOIN follows mf ON mf.follower_id = v_viewer_profile_id AND mf.following_id = author_profile.id
  LEFT JOIN follows rf ON rf.follower_id = author_profile.id AND rf.following_id = v_viewer_profile_id
  LEFT JOIN post_likes ul ON ul.post_id = p.id AND ul.user_id = p_viewer_user_id
  LEFT JOIN saved_posts us ON us.post_id = p.id AND us.user_id = p_viewer_user_id
  LEFT JOIN rsvp_responses ur ON ur.post_id = p.id AND ur.user_id = p_viewer_user_id;

  v_result := jsonb_build_object('posts', COALESCE(v_posts, '[]'::jsonb));
  RETURN v_result;
END;
$func$;


-- -----------------------------------------------------------------------------
-- 4. get_user_posts_liked_with_related_data
-- deleted_at IS NULL added:
--   - owner profile lookup (WHERE user_id = p_user_id)
--   - viewer profile lookup (WHERE user_id = p_viewer_user_id)
--   - post author profile join (profiles for each liked post's author)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_posts_liked_with_related_data(
  p_user_id UUID,
  p_viewer_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $func$
DECLARE
  v_viewer_profile_id UUID;
  v_posts JSONB;
  v_result JSONB;
BEGIN
  -- Viewer profile (exclude soft-deleted)
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'like_id', pl.id,
      'liked_at', pl.created_at,
      'id', p.id,
      'type', p.type,
      'caption', p.caption,
      'is_anonymous', p.is_anonymous,
      'anonymous_name', p.anonymous_name,
      'anonymous_avatar', p.anonymous_avatar,
      'created_at', p.created_at,
      'author_id', p.author_id,
      'author', CASE
        WHEN p.is_anonymous THEN NULL
        ELSE jsonb_build_object(
          'id', author_profile.id,
          'username', author_profile.username,
          'display_name', author_profile.display_name,
          'avatar_url', author_profile.avatar_url
        )
      END,
      'follow_status', CASE
        WHEN v_viewer_profile_id IS NULL THEN 'none'
        WHEN v_viewer_profile_id = author_profile.id THEN 'self'
        WHEN mf.follower_id IS NOT NULL AND mf.status = 'approved'
             AND rf.follower_id IS NOT NULL AND rf.status = 'approved' THEN 'friends'
        WHEN mf.follower_id IS NOT NULL AND mf.status = 'approved' THEN 'following'
        WHEN mf.follower_id IS NOT NULL AND mf.status = 'pending' THEN 'pending'
        ELSE 'none'
      END,
      'is_liked', true,
      'is_saved', p_viewer_user_id IS NOT NULL AND us.post_id IS NOT NULL,
      'like_count', (SELECT COUNT(*) FROM post_likes pl2 WHERE pl2.post_id = p.id),
      'comment_count', (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_deleted = false),
      'has_images', EXISTS(SELECT 1 FROM activities a WHERE a.post_id = p.id AND a.images IS NOT NULL AND array_length(a.images, 1) > 0),
      'activities', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'title', a.title,
            'images', COALESCE(a.images, '[]'::jsonb),
            'order_idx', a.order_idx
          ) ORDER BY a.order_idx ASC NULLS LAST
        )
        FROM activities a WHERE a.post_id = p.id),
        '[]'::jsonb
      )
    ) ORDER BY pl.created_at DESC
  )
  INTO v_posts
  FROM post_likes pl
  JOIN posts p ON p.id = pl.post_id
  INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
  LEFT JOIN follows mf ON mf.follower_id = v_viewer_profile_id AND mf.following_id = author_profile.id
  LEFT JOIN follows rf ON rf.follower_id = author_profile.id AND rf.following_id = v_viewer_profile_id
  LEFT JOIN saved_posts us ON us.post_id = p.id AND us.user_id = p_viewer_user_id
  WHERE pl.user_id = p_user_id
  ORDER BY pl.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;

  v_result := jsonb_build_object('posts', COALESCE(v_posts, '[]'::jsonb));
  RETURN v_result;
END;
$func$;


-- -----------------------------------------------------------------------------
-- 5. get_user_posts_saved_with_related_data
-- deleted_at IS NULL added:
--   - owner profile lookup (WHERE user_id = p_user_id)
--   - viewer profile lookup (WHERE user_id = p_viewer_user_id)
--   - post author profile join (profiles for each saved post's author)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_posts_saved_with_related_data(
  p_user_id UUID,
  p_viewer_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $func$
DECLARE
  v_viewer_profile_id UUID;
  v_posts JSONB;
  v_result JSONB;
BEGIN
  -- Viewer profile (exclude soft-deleted)
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'saved_post_id', sp.id,
      'saved_at', sp.created_at,
      'id', p.id,
      'type', p.type,
      'caption', p.caption,
      'is_anonymous', p.is_anonymous,
      'anonymous_name', p.anonymous_name,
      'anonymous_avatar', p.anonymous_avatar,
      'created_at', p.created_at,
      'author_id', p.author_id,
      'author', CASE
        WHEN p.is_anonymous THEN NULL
        ELSE jsonb_build_object(
          'id', author_profile.id,
          'username', author_profile.username,
          'display_name', author_profile.display_name,
          'avatar_url', author_profile.avatar_url
        )
      END,
      'follow_status', CASE
        WHEN v_viewer_profile_id IS NULL THEN 'none'
        WHEN v_viewer_profile_id = author_profile.id THEN 'self'
        WHEN mf.follower_id IS NOT NULL AND mf.status = 'approved'
             AND rf.follower_id IS NOT NULL AND rf.status = 'approved' THEN 'friends'
        WHEN mf.follower_id IS NOT NULL AND mf.status = 'approved' THEN 'following'
        WHEN mf.follower_id IS NOT NULL AND mf.status = 'pending' THEN 'pending'
        ELSE 'none'
      END,
      'is_liked', p_viewer_user_id IS NOT NULL AND ul.post_id IS NOT NULL,
      'is_saved', true,
      'like_count', (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id),
      'comment_count', (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_deleted = false),
      'has_images', EXISTS(SELECT 1 FROM activities a WHERE a.post_id = p.id AND a.images IS NOT NULL AND array_length(a.images, 1) > 0),
      'activities', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'title', a.title,
            'images', COALESCE(a.images, '[]'::jsonb),
            'order_idx', a.order_idx
          ) ORDER BY a.order_idx ASC NULLS LAST
        )
        FROM activities a WHERE a.post_id = p.id),
        '[]'::jsonb
      )
    ) ORDER BY sp.created_at DESC
  )
  INTO v_posts
  FROM saved_posts sp
  JOIN posts p ON p.id = sp.post_id
  INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
  LEFT JOIN follows mf ON mf.follower_id = v_viewer_profile_id AND mf.following_id = author_profile.id
  LEFT JOIN follows rf ON rf.follower_id = author_profile.id AND rf.following_id = v_viewer_profile_id
  LEFT JOIN post_likes ul ON ul.post_id = p.id AND ul.user_id = p_viewer_user_id
  WHERE sp.user_id = p_user_id
  ORDER BY sp.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;

  v_result := jsonb_build_object('posts', COALESCE(v_posts, '[]'::jsonb));
  RETURN v_result;
END;
$func$;
