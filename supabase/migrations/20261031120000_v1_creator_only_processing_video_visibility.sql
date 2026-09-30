-- V1 creator-only visibility for posts with attached non-ready video.
-- LOCAL ONLY — do not apply to production until explicitly approved.
--
-- Live baselines (pg_get_functiondef md5) at capture:
--   get_feed_with_related_data: 98eca9ed0609de9d301632f1123e7a05
--   get_post_detail_with_related_data: 84cbb790f375354eef766154cc2e932c
--   can_view_post: 92e76a8671133a34cc020639f837d97c
--   can_view_post_as: 4cd78aa1c19b5e9f51d18d0fa54c4a0c
--
-- Intentional delta ONLY:
--   1) helper post_has_nonready_attached_video + REVOKE from clients
--   2) can_view_post / can_view_post_as non-ready gate after author allow
--   3) Feed eligible_base creator-or-ready predicate
--   4) Detail main-post creator-or-ready predicate
-- Does NOT touch Profile Created, People/Groups helpers, post_media RLS, indexes,
-- failed status, webhook, or ranking/payload fields.

CREATE OR REPLACE FUNCTION public.post_has_nonready_attached_video(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.post_media pm
    WHERE pm.post_id = p_post_id
      AND pm.video_status IN (
        'pending',
        'uploading',
        'processing'
      )
  );
$$;

COMMENT ON FUNCTION public.post_has_nonready_attached_video(uuid) IS
  'True when post has any attached post_media still pending/uploading/processing. SECURITY DEFINER + row_security off to avoid recursion with post_media RLS (which calls can_view_post).';

