-- Bunny Video Phase V1B — transactional post_media attachment on NEW publish.
-- LOCAL migration only; do not apply without explicit approval.
--
-- Replaces public.owner_create_post (latest: 20260825120100_activities_section_body).
-- Attaches pre-publish post_media via SECURITY DEFINER AFTER INSERT trigger on posts.
-- owner_republish_post is unchanged.

-- ---------------------------------------------------------------------------
-- 1) Ensure post_media remains client read-only (no draft UPDATE grant/policy)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS post_media_attach_owner_publish_v1 ON public.post_media;

REVOKE UPDATE ON TABLE public.post_media FROM authenticated;

REVOKE UPDATE (post_id)
ON public.post_media
FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2) SECURITY DEFINER trigger — attach ready/processing videos on publish
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_ready_post_media_on_post_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, '') <> 'published' THEN
    RETURN NEW;
  END IF;

  UPDATE public.post_media pm
  SET post_id = NEW.id
  WHERE pm.publish_post_id = NEW.id
    AND pm.owner_user_id = NEW.author_id
    AND pm.post_id IS NULL
    AND pm.video_status IN ('processing', 'ready');

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_ready_post_media_on_post_publish() FROM PUBLIC;

DROP TRIGGER IF EXISTS posts_attach_ready_post_media_after_insert ON public.posts;
CREATE TRIGGER posts_attach_ready_post_media_after_insert
  AFTER INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.attach_ready_post_media_on_post_publish();

COMMENT ON FUNCTION public.attach_ready_post_media_on_post_publish() IS
  'AFTER INSERT on posts: attaches owner pre-publish Bunny videos when status=published. SECURITY DEFINER; not a client API.';

-- ---------------------------------------------------------------------------
-- 3) owner_create_post — publish gate + media_order; attachment via trigger
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
  v_media_order jsonb := NULL;
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

  IF p_payload ? 'media_order' THEN
    IF jsonb_typeof(p_payload->'media_order') = 'null' THEN
      v_media_order := NULL;
    ELSIF jsonb_typeof(p_payload->'media_order') <> 'array' THEN
      RAISE EXCEPTION 'Invalid media_order: expected JSON array'
        USING ERRCODE = '22023';
    ELSIF jsonb_array_length(p_payload->'media_order') > 10 THEN
      RAISE EXCEPTION 'Invalid media_order: exceeds maximum of 10 items'
        USING ERRCODE = '22023';
    ELSE
      v_media_order := p_payload->'media_order';
    END IF;
  END IF;

  -- Reject publish while pre-publish video is still uploading or failed.
  IF EXISTS (
    SELECT 1
    FROM public.post_media pm
    WHERE pm.publish_post_id = p_post_id
      AND pm.owner_user_id = v_actor
      AND pm.post_id IS NULL
      AND pm.video_status IN ('pending', 'uploading')
  ) THEN
    RAISE EXCEPTION 'Video upload is still in progress; wait for upload to finish before publishing'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.post_media pm
    WHERE pm.publish_post_id = p_post_id
      AND pm.owner_user_id = v_actor
      AND pm.post_id IS NULL
      AND pm.video_status = 'failed'
  ) THEN
    RAISE EXCEPTION 'Video upload failed; remove or replace the video before publishing'
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
    rating_enabled,
    media_order
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
    END,
    v_media_order
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
        images,
        section_body
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
        END,
        nullif(v_activity->>'section_body', '')
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
