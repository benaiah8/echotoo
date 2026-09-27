-- Report-reviewer (admin) Edit media parity — LOCAL ONLY.
-- Do NOT apply / db push / repair without production approval.
--
-- Architecture:
--   _apply_post_media_edit_core(...)  — canonical ADD/REPLACE/REMOVE/media_order
--     (no post-author check; staging must be owned by p_staging_actor)
--   owner_apply_post_media_edit(...)  — requires posts.author_id = p_actor, then core
--   admin_republish_post(...)         — requires report_reviewers, optional video_edit/
--     media_order folded into same transaction via core (staging actor = reviewer)
--
-- Omitting video_edit / media_order on admin_republish_post preserves prior admin
-- republish behavior (caption/activities/type/schedule/audit).
-- Does NOT weaken owner_republish_post / owner_* authorization.
-- Does NOT Bunny-delete assets.

-- ---------------------------------------------------------------------------
-- 1) Shared media mutation core (internal — no direct authenticated grant)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._apply_post_media_edit_core(
  p_post_id uuid,
  p_staging_actor uuid,
  p_video_edit jsonb,
  p_media_order jsonb,
  p_media_order_provided boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_author_id uuid;
  v_op text;
  v_staged_id uuid;
  v_expected_attached_id uuid;
  v_attached_id uuid;
  v_attached_count int;
  v_staging public.post_media%ROWTYPE;
  v_retired_sort int;
  v_video_ref_count int;
  v_order_video_id uuid;
  v_item jsonb;
BEGIN
  IF p_staging_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing post id'
      USING ERRCODE = '22023';
  END IF;

  -- Lock post row (callers may already hold the lock in the same transaction).
  SELECT p.author_id
  INTO v_author_id
  FROM public.posts p
  WHERE p.id = p_post_id
  FOR UPDATE;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Post not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Default when video_edit omitted: no post_media mutation (media_order-only path).
  IF p_video_edit IS NULL OR jsonb_typeof(p_video_edit) = 'null' THEN
    v_op := 'UNCHANGED';
  ELSE
    IF jsonb_typeof(p_video_edit) <> 'object' THEN
      RAISE EXCEPTION 'Invalid video_edit: expected JSON object'
        USING ERRCODE = '22023';
    END IF;

    v_op := upper(coalesce(nullif(p_video_edit->>'op', ''), ''));
    IF v_op NOT IN ('ADD', 'REPLACE', 'REMOVE', 'UNCHANGED') THEN
      RAISE EXCEPTION 'Invalid video_edit.op'
        USING ERRCODE = '22023';
    END IF;

    IF p_video_edit ? 'staged_media_id'
       AND nullif(p_video_edit->>'staged_media_id', '') IS NOT NULL
    THEN
      BEGIN
        v_staged_id := (p_video_edit->>'staged_media_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid video_edit.staged_media_id'
          USING ERRCODE = '22023';
      END;
    ELSE
      v_staged_id := NULL;
    END IF;

    IF p_video_edit ? 'expected_attached_media_id'
       AND nullif(p_video_edit->>'expected_attached_media_id', '') IS NOT NULL
    THEN
      BEGIN
        v_expected_attached_id := (p_video_edit->>'expected_attached_media_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid video_edit.expected_attached_media_id'
          USING ERRCODE = '22023';
      END;
    ELSE
      v_expected_attached_id := NULL;
    END IF;
  END IF;

  SELECT pm.id
  INTO v_attached_id
  FROM public.post_media pm
  WHERE pm.post_id = p_post_id
    AND pm.kind = 'video'
  ORDER BY pm.sort_order ASC, pm.created_at ASC
  LIMIT 1;

  SELECT count(*)::int
  INTO v_attached_count
  FROM public.post_media pm
  WHERE pm.post_id = p_post_id
    AND pm.kind = 'video';

  IF v_attached_count > 1 THEN
    RAISE EXCEPTION 'Post has multiple attached videos; refuse unsafe edit'
      USING ERRCODE = '22023';
  END IF;

  IF v_op IN ('REPLACE', 'REMOVE') AND v_expected_attached_id IS NOT NULL THEN
    IF v_attached_id IS DISTINCT FROM v_expected_attached_id THEN
      RAISE EXCEPTION 'Stale attached video; reload and retry'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  IF v_op = 'ADD' THEN
    IF v_staged_id IS NULL THEN
      RAISE EXCEPTION 'ADD requires staged_media_id'
        USING ERRCODE = '22023';
    END IF;

    IF v_attached_id IS NOT NULL AND v_attached_id = v_staged_id THEN
      NULL;
    ELSIF v_attached_id IS NOT NULL THEN
      RAISE EXCEPTION 'Post already has an attached video; use REPLACE'
        USING ERRCODE = '22023';
    ELSE
      SELECT *
      INTO v_staging
      FROM public.post_media pm
      WHERE pm.id = v_staged_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Staged media not found'
          USING ERRCODE = 'P0002';
      END IF;

      -- Staging actor owns the unattached row (owner OR reviewer who staged).
      IF v_staging.owner_user_id IS DISTINCT FROM p_staging_actor
         OR v_staging.publish_post_id IS DISTINCT FROM p_post_id
      THEN
        RAISE EXCEPTION 'Staged media not authorized for this post'
          USING ERRCODE = '42501';
      END IF;

      IF v_staging.post_id IS NOT NULL THEN
        RAISE EXCEPTION 'Staged media is not unattached'
          USING ERRCODE = '22023';
      END IF;

      IF v_staging.video_status NOT IN ('processing', 'ready') THEN
        RAISE EXCEPTION 'Staged media is not publish-ready'
          USING ERRCODE = '22023';
      END IF;

      UPDATE public.post_media
      SET post_id = p_post_id,
          sort_order = 0
      WHERE id = v_staged_id;
    END IF;

  ELSIF v_op = 'REPLACE' THEN
    IF v_staged_id IS NULL THEN
      RAISE EXCEPTION 'REPLACE requires staged_media_id'
        USING ERRCODE = '22023';
    END IF;

    IF v_attached_id IS NULL THEN
      SELECT *
      INTO v_staging
      FROM public.post_media pm
      WHERE pm.id = v_staged_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Staged media not found'
          USING ERRCODE = 'P0002';
      END IF;

      IF v_staging.owner_user_id IS DISTINCT FROM p_staging_actor
         OR v_staging.publish_post_id IS DISTINCT FROM p_post_id
      THEN
        RAISE EXCEPTION 'Staged media not authorized for this post'
          USING ERRCODE = '42501';
      END IF;

      IF v_staging.post_id = p_post_id THEN
        NULL;
      ELSIF v_staging.post_id IS NOT NULL THEN
        RAISE EXCEPTION 'Staged media is attached to another post'
          USING ERRCODE = '22023';
      ELSIF v_staging.video_status NOT IN ('processing', 'ready') THEN
        RAISE EXCEPTION 'Staged media is not publish-ready'
          USING ERRCODE = '22023';
      ELSE
        UPDATE public.post_media
        SET post_id = p_post_id,
            sort_order = 0
        WHERE id = v_staged_id;
      END IF;
    ELSIF v_attached_id = v_staged_id THEN
      NULL;
    ELSE
      SELECT *
      INTO v_staging
      FROM public.post_media pm
      WHERE pm.id = v_staged_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Staged media not found'
          USING ERRCODE = 'P0002';
      END IF;

      IF v_staging.owner_user_id IS DISTINCT FROM p_staging_actor
         OR v_staging.publish_post_id IS DISTINCT FROM p_post_id
      THEN
        RAISE EXCEPTION 'Staged media not authorized for this post'
          USING ERRCODE = '42501';
      END IF;

      IF v_staging.post_id IS NOT NULL THEN
        RAISE EXCEPTION 'Staged media is not unattached'
          USING ERRCODE = '22023';
      END IF;

      IF v_staging.video_status NOT IN ('processing', 'ready') THEN
        RAISE EXCEPTION 'Staged media is not publish-ready'
          USING ERRCODE = '22023';
      END IF;

      v_retired_sort := 1000;
      WHILE EXISTS (
        SELECT 1
        FROM public.post_media pm
        WHERE pm.publish_post_id = p_post_id
          AND pm.post_id IS NULL
          AND pm.sort_order = v_retired_sort
      ) LOOP
        v_retired_sort := v_retired_sort + 1;
      END LOOP;

      UPDATE public.post_media
      SET post_id = NULL,
          sort_order = v_retired_sort
      WHERE id = v_attached_id
        AND post_id = p_post_id;

      UPDATE public.post_media
      SET post_id = p_post_id,
          sort_order = 0
      WHERE id = v_staged_id
        AND post_id IS NULL;
    END IF;

  ELSIF v_op = 'REMOVE' THEN
    IF v_staged_id IS NOT NULL THEN
      RAISE EXCEPTION 'REMOVE must not include staged_media_id'
        USING ERRCODE = '22023';
    END IF;

    IF v_attached_id IS NULL THEN
      NULL;
    ELSE
      v_retired_sort := 1000;
      WHILE EXISTS (
        SELECT 1
        FROM public.post_media pm
        WHERE pm.publish_post_id = p_post_id
          AND pm.post_id IS NULL
          AND pm.sort_order = v_retired_sort
      ) LOOP
        v_retired_sort := v_retired_sort + 1;
      END LOOP;

      UPDATE public.post_media
      SET post_id = NULL,
          sort_order = v_retired_sort
      WHERE id = v_attached_id
        AND post_id = p_post_id;
    END IF;

  ELSIF v_op = 'UNCHANGED' THEN
    NULL;
  END IF;

  IF p_media_order_provided THEN
    IF p_media_order IS NULL OR jsonb_typeof(p_media_order) = 'null' THEN
      UPDATE public.posts
      SET media_order = NULL,
          updated_at = now()
      WHERE id = p_post_id;
    ELSIF jsonb_typeof(p_media_order) <> 'array' THEN
      RAISE EXCEPTION 'Invalid media_order: expected JSON array'
        USING ERRCODE = '22023';
    ELSIF jsonb_array_length(p_media_order) > 10 THEN
      RAISE EXCEPTION 'Invalid media_order: exceeds maximum of 10 items'
        USING ERRCODE = '22023';
    ELSE
      v_video_ref_count := 0;

      FOR v_item IN
        SELECT value FROM jsonb_array_elements(p_media_order) AS t(value)
      LOOP
        IF jsonb_typeof(v_item) <> 'object' THEN
          RAISE EXCEPTION 'Invalid media_order item'
            USING ERRCODE = '22023';
        END IF;

        IF coalesce(v_item->>'kind', '') = 'video' THEN
          v_video_ref_count := v_video_ref_count + 1;
          IF v_video_ref_count > 1 THEN
            RAISE EXCEPTION 'Invalid media_order: at most one video'
              USING ERRCODE = '22023';
          END IF;

          BEGIN
            v_order_video_id := (v_item->>'mediaId')::uuid;
          EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid media_order video mediaId'
              USING ERRCODE = '22023';
          END;

          IF v_order_video_id IS NULL THEN
            RAISE EXCEPTION 'Invalid media_order video mediaId'
              USING ERRCODE = '22023';
          END IF;

          IF NOT EXISTS (
            SELECT 1
            FROM public.post_media pm
            WHERE pm.id = v_order_video_id
              AND pm.post_id = p_post_id
              AND pm.kind = 'video'
          ) THEN
            RAISE EXCEPTION 'media_order references video that is not attached'
              USING ERRCODE = '22023';
          END IF;
        ELSIF coalesce(v_item->>'kind', '') = 'image' THEN
          IF nullif(v_item->>'url', '') IS NULL THEN
            RAISE EXCEPTION 'Invalid media_order image url'
              USING ERRCODE = '22023';
          END IF;
        ELSE
          RAISE EXCEPTION 'Invalid media_order kind'
            USING ERRCODE = '22023';
        END IF;
      END LOOP;

      IF v_op = 'REMOVE' AND v_video_ref_count > 0 THEN
        RAISE EXCEPTION 'REMOVE media_order must not reference a video'
          USING ERRCODE = '22023';
      END IF;

      IF v_op IN ('ADD', 'REPLACE') AND v_staged_id IS NOT NULL AND v_video_ref_count = 1 THEN
        IF v_order_video_id IS DISTINCT FROM v_staged_id THEN
          RAISE EXCEPTION 'media_order video must match staged_media_id'
            USING ERRCODE = '22023';
        END IF;
      END IF;

      UPDATE public.posts
      SET media_order = p_media_order,
          updated_at = now()
      WHERE id = p_post_id;
    END IF;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public._apply_post_media_edit_core(uuid, uuid, jsonb, jsonb, boolean) IS
  'Internal SECURITY DEFINER media mutation. Callers must authorize actor. Staging owner_user_id must equal p_staging_actor. No Bunny deletes. No direct client grant.';

REVOKE ALL ON FUNCTION public._apply_post_media_edit_core(uuid, uuid, jsonb, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Owner wrapper — still requires post author = p_actor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_apply_post_media_edit(
  p_post_id uuid,
  p_actor uuid,
  p_video_edit jsonb,
  p_media_order jsonb,
  p_media_order_provided boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_author_id uuid;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'Missing post id'
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

  IF v_author_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'Not authorized'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public._apply_post_media_edit_core(
    p_post_id,
    p_actor,
    p_video_edit,
    p_media_order,
    p_media_order_provided
  );
END;
$function$;

COMMENT ON FUNCTION public.owner_apply_post_media_edit(uuid, uuid, jsonb, jsonb, boolean) IS
  'SECURITY DEFINER helper: owner-only apply of video ADD/REPLACE/REMOVE/UNCHANGED + optional media_order via _apply_post_media_edit_core. No Bunny deletes.';

REVOKE ALL ON FUNCTION public.owner_apply_post_media_edit(uuid, uuid, jsonb, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_apply_post_media_edit(uuid, uuid, jsonb, jsonb, boolean)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) admin_republish_post — same body as live + optional media apply
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_author_id uuid;
  v_existing_type public.post_type;
  v_existing_selected_dates jsonb;
  v_existing_is_recurring boolean;
  v_existing_recurrence_days text[];
  v_final_selected_dates jsonb;
  v_final_is_recurring boolean;
  v_final_recurrence_days text[];
  v_has_structured boolean;
  v_payload_type text;
  v_final_type public.post_type;
  v_caption_preview text;
  v_video_edit jsonb := NULL;
  v_media_order jsonb := NULL;
  v_media_order_provided boolean := false;
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.report_reviewers rr
    WHERE rr.user_id = v_actor_user_id
  ) THEN
    RAISE EXCEPTION 'Admin permission required'
      USING ERRCODE = '42501';
  END IF;

  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'Post id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    p.author_id,
    p.type,
    p.selected_dates,
    p.is_recurring,
    p.recurrence_days,
    left(coalesce(p.caption, ''), 240)
  INTO
    v_author_id,
    v_existing_type,
    v_existing_selected_dates,
    v_existing_is_recurring,
    v_existing_recurrence_days,
    v_caption_preview
  FROM public.posts p
  WHERE p.id = p_post_id
  FOR UPDATE;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Post not found'
      USING ERRCODE = 'P0002';
  END IF;

  v_final_selected_dates := CASE
    WHEN p_payload ? 'selected_dates' THEN
      CASE
        WHEN jsonb_typeof(p_payload->'selected_dates') = 'array' THEN p_payload->'selected_dates'
        WHEN jsonb_typeof(p_payload->'selected_dates') = 'null' THEN NULL
        WHEN nullif(p_payload->>'selected_dates', '') IS NOT NULL THEN jsonb_build_array(p_payload->>'selected_dates')
        ELSE NULL
      END
    ELSE v_existing_selected_dates
  END;

  v_final_is_recurring := CASE
    WHEN p_payload ? 'is_recurring' THEN
      coalesce((p_payload->>'is_recurring')::boolean, false)
    ELSE v_existing_is_recurring
  END;

  v_final_recurrence_days := CASE
    WHEN p_payload ? 'recurrence_days' THEN
      CASE
        WHEN jsonb_typeof(p_payload->'recurrence_days') = 'array' THEN
          nullif(
            array(SELECT jsonb_array_elements_text(p_payload->'recurrence_days')),
            '{}'::text[]
          )
        WHEN jsonb_typeof(p_payload->'recurrence_days') = 'null' THEN NULL
        WHEN nullif(p_payload->>'recurrence_days', '') IS NOT NULL THEN array[p_payload->>'recurrence_days']
        ELSE NULL
      END
    ELSE v_existing_recurrence_days
  END;

  v_has_structured := (
    (
      v_final_selected_dates IS NOT NULL
      AND jsonb_typeof(v_final_selected_dates) = 'array'
      AND jsonb_array_length(v_final_selected_dates) > 0
    )
    OR (
      v_final_recurrence_days IS NOT NULL
      AND cardinality(v_final_recurrence_days) > 0
    )
    OR coalesce(v_final_is_recurring, false) = true
  );

  IF NOT (p_payload ? 'type') THEN
    v_final_type := v_existing_type;
  ELSE
    v_payload_type := nullif(p_payload->>'type', '');
    IF v_payload_type IS NULL
       OR v_payload_type = v_existing_type::text
    THEN
      v_final_type := v_existing_type;
    ELSE
      IF v_existing_type::text NOT IN ('experience', 'hangout') THEN
        RAISE EXCEPTION 'Post type switching is not supported for this post type'
          USING ERRCODE = '22023';
      END IF;

      IF v_payload_type NOT IN ('experience', 'hangout') THEN
        RAISE EXCEPTION 'Invalid post type for republish'
          USING ERRCODE = '22023';
      END IF;

      IF v_payload_type = 'hangout' AND NOT v_has_structured THEN
        RAISE EXCEPTION 'Event (hangout) requires a structured schedule'
          USING ERRCODE = '22023';
      END IF;

      IF v_payload_type = 'experience' AND v_has_structured THEN
        RAISE EXCEPTION 'Post (experience) cannot have a structured schedule'
          USING ERRCODE = '22023';
      END IF;

      v_final_type := v_payload_type::public.post_type;
    END IF;
  END IF;

  INSERT INTO public.admin_post_action_audit (
    action,
    actor_user_id,
    target_post_id,
    old_author_id,
    new_author_id,
    metadata
  )
  VALUES (
    'edit_post',
    v_actor_user_id,
    p_post_id,
    v_author_id,
    NULL,
    jsonb_build_object(
      'rpc', 'admin_republish_post',
      'edited_post_id', p_post_id,
      'author_id', v_author_id,
      'post_type', v_existing_type::text,
      'old_type', v_existing_type::text,
      'new_type', v_final_type::text,
      'old_caption_preview', v_caption_preview
    )
  );

  UPDATE public.posts p
  SET
    type = v_final_type,
    caption = CASE
      WHEN p_payload ? 'caption' THEN p_payload->>'caption'
      ELSE p.caption
    END,
    visibility = CASE
      WHEN p_payload ? 'visibility' THEN p_payload->>'visibility'
      ELSE p.visibility
    END,
    tags = CASE
      WHEN p_payload ? 'tags' THEN
        CASE
          WHEN jsonb_typeof(p_payload->'tags') = 'array' THEN
            nullif(
              array(SELECT jsonb_array_elements_text(p_payload->'tags')),
              '{}'::text[]
            )
          WHEN jsonb_typeof(p_payload->'tags') = 'null' THEN NULL
          WHEN nullif(p_payload->>'tags', '') IS NOT NULL THEN array[p_payload->>'tags']
          ELSE NULL
        END
      ELSE p.tags
    END,
    selected_dates = CASE
      WHEN p_payload ? 'selected_dates' THEN
        CASE
          WHEN jsonb_typeof(p_payload->'selected_dates') = 'array' THEN p_payload->'selected_dates'
          WHEN jsonb_typeof(p_payload->'selected_dates') = 'null' THEN NULL
          WHEN nullif(p_payload->>'selected_dates', '') IS NOT NULL THEN jsonb_build_array(p_payload->>'selected_dates')
          ELSE NULL
        END
      ELSE p.selected_dates
    END,
    rsvp_capacity = CASE
      WHEN p_payload ? 'rsvp_capacity' THEN
        nullif(p_payload->>'rsvp_capacity', '')::integer
      ELSE p.rsvp_capacity
    END,
    is_recurring = CASE
      WHEN p_payload ? 'is_recurring' THEN
        coalesce((p_payload->>'is_recurring')::boolean, false)
      ELSE p.is_recurring
    END,
    repeat_weekly = CASE
      WHEN p_payload ? 'repeat_weekly' THEN
        coalesce((p_payload->>'repeat_weekly')::boolean, false)
      ELSE p.repeat_weekly
    END,
    recurrence_days = CASE
      WHEN p_payload ? 'recurrence_days' THEN
        CASE
          WHEN jsonb_typeof(p_payload->'recurrence_days') = 'array' THEN
            nullif(
              array(SELECT jsonb_array_elements_text(p_payload->'recurrence_days')),
              '{}'::text[]
            )
          WHEN jsonb_typeof(p_payload->'recurrence_days') = 'null' THEN NULL
          WHEN nullif(p_payload->>'recurrence_days', '') IS NOT NULL THEN array[p_payload->>'recurrence_days']
          ELSE NULL
        END
      ELSE p.recurrence_days
    END,
    rating_enabled = CASE
      WHEN p_payload ? 'rating_enabled' THEN
        coalesce((p_payload->>'rating_enabled')::boolean, false)
      ELSE p.rating_enabled
    END,
    duration = CASE
      WHEN p_payload ? 'duration' THEN nullif(p_payload->>'duration', '')
      ELSE p.duration
    END,
    start_at = CASE
      WHEN p_payload ? 'start_at' THEN
        nullif(p_payload->>'start_at', '')::timestamptz
      ELSE p.start_at
    END,
    hero_images = CASE
      WHEN p_payload ? 'hero_images' THEN
        CASE
          WHEN jsonb_typeof(p_payload->'hero_images') = 'array' THEN
            coalesce(
              array(SELECT jsonb_array_elements_text(p_payload->'hero_images')),
              '{}'::text[]
            )
          WHEN jsonb_typeof(p_payload->'hero_images') = 'null' THEN '{}'::text[]
          WHEN nullif(p_payload->>'hero_images', '') IS NOT NULL THEN array[p_payload->>'hero_images']
          ELSE '{}'::text[]
        END
      ELSE p.hero_images
    END
  WHERE p.id = p_post_id;

  IF p_payload ? 'activities' THEN
    IF jsonb_typeof(p_payload->'activities') <> 'array' THEN
      RAISE EXCEPTION 'activities must be a JSON array'
        USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.activities a
    WHERE a.post_id = p_post_id;

    INSERT INTO public.activities (
      post_id,
      order_idx,
      title,
      location_name,
      location_desc,
      location_url,
      location_notes,
      notes,
      duration,
      activity_type,
      custom_activity,
      additional_info,
      tags,
      images,
      section_body
    )
    SELECT
      p_post_id,
      coalesce(nullif(item->>'order_idx', '')::integer, ordinality::integer - 1),
      nullif(item->>'title', ''),
      coalesce(item->>'location_name', ''),
      coalesce(item->>'location_desc', ''),
      coalesce(item->>'location_url', ''),
      coalesce(item->>'location_notes', ''),
      nullif(item->>'notes', ''),
      nullif(item->>'duration', ''),
      coalesce(item->>'activity_type', ''),
      coalesce(item->>'custom_activity', ''),
      CASE
        WHEN item ? 'additional_info'
         AND jsonb_typeof(item->'additional_info') IN ('array', 'object')
        THEN item->'additional_info'
        ELSE '[]'::jsonb
      END,
      CASE
        WHEN item ? 'tags' AND jsonb_typeof(item->'tags') = 'array' THEN
          coalesce(array(SELECT jsonb_array_elements_text(item->'tags')), '{}'::text[])
        WHEN item ? 'tags' AND jsonb_typeof(item->'tags') = 'null' THEN
          '{}'::text[]
        WHEN item ? 'tags' AND nullif(item->>'tags', '') IS NOT NULL THEN
          array[item->>'tags']
        ELSE '{}'::text[]
      END,
      CASE
        WHEN item ? 'images' AND jsonb_typeof(item->'images') = 'array' THEN
          coalesce(array(SELECT jsonb_array_elements_text(item->'images')), '{}'::text[])
        WHEN item ? 'images' AND jsonb_typeof(item->'images') = 'null' THEN
          '{}'::text[]
        WHEN item ? 'images' AND nullif(item->>'images', '') IS NOT NULL THEN
          array[item->>'images']
        ELSE '{}'::text[]
      END,
      nullif(item->>'section_body', '')
    FROM jsonb_array_elements(p_payload->'activities') WITH ORDINALITY AS rows(item, ordinality);
  END IF;

  -- Optional Edit media commit (same transaction). Omit keys → prior admin behavior.
  IF p_payload ? 'video_edit'
     AND jsonb_typeof(p_payload->'video_edit') <> 'null'
  THEN
    v_video_edit := p_payload->'video_edit';
  END IF;
  IF p_payload ? 'media_order' THEN
    v_media_order_provided := true;
    v_media_order := p_payload->'media_order';
  END IF;

  IF v_video_edit IS NOT NULL OR v_media_order_provided THEN
    -- Staging rows are owned by the reviewer actor (not spoofed as post author).
    PERFORM public._apply_post_media_edit_core(
      p_post_id,
      v_actor_user_id,
      v_video_edit,
      v_media_order,
      v_media_order_provided
    );
  END IF;

  RETURN QUERY
  SELECT
    p_post_id,
    v_author_id,
    true;
END;
$function$;

COMMENT ON FUNCTION public.admin_republish_post(uuid, jsonb) IS
  'Reviewer atomic edit. Optional payload.video_edit + payload.media_order apply post_media changes via _apply_post_media_edit_core. Omitting those keys preserves prior admin republish behavior.';

REVOKE ALL ON FUNCTION public.admin_republish_post(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_republish_post(uuid, jsonb) TO authenticated;