REVOKE ALL ON FUNCTION public.post_has_nonready_attached_video(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- can_view_post — live body + non-ready gate after author allow
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_post(p_post_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_viewer_user_id uuid := auth.uid();
  v_viewer_profile_id uuid;
  v_post record;
  v_author_profile record;
  v_viewer_follows_author boolean := false;
  v_author_follows_viewer boolean := false;
begin
  select p.*
  into v_post
  from public.posts p
  where p.id = p_post_id;

  if not found then
    return false;
  end if;

  select pr.*
  into v_author_profile
  from public.profiles pr
  where pr.user_id = v_post.author_id
  limit 1;

  if not found then
    return false;
  end if;

  if v_author_profile.deleted_at is not null then
    return false;
  end if;

  -- Authors can see their own posts, including drafts.
  if v_viewer_user_id is not null and v_post.author_id = v_viewer_user_id then
    return true;
  end if;

  -- V1: non-authors cannot see posts with attached non-ready video.
  if public.post_has_nonready_attached_video(p_post_id) then
    return false;
  end if;

  -- Non-authors should not see drafts/unpublished posts.
  if coalesce(v_post.status::text, 'published') <> 'published' then
    return false;
  end if;

  if v_viewer_user_id is not null then
    select pr.id
    into v_viewer_profile_id
    from public.profiles pr
    where pr.user_id = v_viewer_user_id
    limit 1;
  end if;

  -- Block checks only apply when we know the viewer profile.
  if v_viewer_profile_id is not null then
    if public.users_are_blocked_pair(v_viewer_profile_id, v_author_profile.id) then
      return false;
    end if;

    select exists (
      select 1
      from public.follows f
      where f.follower_id = v_viewer_profile_id
        and f.following_id = v_author_profile.id
        and f.status = 'approved'
    )
    into v_viewer_follows_author;

    select exists (
      select 1
      from public.follows f
      where f.follower_id = v_author_profile.id
        and f.following_id = v_viewer_profile_id
        and f.status = 'approved'
    )
    into v_author_follows_viewer;
  end if;

  -- Private authors require approved follower access unless this is the author.
  if coalesce(v_author_profile.is_private, false) = true
     and v_viewer_follows_author = false then
    return false;
  end if;

  -- Public/anonymous/null visibility is visible after profile privacy checks.
  if v_post.visibility is null
     or v_post.visibility::text in ('public', 'anonymous') then
    return true;
  end if;

  -- Followers visibility: viewer follows author.
  if v_post.visibility::text = 'followers' then
    return v_viewer_follows_author;
  end if;

  -- Friends visibility: both users follow each other.
  if v_post.visibility::text = 'friends' then
    return v_viewer_follows_author and v_author_follows_viewer;
  end if;

  return false;
end;
$function$

-- ---------------------------------------------------------------------------
-- can_view_post_as — live body + non-ready gate after author allow
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_post_as(p_viewer_user_id uuid, p_post_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_user_id uuid := p_viewer_user_id;
  v_viewer_profile_id uuid;
  v_post record;
  v_author_profile record;
  v_viewer_follows_author boolean := false;
  v_author_follows_viewer boolean := false;
BEGIN
  SELECT p.*
  INTO v_post
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT pr.*
  INTO v_author_profile
  FROM public.profiles pr
  WHERE pr.user_id = v_post.author_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_author_profile.deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Authors can see their own posts, including drafts.
  IF v_viewer_user_id IS NOT NULL AND v_post.author_id = v_viewer_user_id THEN
    RETURN true;
  END IF;

  -- V1: non-authors cannot see posts with attached non-ready video.
  IF public.post_has_nonready_attached_video(p_post_id) THEN
    RETURN false;
  END IF;

  -- Non-authors should not see drafts/unpublished posts.
  IF coalesce(v_post.status::text, 'published') <> 'published' THEN
    RETURN false;
  END IF;

  IF v_viewer_user_id IS NOT NULL THEN
    SELECT pr.id
    INTO v_viewer_profile_id
    FROM public.profiles pr
    WHERE pr.user_id = v_viewer_user_id
    LIMIT 1;
  END IF;

  -- Block checks only apply when we know the viewer profile.
  IF v_viewer_profile_id IS NOT NULL THEN
    IF public.users_are_blocked_pair(v_viewer_profile_id, v_author_profile.id) THEN
      RETURN false;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = v_viewer_profile_id
        AND f.following_id = v_author_profile.id
        AND f.status = 'approved'
    )
    INTO v_viewer_follows_author;

    SELECT EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = v_author_profile.id
        AND f.following_id = v_viewer_profile_id
        AND f.status = 'approved'
    )
    INTO v_author_follows_viewer;
  END IF;

  -- Private authors require approved follower access unless this is the author.
  IF coalesce(v_author_profile.is_private, false) = true
     AND v_viewer_follows_author = false THEN
    RETURN false;
  END IF;

  -- Public/anonymous/null visibility is visible after profile privacy checks.
  IF v_post.visibility IS NULL
     OR v_post.visibility::text IN ('public', 'anonymous') THEN
    RETURN true;
  END IF;

  -- Followers visibility: viewer follows author.
  IF v_post.visibility::text = 'followers' THEN
    RETURN v_viewer_follows_author;
  END IF;

  -- Friends visibility: both users follow each other.
  IF v_post.visibility::text = 'friends' THEN
    RETURN v_viewer_follows_author AND v_author_follows_viewer;
  END IF;

  RETURN false;
END;
$function$

-- ---------------------------------------------------------------------------
-- get_feed_with_related_data — live body + eligible_base predicate only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_feed_with_related_data(p_type post_type DEFAULT NULL::post_type, p_tags text[] DEFAULT NULL::text[], p_search text DEFAULT NULL::text, p_limit integer DEFAULT 12, p_offset integer DEFAULT 0, p_viewer_user_id uuid DEFAULT NULL::uuid, p_occurs_on date DEFAULT NULL::date, p_occurs_tz text DEFAULT NULL::text, p_friends_only boolean DEFAULT false, p_occurs_from date DEFAULT NULL::date, p_occurs_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_profile_id UUID;
  v_result JSONB;
  v_posts JSONB;
  v_true_total INTEGER;
BEGIN
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  WITH
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
      AND (
        p_search IS NULL
        OR EXISTS (
          SELECT 1
          FROM regexp_split_to_table(btrim(p_search), '[[:space:]]+') AS qsplit(raw_tok)
          CROSS JOIN LATERAL (
            SELECT NULLIF(regexp_replace(lower(btrim(qsplit.raw_tok)), '^#+', ''), '') AS nq
          ) n
          WHERE n.nq IS NOT NULL
          AND (
            p.caption ILIKE '%' || n.nq || '%'
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) AS tag_arr(t)
              WHERE NULLIF(regexp_replace(lower(btrim(tag_arr.t)), '^#+', ''), '') IS NOT NULL
              AND regexp_replace(lower(btrim(tag_arr.t)), '^#+', '') ILIKE '%' || n.nq || '%'
            )
          )
        )
      )
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
      AND COALESCE(p.status, 'published') = 'published'
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
              WHERE NULLIF(trim(elem), '') IS NOT NULL
                AND ((trim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
                  >= (timezone('Africa/Addis_Ababa', now()))::date
            )
          )
        )
      )
      AND (
        p_viewer_user_id IS NULL
        OR NOT public.users_are_blocked_pair(p_viewer_user_id, p.author_id)
      )
      -- V1: creator-only while any attached video is still processing.
      AND (
        (
          p_viewer_user_id IS NOT NULL
          AND p.author_id = p_viewer_user_id
        )
        OR NOT public.post_has_nonready_attached_video(p.id)
      )
      -- Optional friends-only filter: mutual approved follow in both directions (excludes self posts).
      AND (
        NOT COALESCE(p_friends_only, false)
        OR (
          mutual_follow.status = 'approved'
          AND reverse_follow.status = 'approved'
        )
      )
      -- Optional viewer-local occurrence filter (three modes; all skipped when inactive):
      -- 1) No filter â€” neither range nor single-day params fully set.
      -- 2) Range mode (week filters) â€” p_occurs_from + p_occurs_to + p_occurs_tz all set.
      --    Experiences qualify only via selected_dates in range (A).
      --    Recurring hangouts may qualify via any weekday in range (B).
      -- 3) Single-day mode (Today/Tomorrow spotlight) â€” p_occurs_on + p_occurs_tz when range inactive.
      AND (
        (
          (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)
          AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)
        )
        OR (
          p_occurs_from IS NOT NULL
          AND p_occurs_to IS NOT NULL
          AND p_occurs_tz IS NOT NULL
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS sched
              WHERE NULLIF(trim(sched), '') IS NOT NULL
                AND (((trim(sched))::timestamptz AT TIME ZONE p_occurs_tz)::date
                     BETWEEN p_occurs_from AND p_occurs_to)
            )
            OR (
              p.type = 'hangout'
              AND COALESCE(p.is_recurring, false) = true
              AND EXISTS (
                SELECT 1
                FROM generate_series(
                  p_occurs_from::timestamp,
                  p_occurs_to::timestamp,
                  interval '1 day'
                ) AS gs(d)
                CROSS JOIN unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
                WHERE trim(rec.code) = CASE EXTRACT(ISODOW FROM gs.d::date)::int
                  WHEN 1 THEN 'MO'
                  WHEN 2 THEN 'TU'
                  WHEN 3 THEN 'WE'
                  WHEN 4 THEN 'TH'
                  WHEN 5 THEN 'FR'
                  WHEN 6 THEN 'SA'
                  WHEN 7 THEN 'SU'
                END
              )
            )
          )
        )
        OR (
          (p_occurs_from IS NULL OR p_occurs_to IS NULL)
          AND p_occurs_on IS NOT NULL
          AND p_occurs_tz IS NOT NULL
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS sched
              WHERE NULLIF(trim(sched), '') IS NOT NULL
                AND (((trim(sched))::timestamptz AT TIME ZONE p_occurs_tz)::date = p_occurs_on)
            )
            OR (
              p.type = 'hangout'
              AND COALESCE(p.is_recurring, false) = true
              AND EXISTS (
                SELECT 1
                FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
                WHERE trim(rec.code) = CASE EXTRACT(ISODOW FROM p_occurs_on)::int
                  WHEN 1 THEN 'MO'
                  WHEN 2 THEN 'TU'
                  WHEN 3 THEN 'WE'
                  WHEN 4 THEN 'TH'
                  WHEN 5 THEN 'FR'
                  WHEN 6 THEN 'SA'
                  WHEN 7 THEN 'SU'
                END
              )
            )
          )
        )
      )
  ),
  true_total_cte AS (
    SELECT COUNT(*)::INTEGER AS cnt FROM eligible_base
  ),
  page_ids AS (
    SELECT id FROM eligible_base
    ORDER BY created_at DESC, id DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  -- Social snapshot: page_ids only (never eligible_base).
  viewer_pair_own AS (
    SELECT DISTINCT o.source_post_id
    FROM public.social_opportunities o
    INNER JOIN page_ids pi ON pi.id = o.source_post_id
    WHERE p_viewer_user_id IS NOT NULL
      AND o.kind = 'pair_up'
      AND o.status = 'active'
      AND o.creator_id = p_viewer_user_id
  ),
  viewer_open_plan_own AS (
    SELECT DISTINCT o.source_post_id
    FROM public.social_opportunities o
    INNER JOIN page_ids pi ON pi.id = o.source_post_id
    WHERE p_viewer_user_id IS NOT NULL
      AND o.kind = 'open_plan'
      AND o.status = 'active'
      AND o.creator_id = p_viewer_user_id
  ),
  viewer_group_own AS (
    SELECT DISTINCT o.source_post_id
    FROM public.social_opportunities o
    INNER JOIN page_ids pi ON pi.id = o.source_post_id
    WHERE p_viewer_user_id IS NOT NULL
      AND o.kind = 'group_up'
      AND o.status = 'active'
      AND o.creator_id = p_viewer_user_id
  ),
  -- Same discoverable filters as get_group_up_counts_for_sources.
  group_discoverable_counts AS (
    SELECT
      o.source_post_id,
      count(*)::integer AS cnt
    FROM public.social_opportunities o
    INNER JOIN page_ids pi ON pi.id = o.source_post_id
    INNER JOIN public.conversations c
      ON c.id = o.conversation_id
    INNER JOIN public.posts sp
      ON sp.id = o.source_post_id
    INNER JOIN public.profiles src_author
      ON src_author.user_id = sp.author_id
     AND src_author.deleted_at IS NULL
    WHERE p_viewer_user_id IS NOT NULL
      AND o.kind = 'group_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND public.group_up_source_is_eligible(o.source_post_id)
      AND public.can_view_post(sp.id)
      AND COALESCE(sp.status, 'published') = 'published'
      AND sp.visibility = 'public'
      AND COALESCE(src_author.is_private, false) = false
      AND sp.type IN ('hangout', 'experience')
      AND NOT public.users_are_blocked_pair(p_viewer_user_id, o.creator_id)
      AND NOT public.users_are_blocked_pair(p_viewer_user_id, sp.author_id)
      AND (
        o.creator_id = p_viewer_user_id
        OR EXISTS (
          SELECT 1
          FROM public.conversation_members cm
          WHERE cm.conversation_id = o.conversation_id
            AND cm.user_id = p_viewer_user_id
            AND cm.left_at IS NULL
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.group_up_requests dec
            WHERE dec.opportunity_id = o.id
              AND dec.requester_id = p_viewer_user_id
              AND dec.status = 'declined'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.group_up_requests acc
            WHERE acc.opportunity_id = o.id
              AND acc.requester_id = p_viewer_user_id
              AND acc.status = 'accepted'
          )
        )
      )
    GROUP BY o.source_post_id
  ),
  -- Active discoverable Pair Ups (Duo) for page_ids only — mirrors Group page-scoped aggregate.
  pair_discoverable_counts AS (
    SELECT
      o.source_post_id,
      count(*)::integer AS cnt
    FROM public.social_opportunities o
    INNER JOIN page_ids pi ON pi.id = o.source_post_id
    INNER JOIN public.posts sp
      ON sp.id = o.source_post_id
    WHERE p_viewer_user_id IS NOT NULL
      AND o.kind = 'pair_up'
      AND o.status = 'active'
      AND o.discoverable_until > now()
      AND public.people_source_is_eligible(o.source_post_id)
      AND NOT public.users_are_blocked_pair(p_viewer_user_id, o.creator_id)
      AND NOT public.users_are_blocked_pair(p_viewer_user_id, sp.author_id)
    GROUP BY o.source_post_id
  ),
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
      COALESCE(p.like_count, 0) AS like_count,
      COALESCE(p.save_count, 0) AS save_count,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(p.like_count, 0) + COALESCE(demo.demo_like_count, 0)
        ELSE COALESCE(p.like_count, 0)
      END AS effective_like_count,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(p.save_count, 0) + COALESCE(demo.demo_save_count, 0)
        ELSE COALESCE(p.save_count, 0)
      END AS effective_save_count,
      COALESCE(p.comment_count, 0) AS comment_count,
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
      CASE
        WHEN p.type = 'hangout' THEN
          jsonb_build_object(
            'currentUserStatus', COALESCE(user_rsvp.status, NULL),
            'going_count', COALESCE(rsvp_going_cnt.cnt, 0)
          )
        ELSE NULL
      END AS rsvp_data,
      p.rsvp_capacity AS rsvp_capacity,
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
      END AS effective_rating_average,
      CASE
        WHEN p.type = 'experience' THEN COALESCE(demo.demo_rating_count, 0) + COALESCE(p.rating_count, 0)
        ELSE COALESCE(p.rating_count, 0)
      END AS effective_rating_count,
      (
        SELECT pr.stars
        FROM post_ratings pr
        WHERE pr.post_id = p.id
          AND pr.user_id = p_viewer_user_id
        LIMIT 1
      ) AS viewer_rating,
      p.is_recurring AS is_recurring,
      p.recurrence_days AS recurrence_days,
      CASE
        WHEN p_viewer_user_id IS NULL THEN NULL
        WHEN p.type = 'hangout' THEN (viewer_pair_own.source_post_id IS NOT NULL)
        WHEN p.type = 'experience' THEN (viewer_open_plan_own.source_post_id IS NOT NULL)
        ELSE false
      END AS duo_own_active,
      CASE
        WHEN p_viewer_user_id IS NULL THEN NULL
        ELSE (viewer_group_own.source_post_id IS NOT NULL)
      END AS group_own_active,
      CASE
        WHEN p_viewer_user_id IS NULL THEN NULL
        ELSE COALESCE(group_discoverable_counts.cnt, 0)
      END AS discoverable_group_count,
      CASE
        WHEN p_viewer_user_id IS NULL THEN NULL
        ELSE COALESCE(pair_discoverable_counts.cnt, 0)
      END AS discoverable_pair_count,
      p.social_discovery_boosted_at AS social_discovery_boosted_at,
      p.media_order AS media_order,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', pm.id,
              'bunny_video_id', pm.bunny_video_id,
              'video_status', pm.video_status,
              'poster_url', pm.poster_url,
              'duration_sec', pm.duration_sec,
              'width', pm.width,
              'height', pm.height,
              'sort_order', pm.sort_order
            )
            ORDER BY pm.sort_order ASC NULLS LAST, pm.id ASC
          )
          FROM public.post_media pm
          WHERE pm.post_id = p.id
        ),
        '[]'::jsonb
      ) AS post_media,
      slot0.slot0_location_name,
      slot0.slot0_location_url,
      slot0.slot0_key_info,
      latest_comment.latest_comment_preview
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
    LEFT JOIN public.post_demo_engagement demo ON
      demo.post_id = p.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt
      FROM rsvp_responses r
      WHERE r.post_id = p.id AND r.status = 'going'
    ) rsvp_going_cnt ON true
    LEFT JOIN rsvp_responses user_rsvp ON
      user_rsvp.post_id = p.id AND user_rsvp.user_id = p_viewer_user_id
    LEFT JOIN viewer_pair_own ON viewer_pair_own.source_post_id = p.id
    LEFT JOIN viewer_open_plan_own ON viewer_open_plan_own.source_post_id = p.id
    LEFT JOIN viewer_group_own ON viewer_group_own.source_post_id = p.id
    LEFT JOIN group_discoverable_counts ON group_discoverable_counts.source_post_id = p.id
    LEFT JOIN pair_discoverable_counts ON pair_discoverable_counts.source_post_id = p.id
    LEFT JOIN LATERAL (
      SELECT
        a.location_name AS slot0_location_name,
        a.location_url AS slot0_location_url,
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'title', 'V4KeyInfo',
                'value', COALESCE(ki.elem->>'value', '')
              )
              ORDER BY ki.ord
            ),
            '[]'::jsonb
          )
          FROM (
            SELECT x.elem, x.ord
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(a.additional_info) = 'array' THEN a.additional_info
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY AS x(elem, ord)
            WHERE btrim(COALESCE(x.elem->>'title', '')) = 'V4KeyInfo'
              AND NULLIF(btrim(COALESCE(x.elem->>'value', '')), '') IS NOT NULL
            ORDER BY x.ord
            LIMIT 4
          ) ki
        ) AS slot0_key_info
      FROM activities a
      WHERE a.post_id = p.id
      ORDER BY a.order_idx ASC NULLS LAST, a.created_at ASC
      LIMIT 1
    ) slot0 ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'id', c.id,
        'author_label', COALESCE(
          NULLIF(btrim(pr.display_name), ''),
          NULLIF(btrim(pr.username), ''),
          'Unknown User'
        ),
        'text', left(btrim(c.content), 160)
      ) AS latest_comment_preview
      FROM public.comments c
      LEFT JOIN public.profiles pr
        ON pr.user_id = c.author_id
       AND pr.deleted_at IS NULL
      WHERE c.post_id = p.id
        AND c.parent_id IS NULL
        AND c.is_deleted = false
        AND btrim(c.content) <> ''
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 1
    ) latest_comment ON true
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
        'like_count', fp.like_count,
        'save_count', fp.save_count,
        'effective_like_count', fp.effective_like_count,
        'effective_save_count', fp.effective_save_count,
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
        'rsvp_data', fp.rsvp_data,
        'rsvp_capacity', fp.rsvp_capacity,
        'rating_enabled', fp.rating_enabled,
        'rating_average', fp.rating_average,
        'rating_count', fp.rating_count,
        'effective_rating_average', fp.effective_rating_average,
        'effective_rating_count', fp.effective_rating_count,
        'viewer_rating', fp.viewer_rating,
        'is_recurring', fp.is_recurring,
        'recurrence_days', fp.recurrence_days,
        'duo_own_active', fp.duo_own_active,
        'group_own_active', fp.group_own_active,
        'discoverable_group_count', fp.discoverable_group_count,
        'discoverable_pair_count', fp.discoverable_pair_count,
        'social_discovery_boosted_at', fp.social_discovery_boosted_at,
        'media_order', fp.media_order,
        'post_media', fp.post_media,
        'slot0_location_name', fp.slot0_location_name,
        'slot0_location_url', fp.slot0_location_url,
        'slot0_key_info', fp.slot0_key_info,
        'latest_comment_preview', fp.latest_comment_preview
      ) ORDER BY fp.created_at DESC
    ) FROM filtered_posts fp)
  INTO v_true_total, v_posts
  FROM true_total_cte
  LIMIT 1;

  v_result := jsonb_build_object(
    'posts', COALESCE(v_posts, '[]'::jsonb),
    'count', COALESCE(v_true_total, 0)
  );

  RETURN v_result;
