-- Owner atomic publish RPCs (Phase 1 — additive, backward-compatible).
-- New create + owner republish paths; existing insertPost/client flow unchanged until frontend wires in.
--
-- Security: SECURITY INVOKER — existing RLS on posts/activities is the boundary.
-- Idempotency: client-supplied p_post_id (posts.id); no new columns/tables.

-- ---------------------------------------------------------------------------
-- owner_create_post — atomic new publish (post + activities, zero activities OK)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_create_post(
  p_post_id uuid,
  p_payload jsonb
)
RETURNS TABLE (
  post jsonb,
  created boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_existing public.posts%ROWTYPE;
  v_new_type text;
  v_activity jsonb;
  v_idx int := 0;
  v_post_row public.posts%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing post id'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid payload: expected JSON object'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotency / conflict handling (no INSERT → no notification trigger on replay)
  SELECT *
  INTO v_existing
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF FOUND THEN
    IF v_existing.author_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Not authorized to publish with this post id'
        USING ERRCODE = '42501';
    END IF;

    IF coalesce(v_existing.status, '') = 'draft' THEN
      RAISE EXCEPTION 'Post id is reserved by a draft; use a new publish id or publish the draft separately'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_existing.status, '') = 'published' THEN
      post := to_jsonb(v_existing);
      created := false;
      RETURN NEXT;
      RETURN;
    END IF;

    RAISE EXCEPTION 'Post id already exists with unsupported status'
      USING ERRCODE = '22023';
  END IF;

  -- New publish validation (create UI types only)
  v_new_type := lower(coalesce(p_payload->>'type', ''));
  IF v_new_type NOT IN ('experience', 'hangout') THEN
    RAISE EXCEPTION 'Invalid post type for create'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'caption' IS NULL THEN
    RAISE EXCEPTION 'Missing caption'
      USING ERRCODE = '22023';
  END IF;

  -- ON CONFLICT: concurrent same-UUID requests block on the PK until the winner
  -- commits, then skip insert (DO NOTHING). Only the winning request proceeds to
  -- activity inserts; losers re-load the row and return idempotent success.
  INSERT INTO public.posts (
    id,
    author_id,
    type,
    caption,
    status,
    visibility,
    is_anonymous,
    anonymous_name,
    anonymous_avatar,
    rsvp_capacity,
    selected_dates,
    is_recurring,
    recurrence_days,
    tags,
    rating_enabled
  ) VALUES (
    p_post_id,
    v_actor,
    v_new_type::public.post_type,
    p_payload->>'caption',
    'published',
    coalesce(nullif(p_payload->>'visibility', ''), 'public'),
    false,
    NULL,
    NULL,
    CASE
      WHEN p_payload ? 'rsvp_capacity' AND (p_payload->>'rsvp_capacity') IS NULL
      THEN NULL
      WHEN p_payload ? 'rsvp_capacity'
      THEN (p_payload->>'rsvp_capacity')::integer
      ELSE NULL
    END,
    CASE
      WHEN p_payload ? 'selected_dates'
           AND jsonb_typeof(p_payload->'selected_dates') = 'array'
           AND jsonb_array_length(p_payload->'selected_dates') > 0
      THEN p_payload->'selected_dates'
      ELSE NULL
    END,
    CASE
      WHEN p_payload ? 'is_recurring'
      THEN (p_payload->>'is_recurring')::boolean
      ELSE NULL
    END,
    CASE
      WHEN p_payload ? 'recurrence_days'
           AND jsonb_typeof(p_payload->'recurrence_days') = 'array'
           AND jsonb_array_length(p_payload->'recurrence_days') > 0
      THEN (
        SELECT array_agg(value)
        FROM jsonb_array_elements_text(p_payload->'recurrence_days') AS t(value)
      )
      ELSE NULL
    END,
    CASE
      WHEN p_payload ? 'tags'
           AND jsonb_typeof(p_payload->'tags') = 'array'
           AND jsonb_array_length(p_payload->'tags') > 0
      THEN (
        SELECT array_agg(value)
        FROM jsonb_array_elements_text(p_payload->'tags') AS t(value)
      )
      ELSE NULL
    END,
    CASE
      WHEN p_payload ? 'rating_enabled'
      THEN coalesce((p_payload->>'rating_enabled')::boolean, false)
      ELSE false
    END
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_post_row;

  IF NOT FOUND THEN
    SELECT *
    INTO v_existing
    FROM public.posts p
    WHERE p.id = p_post_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Post id conflict could not be resolved'
        USING ERRCODE = '22023';
    END IF;

    IF v_existing.author_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Not authorized to publish with this post id'
        USING ERRCODE = '42501';
    END IF;

    IF coalesce(v_existing.status, '') = 'draft' THEN
      RAISE EXCEPTION 'Post id is reserved by a draft; use a new publish id or publish the draft separately'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_existing.status, '') = 'published' THEN
      post := to_jsonb(v_existing);
      created := false;
      RETURN NEXT;
      RETURN;
    END IF;

    RAISE EXCEPTION 'Post id already exists with unsupported status'
      USING ERRCODE = '22023';
  END IF;

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
        coalesce(
          nullif(v_activity->>'order_idx', '')::integer,
          v_idx
        ),
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
               AND jsonb_array_length(v_activity->'tags') > 0
          THEN (
            SELECT array_agg(value)
            FROM jsonb_array_elements_text(v_activity->'tags') AS t(value)
          )
          ELSE NULL
        END,
        CASE
          WHEN v_activity ? 'images'
               AND jsonb_typeof(v_activity->'images') = 'array'
               AND jsonb_array_length(v_activity->'images') > 0
          THEN (
            SELECT array_agg(value)
            FROM jsonb_array_elements_text(v_activity->'images') AS t(value)
          )
          ELSE NULL
        END
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  post := to_jsonb(v_post_row);
  created := true;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_create_post(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_create_post(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- owner_republish_post — atomic owner edit (preserve type incl. legacy enum values)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_republish_post(
  p_post_id uuid,
  p_payload jsonb
)
RETURNS TABLE (
  post jsonb,
  updated boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_author_id uuid;
  v_activity jsonb;
  v_idx int := 0;
  v_post_row public.posts%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing post id'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid payload: expected JSON object'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.author_id
  INTO v_author_id
  FROM public.posts p
  WHERE p.id = p_post_id
  FOR UPDATE;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Post not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_author_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Not authorized'
      USING ERRCODE = '42501';
  END IF;

  IF p_payload->>'caption' IS NULL THEN
    RAISE EXCEPTION 'Missing caption'
      USING ERRCODE = '22023';
  END IF;

  -- Preserve existing type (experience, hangout, rendezvous, playbook, …)
  UPDATE public.posts
  SET
    caption = p_payload->>'caption',
    visibility = coalesce(nullif(p_payload->>'visibility', ''), visibility),
    is_anonymous = false,
    anonymous_name = NULL,
    anonymous_avatar = NULL,
    tags = CASE
      WHEN p_payload ? 'tags' AND jsonb_typeof(p_payload->'tags') = 'array'
      THEN (
        SELECT CASE
          WHEN count(*) = 0 THEN NULL
          ELSE array_agg(value)
        END
        FROM jsonb_array_elements_text(p_payload->'tags') AS t(value)
      )
      ELSE tags
    END,
    selected_dates = CASE
      WHEN p_payload ? 'selected_dates'
           AND jsonb_typeof(p_payload->'selected_dates') = 'array'
      THEN (
        SELECT CASE
          WHEN count(*) = 0 THEN NULL
          ELSE jsonb_agg(value)
        END
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
        SELECT CASE
          WHEN count(*) = 0 THEN NULL
          ELSE array_agg(value)
        END
        FROM jsonb_array_elements_text(p_payload->'recurrence_days') AS t(value)
      )
      ELSE recurrence_days
    END,
    rating_enabled = CASE
      WHEN p_payload ? 'rating_enabled'
      THEN coalesce((p_payload->>'rating_enabled')::boolean, false)
      ELSE rating_enabled
    END,
    updated_at = now()
  WHERE id = p_post_id
  RETURNING * INTO v_post_row;

  -- Match createFlowPublish: replace activities only when payload includes a non-empty array
  IF p_payload ? 'activities'
     AND jsonb_typeof(p_payload->'activities') = 'array'
     AND jsonb_array_length(p_payload->'activities') > 0
  THEN
    DELETE FROM public.activities WHERE post_id = p_post_id;

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
        coalesce(
          nullif(v_activity->>'order_idx', '')::integer,
          v_idx
        ),
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
               AND jsonb_array_length(v_activity->'tags') > 0
          THEN (
            SELECT array_agg(value)
            FROM jsonb_array_elements_text(v_activity->'tags') AS t(value)
          )
          ELSE NULL
        END,
        CASE
          WHEN v_activity ? 'images'
               AND jsonb_typeof(v_activity->'images') = 'array'
               AND jsonb_array_length(v_activity->'images') > 0
          THEN (
            SELECT array_agg(value)
            FROM jsonb_array_elements_text(v_activity->'images') AS t(value)
          )
          ELSE NULL
        END
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  post := to_jsonb(v_post_row);
  updated := true;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_republish_post(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_republish_post(uuid, jsonb) TO authenticated;
