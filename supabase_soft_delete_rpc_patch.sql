-- Effective rating (experience): count = COALESCE(demo.demo_rating_count,0)+COALESCE(p.rating_count,0);
-- average = ROUND(((demo_avg*demo_n)+(real_avg*real_n))/(demo_n+real_n),2); non-experience = raw p.rating_*
-- Patched: viewer lookup, author join, rsvp_profile join
CREATE OR REPLACE FUNCTION public.get_post_detail_with_related_data(p_post_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
            'tags', a.tags
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
    );

  -- Step 3: Build final result
  IF v_post IS NULL THEN
    v_result := jsonb_build_object('post', NULL, 'error', 'Post not found or access denied');
  ELSE
    v_result := jsonb_build_object('post', v_post);
  END IF;

  RETURN v_result;
END;
$function$;


-- Patched: rsvp profile join (profiles p)
CREATE OR REPLACE FUNCTION public.get_rsvp_list_with_profiles(p_post_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_result JSONB;
  v_users JSONB;
  v_current_user_status TEXT;
BEGIN
  -- Step 1: Get all RSVP users with their profiles
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'status', r.status,
        'created_at', r.created_at
      ) ORDER BY r.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_users
  FROM rsvp_responses r
  INNER JOIN profiles p ON p.user_id = r.user_id AND p.deleted_at IS NULL
  WHERE r.post_id = p_post_id;

  -- Step 2: Get current user's RSVP status (if viewer_user_id is provided)
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT r.status
    INTO v_current_user_status
    FROM rsvp_responses r
    WHERE r.post_id = p_post_id
      AND r.user_id = p_viewer_user_id
    LIMIT 1;
  END IF;

  -- Step 3: Build final result
  v_result := jsonb_build_object(
    'users', COALESCE(v_users, '[]'::jsonb),
    'currentUserStatus', v_current_user_status
  );

  RETURN v_result;
END;
$function$;


-- Patched: owner lookup, viewer lookup, author join, rsvp_profile join
CREATE OR REPLACE FUNCTION public.get_user_posts_created_with_related_data(p_user_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_include_drafts boolean DEFAULT false, p_is_owner boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_user_profile_id UUID;
  v_result JSONB;
  v_posts JSONB;
BEGIN
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
      -- ✅ FIXED: Cast text[] to jsonb
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
      ) as viewer_rating
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
    WHERE
      p.author_id = p_user_id
      AND (p_is_owner = true OR p.is_anonymous IS NULL OR p.is_anonymous = false)
      AND (
        (p_is_owner = false AND p.status = 'published')
        OR (p_is_owner = true AND p_include_drafts = true)
        OR (p_is_owner = true AND p_include_drafts = false AND p.status = 'published')
      )
      -- v1 user_blocks: other-profile created tab — hide when viewer and profile owner are blocked pair
      AND (
        p_viewer_user_id IS NULL
        OR p_is_owner = true
        OR NOT public.users_are_blocked_pair(p_viewer_user_id, p_user_id)
      )
      AND (
        author_profile.is_private = false
        OR v_viewer_profile_id = author_profile.id
        OR (author_profile.is_private = true AND mutual_follow.status = 'approved')
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
      'viewer_rating', viewer_rating
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


-- Patched: viewer lookup, author join, rsvp_profile join
CREATE OR REPLACE FUNCTION public.get_user_posts_liked_with_related_data(p_user_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
      pl.id as like_id,
      pl.created_at as liked_at,
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
      END as rsvp_data
    FROM post_likes pl
    INNER JOIN posts p ON p.id = pl.post_id
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
    WHERE
      pl.user_id = p_user_id
      AND p.status = 'published'
      AND (
        author_profile.is_private = false
        OR v_viewer_profile_id = author_profile.id
        OR (author_profile.is_private = true AND mutual_follow.status = 'approved')
      )
    ORDER BY pl.created_at DESC
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
      'like_id', like_id,
      'liked_at', liked_at,
      'author', author,
      'follow_status', follow_status,
      'is_liked', is_liked,
      'is_saved', is_saved,
      'comment_count', comment_count,
      'has_images', has_images,
      'activities', activities,
      'rsvp_data', rsvp_data
    ) ORDER BY liked_at DESC
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


-- Patched: viewer lookup, author join, rsvp_profile join
CREATE OR REPLACE FUNCTION public.get_user_posts_saved_with_related_data(p_user_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
      END as rsvp_data
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
      'rsvp_data', rsvp_data
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