END;
$function$

-- ---------------------------------------------------------------------------
-- get_post_detail_with_related_data — live body + main-post predicate only
-- ---------------------------------------------------------------------------
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
  IF p_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = p_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

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
    'author', jsonb_build_object(
      'id', author_profile.id,
      'username', author_profile.username,
      'display_name', author_profile.display_name,
      'avatar_url', author_profile.avatar_url,
      'is_private', author_profile.is_private
    ),
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
    'is_liked', CASE WHEN p_viewer_user_id IS NOT NULL AND user_like.post_id IS NOT NULL THEN true ELSE false END,
    'is_saved', CASE WHEN p_viewer_user_id IS NOT NULL AND user_save.post_id IS NOT NULL THEN true ELSE false END,
    'comment_count', COALESCE(p.comment_count, 0),
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
    'rsvp_data', CASE
      WHEN p.type = 'hangout' THEN
        jsonb_build_object(
          'users', COALESCE(rsvp_users.json_array, '[]'::jsonb),
          'currentUserStatus', COALESCE(user_rsvp.status, NULL)
        )
      ELSE NULL
    END,
    'duo_own_active', CASE
      WHEN p_viewer_user_id IS NULL THEN NULL
      WHEN p.type = 'hangout' THEN EXISTS (
        SELECT 1 FROM public.social_opportunities o
        WHERE o.source_post_id = p.id
          AND o.kind = 'pair_up'
          AND o.status = 'active'
          AND o.creator_id = p_viewer_user_id
      )
      WHEN p.type = 'experience' THEN EXISTS (
        SELECT 1 FROM public.social_opportunities o
        WHERE o.source_post_id = p.id
          AND o.kind = 'open_plan'
          AND o.status = 'active'
          AND o.creator_id = p_viewer_user_id
      )
      ELSE false
    END,
    'group_own_active', CASE
      WHEN p_viewer_user_id IS NULL THEN NULL
      ELSE EXISTS (
        SELECT 1 FROM public.social_opportunities o
        WHERE o.source_post_id = p.id
          AND o.kind = 'group_up'
          AND o.status = 'active'
          AND o.creator_id = p_viewer_user_id
      )
    END,
    'discoverable_group_count', CASE
      WHEN p_viewer_user_id IS NULL THEN NULL
      ELSE (
        SELECT count(*)::integer
        FROM public.social_opportunities o
        INNER JOIN public.conversations c ON c.id = o.conversation_id
        INNER JOIN public.posts sp ON sp.id = o.source_post_id
        INNER JOIN public.profiles src_author
          ON src_author.user_id = sp.author_id
         AND src_author.deleted_at IS NULL
        WHERE o.source_post_id = p.id
          AND o.kind = 'group_up'
          AND o.status = 'active'
          AND o.discoverable_until > now()
          AND public.group_up_source_is_eligible(o.source_post_id)
          AND public.can_view_post(sp.id)
          AND COALESCE(sp.status, 'published') = 'published'
          AND sp.visibility = 'public'
          AND COALESCE(src_author.is_private, false) = false
          AND sp.type IN ('hangout', 'experience')
          AND NOT public.users_are_blocked_pair(p_viewer_user_id, o.creator_id)
          AND NOT public.users_are_blocked_pair(p_viewer_user_id, sp.author_id)
          AND (
            o.creator_id = p_viewer_user_id
            OR EXISTS (
              SELECT 1
              FROM public.conversation_members cm
              WHERE cm.conversation_id = o.conversation_id
                AND cm.user_id = p_viewer_user_id
                AND cm.left_at IS NULL
            )
            OR (
              NOT EXISTS (
                SELECT 1
                FROM public.group_up_requests dec
                WHERE dec.opportunity_id = o.id
                  AND dec.requester_id = p_viewer_user_id
                  AND dec.status = 'declined'
              )
              AND NOT EXISTS (
                SELECT 1
                FROM public.group_up_requests acc
                WHERE acc.opportunity_id = o.id
                  AND acc.requester_id = p_viewer_user_id
                  AND acc.status = 'accepted'
              )
            )
          )
      )
    END
  )
  INTO v_post
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
  WHERE p.id = p_post_id
    AND (
      p_viewer_user_id IS NULL
      OR NOT public.users_are_blocked_pair(p_viewer_user_id, p.author_id)
    )
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
    AND (
      COALESCE(p.status, 'published') = 'published'
      OR p.author_id = auth.uid()
    )
    -- V1: creator-only while any attached video is still processing.
    AND (
      p.author_id = auth.uid()
      OR NOT public.post_has_nonready_attached_video(p.id)
    );

  IF v_post IS NULL THEN
    v_result := jsonb_build_object('post', NULL, 'error', 'Post not found or access denied');
  ELSE
    v_result := jsonb_build_object('post', v_post);
  END IF;

  RETURN v_result;
END;
$function$
