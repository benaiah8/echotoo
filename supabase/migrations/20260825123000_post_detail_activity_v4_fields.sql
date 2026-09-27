-- Post detail: expose V4 Section fields in activities JSON (activity_type, section_body).
-- Copy of 20260816224103_post_detail_exclude_unpublished_except_author.sql with additive projection only.

CREATE OR REPLACE FUNCTION public.get_post_detail_with_related_data(p_post_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_result JSONB;
  v_post JSONB;
BEGIN
  -- Step 1: Get viewer's profile ID if viewer_user_id is provided
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Step 2: Query post with all related data
  SELECT jsonb_build_object(
    'id', p.id,
    'type', p.type,
    'caption', p.caption,
    'created_at', p.created_at,
    'author_id', p.author_id,
    'status', p.status,
    'is_anonymous', p.is_anonymous,
    'anonymous_name', p.anonymous_name,
    'anonymous_avatar', p.anonymous_avatar,
    'visibility', p.visibility,
    'rsvp_capacity', p.rsvp_capacity,
    'selected_dates', p.selected_dates,
    'is_recurring', p.is_recurring,
    'recurrence_days', p.recurrence_days,
    'tags', p.tags,
    'rating_enabled', p.rating_enabled,
    'rating_average', p.rating_average,
    'rating_count', p.rating_count,
    'like_count', COALESCE(p.like_count, 0),
    'save_count', COALESCE(p.save_count, 0),
    'effective_like_count', CASE
      WHEN p.type = 'experience' THEN COALESCE(p.like_count, 0) + COALESCE(demo.demo_like_count, 0)
      ELSE COALESCE(p.like_count, 0)
    END,
    'effective_save_count', CASE
      WHEN p.type = 'experience' THEN COALESCE(p.save_count, 0) + COALESCE(demo.demo_save_count, 0)
      ELSE COALESCE(p.save_count, 0)
    END,
    'effective_rating_average', CASE
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
    END,
    'effective_rating_count', CASE
      WHEN p.type = 'experience' THEN COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0)
      ELSE COALESCE(p.rating_count, 0)
    END,
    'viewer_rating', (
      SELECT pr.stars
      FROM post_ratings pr
      WHERE pr.post_id = p.id
        AND pr.user_id = p_viewer_user_id
      LIMIT 1
    ),
    -- Author profile
    'author', jsonb_build_object(
      'id', author_profile.id,
      'username', author_profile.username,
      'display_name', author_profile.display_name,
      'avatar_url', author_profile.avatar_url,
      'is_private', author_profile.is_private
    ),
    -- Follow status
    'follow_status', CASE
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
    END,
    -- Like status
    'is_liked', CASE WHEN p_viewer_user_id IS NOT NULL AND user_like.post_id IS NOT NULL THEN true ELSE false END,
    -- Save status
    'is_saved', CASE WHEN p_viewer_user_id IS NOT NULL AND user_save.post_id IS NOT NULL THEN true ELSE false END,
    -- Engagement counts (canonical columns on posts)
    'comment_count', COALESCE(p.comment_count, 0),
    -- Has images flag
    'has_images', CASE
      WHEN EXISTS (
        SELECT 1
        FROM activities a
        WHERE a.post_id = p.id
          AND a.images IS NOT NULL
          AND array_length(a.images, 1) > 0
      ) THEN true
      ELSE false
    END,
    -- Activities (ordered by order_idx)
    'activities', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'title', a.title,
            'images', a.images,
            'order_idx', a.order_idx,
            'location_name', a.location_name,
            'location_desc', a.location_desc,
            'location_url', a.location_url,
            'location_notes', a.location_notes,
            'additional_info', a.additional_info,
            'tags', a.tags,
            'activity_type', a.activity_type,
            'section_body', a.section_body
          ) ORDER BY a.order_idx ASC
        )
        FROM activities a
        WHERE a.post_id = p.id
      ),
      '[]'::jsonb
    ),
    -- RSVP data (only for hangouts)
    'rsvp_data', CASE
      WHEN p.type = 'hangout' THEN
        jsonb_build_object(
          'users', COALESCE(rsvp_users.json_array, '[]'::jsonb),
          'currentUserStatus', COALESCE(user_rsvp.status, NULL)
        )
      ELSE NULL
    END
  )
  INTO v_post
  FROM posts p
  -- Join author profile
  INNER JOIN profiles author_profile ON author_profile.user_id = p.author_id AND author_profile.deleted_at IS NULL
  -- Join follow status (viewer following author)
  LEFT JOIN follows mutual_follow ON
    mutual_follow.follower_id = v_viewer_profile_id
    AND mutual_follow.following_id = author_profile.id
  -- Join reverse follow (author following viewer, for mutual check)
  LEFT JOIN follows reverse_follow ON
    reverse_follow.follower_id = author_profile.id
    AND reverse_follow.following_id = v_viewer_profile_id
  -- Join like status
  LEFT JOIN post_likes user_like ON
    user_like.post_id = p.id
    AND user_like.user_id = p_viewer_user_id
  -- Join save status
  LEFT JOIN saved_posts user_save ON
    user_save.post_id = p.id
    AND user_save.user_id = p_viewer_user_id
  LEFT JOIN public.post_demo_engagement demo ON
    demo.post_id = p.id
  -- Join RSVP users (only "going" status, limit 10)
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
  -- Join user's RSVP status
  LEFT JOIN rsvp_responses user_rsvp ON
    user_rsvp.post_id = p.id
    AND user_rsvp.user_id = p_viewer_user_id
  WHERE p.id = p_post_id
    -- v1 user_blocks: no post detail across a blocked pair (symmetric)
    AND (
      p_viewer_user_id IS NULL
      OR NOT public.users_are_blocked_pair(p_viewer_user_id, p.author_id)
    )
    -- Privacy filter: show post if:
    -- 1. Author is not private, OR
    -- 2. Author is private AND viewer is following (approved status), OR
    -- 3. Viewer is the author
    AND (
      author_profile.is_private = false
      OR v_viewer_profile_id = author_profile.id
      OR (author_profile.is_private = true AND mutual_follow.status = 'approved')
    )
    -- Visibility filter: show post if:
    -- 1. Visibility is 'public' or NULL, OR
    -- 2. Visibility is 'friends' AND mutual follow exists, OR
    -- 3. Viewer is the author
    AND (
      p.visibility IS NULL
      OR p.visibility = 'public'
      OR p.visibility = 'anonymous'
      OR v_viewer_profile_id = author_profile.id
      OR (p.visibility = 'friends' AND mutual_follow.status = 'approved' AND reverse_follow.status = 'approved')
    )
    AND (
      COALESCE(p.status, 'published') = 'published'
      OR p.author_id = auth.uid()
    );

  -- Step 3: Build final result
  IF v_post IS NULL THEN
    v_result := jsonb_build_object('post', NULL, 'error', 'Post not found or access denied');
  ELSE
    v_result := jsonb_build_object('post', v_post);
  END IF;

  RETURN v_result;
END;
$function$
