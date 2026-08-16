-- Derive Created-tab ownership from auth.uid(); do not trust p_is_owner.
-- Non-owners: can_view_post + auth.uid() block check. Drafts only for real owner.

CREATE OR REPLACE FUNCTION public.get_user_posts_created_with_related_data(p_user_id uuid, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_include_drafts boolean DEFAULT false, p_is_owner boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_user_profile_id UUID;
  v_is_owner BOOLEAN;
  v_result JSONB;
  v_posts JSONB;
BEGIN
  -- p_is_owner is kept for call-site compatibility; authorization uses v_is_owner.
  v_is_owner := (
    auth.uid() IS NOT NULL
    AND p_user_id = auth.uid()
  );

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
      AND (v_is_owner OR p.is_anonymous IS NULL OR p.is_anonymous = false)
      AND (
        CASE
          WHEN v_is_owner THEN
            (COALESCE(p_include_drafts, false)
             OR COALESCE(p.status, 'published') = 'published')
          ELSE
            public.can_view_post(p.id)
        END
      )
      AND (
        v_is_owner
        OR auth.uid() IS NULL
        OR NOT public.users_are_blocked_pair(auth.uid(), p_user_id)
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
$function$
