-- Admin edit any post (report reviewers only).
-- Matches production: admin_get_post_for_edit + admin_republish_post RPCs.

-- ---------------------------------------------------------------------------
-- Fetch post + activities for admin edit UI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_post_for_edit(p_post_id uuid)
RETURNS TABLE (
  post jsonb,
  activities jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_post jsonb;
  v_activities jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_report_reviewer(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing post id';
  END IF;

  SELECT to_jsonb(p.*) INTO v_post
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF v_post IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  SELECT coalesce(
    jsonb_agg(to_jsonb(a.*) ORDER BY a.order_idx ASC NULLS LAST, a.id ASC),
    '[]'::jsonb
  )
  INTO v_activities
  FROM public.activities a
  WHERE a.post_id = p_post_id;

  post := v_post;
  activities := v_activities;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_post_for_edit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_post_for_edit(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Republish post + replace activities (admin edit; author_id unchanged)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_republish_post(
  p_post_id uuid,
  p_payload jsonb
)
RETURNS TABLE (
  post_id uuid,
  author_id uuid,
  updated boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_author_id uuid;
  v_old_type text;
  v_new_type text;
  v_caption_preview text;
  v_activity jsonb;
  v_idx int := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_report_reviewer(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_post_id IS NULL OR p_payload IS NULL THEN
    RAISE EXCEPTION 'Missing post or payload';
  END IF;

  SELECT p.author_id, p.type::text
  INTO v_author_id, v_old_type
  FROM public.posts p
  WHERE p.id = p_post_id
  FOR UPDATE;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  v_new_type := lower(coalesce(p_payload->>'type', v_old_type));
  IF v_new_type NOT IN ('experience', 'hangout') THEN
    RAISE EXCEPTION 'Invalid post type';
  END IF;

  IF v_new_type IS DISTINCT FROM v_old_type THEN
    RAISE EXCEPTION 'Post type cannot be changed';
  END IF;

  v_caption_preview := left(coalesce(p_payload->>'caption', ''), 200);

  INSERT INTO public.admin_post_action_audit (
    action,
    target_post_id,
    actor_user_id,
    old_author_id,
    metadata
  ) VALUES (
    'edit_post',
    p_post_id,
    v_actor,
    v_author_id,
    jsonb_build_object(
      'type', v_old_type,
      'caption_preview', v_caption_preview
    )
  );

  UPDATE public.posts
  SET
    caption = coalesce(p_payload->>'caption', caption),
    visibility = coalesce(nullif(p_payload->>'visibility', ''), visibility),
    tags = CASE
      WHEN p_payload ? 'tags' AND jsonb_typeof(p_payload->'tags') = 'array'
      THEN (
        SELECT CASE WHEN count(*) = 0 THEN NULL ELSE array_agg(value) END
        FROM jsonb_array_elements_text(p_payload->'tags') AS t(value)
      )
      ELSE tags
    END,
    selected_dates = CASE
      WHEN p_payload ? 'selected_dates'
           AND jsonb_typeof(p_payload->'selected_dates') = 'array'
      THEN (
        SELECT CASE WHEN count(*) = 0 THEN NULL ELSE array_agg(value) END
        FROM jsonb_array_elements_text(p_payload->'selected_dates') AS t(value)
      )
      ELSE selected_dates
    END,
    rsvp_capacity = CASE
      WHEN p_payload ? 'rsvp_capacity' AND (p_payload->>'rsvp_capacity') IS NULL
      THEN NULL
      WHEN p_payload ? 'rsvp_capacity'
      THEN (p_payload->>'rsvp_capacity')::integer
      ELSE rsvp_capacity
    END,
    is_recurring = CASE
      WHEN p_payload ? 'is_recurring'
      THEN (p_payload->>'is_recurring')::boolean
      ELSE is_recurring
    END,
    recurrence_days = CASE
      WHEN p_payload ? 'recurrence_days'
           AND jsonb_typeof(p_payload->'recurrence_days') = 'array'
      THEN (
        SELECT CASE WHEN count(*) = 0 THEN NULL ELSE array_agg(value) END
        FROM jsonb_array_elements_text(p_payload->'recurrence_days') AS t(value)
      )
      ELSE recurrence_days
    END,
    hero_images = CASE
      WHEN p_payload ? 'hero_images'
           AND jsonb_typeof(p_payload->'hero_images') = 'array'
      THEN (
        SELECT CASE WHEN count(*) = 0 THEN NULL ELSE array_agg(value) END
        FROM jsonb_array_elements_text(p_payload->'hero_images') AS t(value)
      )
      ELSE hero_images
    END,
    rating_enabled = CASE
      WHEN p_payload ? 'rating_enabled'
      THEN (p_payload->>'rating_enabled')::boolean
      ELSE rating_enabled
    END,
    is_anonymous = CASE
      WHEN p_payload ? 'is_anonymous'
      THEN (p_payload->>'is_anonymous')::boolean
      ELSE is_anonymous
    END,
    anonymous_name = CASE
      WHEN p_payload ? 'anonymous_name'
      THEN nullif(p_payload->>'anonymous_name', '')
      ELSE anonymous_name
    END,
    anonymous_avatar = CASE
      WHEN p_payload ? 'anonymous_avatar'
      THEN nullif(p_payload->>'anonymous_avatar', '')
      ELSE anonymous_avatar
    END,
    updated_at = now()
  WHERE id = p_post_id;

  DELETE FROM public.activities WHERE post_id = p_post_id;

  IF p_payload ? 'activities'
     AND jsonb_typeof(p_payload->'activities') = 'array'
     AND jsonb_array_length(p_payload->'activities') > 0
  THEN
    FOR v_activity IN
      SELECT value FROM jsonb_array_elements(p_payload->'activities') AS t(value)
    LOOP
      INSERT INTO public.activities (
        post_id,
        order_idx,
        title,
        activity_type,
        custom_activity,
        location_name,
        location_desc,
        location_url,
        location_notes,
        additional_info,
        tags,
        images
      ) VALUES (
        p_post_id,
        v_idx,
        coalesce(
          nullif(v_activity->>'title', ''),
          nullif(v_activity->>'custom_activity', ''),
          nullif(v_activity->>'activity_type', ''),
          format('Stop %s', v_idx + 1)
        ),
        nullif(v_activity->>'activity_type', ''),
        nullif(v_activity->>'custom_activity', ''),
        nullif(v_activity->>'location_name', ''),
        nullif(v_activity->>'location_desc', ''),
        nullif(v_activity->>'location_url', ''),
        nullif(v_activity->>'location_notes', ''),
        CASE
          WHEN v_activity ? 'additional_info'
               AND jsonb_typeof(v_activity->'additional_info') = 'array'
          THEN v_activity->'additional_info'
          ELSE NULL
        END,
        CASE
          WHEN v_activity ? 'tags'
               AND jsonb_typeof(v_activity->'tags') = 'array'
          THEN (
            SELECT CASE WHEN count(*) = 0 THEN NULL ELSE array_agg(value) END
            FROM jsonb_array_elements_text(v_activity->'tags') AS t(value)
          )
          ELSE NULL
        END,
        CASE
          WHEN v_activity ? 'images'
               AND jsonb_typeof(v_activity->'images') = 'array'
          THEN (
            SELECT CASE WHEN count(*) = 0 THEN NULL ELSE array_agg(value) END
            FROM jsonb_array_elements_text(v_activity->'images') AS t(value)
          )
          ELSE NULL
        END
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  post_id := p_post_id;
  author_id := v_author_id;
  updated := true;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_republish_post(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_republish_post(uuid, jsonb) TO authenticated;
