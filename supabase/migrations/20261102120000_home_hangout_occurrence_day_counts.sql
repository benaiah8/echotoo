-- Home calendar: per-day discoverable hangout counts for one calendar month.
-- LOCAL ONLY — do not apply to production until explicitly approved.
--
-- Parity baseline: eligible_base predicates from
-- 20261031130000_v1_1_feed_hide_processing_video_from_everyone.sql
-- (get_feed_with_related_data), with p_type = hangout and no search/tags.
--
-- Count semantics match Home single-day filter (p_occurs_on + p_occurs_tz):
-- scheduled selected_dates on that Addis calendar day, plus recurring weekday hits.
-- Does NOT modify get_feed_with_related_data.

CREATE OR REPLACE FUNCTION public.get_home_hangout_occurrence_day_counts(
  p_month_start date,
  p_viewer_user_id uuid DEFAULT NULL::uuid,
  p_friends_only boolean DEFAULT false,
  p_occurs_tz text DEFAULT 'Africa/Addis_Ababa'::text
)
RETURNS TABLE (
  day date,
  event_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_viewer_user_id uuid;
  v_viewer_profile_id uuid;
  v_month_start date;
  v_month_end date;
  v_tz text;
BEGIN
  -- Viewer identity from JWT only (NULL for anonymous). p_viewer_user_id is non-authoritative.
  v_viewer_user_id := auth.uid();

  IF p_month_start IS NULL THEN
    RAISE EXCEPTION 'p_month_start is required'
      USING ERRCODE = '22023';
  END IF;

  v_month_start := date_trunc('month', p_month_start)::date;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  v_tz := NULLIF(btrim(p_occurs_tz), '');
  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'p_occurs_tz is required'
      USING ERRCODE = '22023';
  END IF;

  IF v_viewer_user_id IS NOT NULL THEN
    SELECT id INTO v_viewer_profile_id
    FROM profiles
    WHERE user_id = v_viewer_user_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH
  month_days AS (
    SELECT gs.d::date AS day
    FROM generate_series(v_month_start, v_month_end, interval '1 day') AS gs(d)
  ),
  eligible_posts AS (
    SELECT
      p.id,
      p.selected_dates,
      p.is_recurring,
      p.recurrence_days
    FROM posts p
    INNER JOIN profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    LEFT JOIN follows mutual_follow ON
      mutual_follow.follower_id = v_viewer_profile_id
      AND mutual_follow.following_id = author_profile.id
    LEFT JOIN follows reverse_follow ON
      reverse_follow.follower_id = author_profile.id
      AND reverse_follow.following_id = v_viewer_profile_id
    WHERE
      p.type = 'hangout'::post_type
      AND (
        author_profile.is_private = false
        OR v_viewer_profile_id = author_profile.id
        OR (
          author_profile.is_private = true
          AND mutual_follow.status = 'approved'
        )
      )
      AND (
        p.visibility IS NULL
        OR p.visibility = 'public'
        OR p.visibility = 'anonymous'
        OR v_viewer_profile_id = author_profile.id
        OR (
          p.visibility = 'friends'
          AND mutual_follow.status = 'approved'
          AND reverse_follow.status = 'approved'
        )
      )
      AND COALESCE(p.status, 'published') = 'published'
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
      AND (
        v_viewer_user_id IS NULL
        OR NOT public.users_are_blocked_pair(v_viewer_user_id, p.author_id)
      )
      AND NOT public.post_has_nonready_attached_video(p.id)
      AND (
        NOT COALESCE(p_friends_only, false)
        OR (
          mutual_follow.status = 'approved'
          AND reverse_follow.status = 'approved'
        )
      )
      -- Calendar counts require a schedulable occurrence (exclude unscheduled hangouts).
      AND (
        COALESCE(p.is_recurring, false) = true
        OR COALESCE(jsonb_array_length(p.selected_dates), 0) > 0
      )
  ),
  post_day AS (
    SELECT DISTINCT ep.id AS post_id, md.day
    FROM eligible_posts ep
    CROSS JOIN month_days md
    WHERE (
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(ep.selected_dates, '[]'::jsonb)) AS sched
        WHERE NULLIF(trim(sched), '') IS NOT NULL
          AND (((trim(sched))::timestamptz AT TIME ZONE v_tz)::date = md.day)
      )
      OR (
        COALESCE(ep.is_recurring, false) = true
        AND EXISTS (
          SELECT 1
          FROM unnest(COALESCE(ep.recurrence_days, ARRAY[]::text[])) AS rec(code)
          WHERE trim(rec.code) = CASE EXTRACT(ISODOW FROM md.day)::int
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
  ),
  counts AS (
    SELECT pd.day, count(*)::integer AS event_count
    FROM post_day pd
    GROUP BY pd.day
  )
  SELECT
    md.day,
    COALESCE(c.event_count, 0)::integer AS event_count
  FROM month_days md
  LEFT JOIN counts c ON c.day = md.day
  ORDER BY md.day;
END;
$function$;

COMMENT ON FUNCTION public.get_home_hangout_occurrence_day_counts(date, uuid, boolean, text) IS
  'Home calendar: daily discoverable hangout counts for one month (Addis calendar-day semantics). '
  'Eligible posts mirror get_feed_with_related_data hangout discovery gates; occurrence matches '
  'single-day p_occurs_on logic. Returns every day in the month (0 where none).';

GRANT EXECUTE ON FUNCTION public.get_home_hangout_occurrence_day_counts(date, uuid, boolean, text)
  TO anon;
GRANT EXECUTE ON FUNCTION public.get_home_hangout_occurrence_day_counts(date, uuid, boolean, text)
  TO authenticated;
