-- Edit media commit — local only. Do NOT apply without production approval.
--
-- Adds authorized ADD / REPLACE / REMOVE / UNCHANGED for owned post_media,
-- and folds optional video_edit (+ media_order) into owner_republish_post so
-- text/activities/images/video/order can commit in one transaction when the
-- client includes those keys on the same republish payload.
--
-- Index safety (REPLACE):
--   attached unique: (post_id, sort_order) WHERE post_id IS NOT NULL
--   unattached unique: (publish_post_id, sort_order) WHERE post_id IS NULL
-- Detach former primary to retired sort_order (>= 1000, free slot) BEFORE
-- attaching staging at sort_order 0. Never detach to sort_order 0 while
-- staging occupies unattached slot 0. Never attach staging while old is
-- still attached at sort_order 0.
--
-- Does NOT delete Bunny assets. Historical rows remain (detached, unattached).
-- Does NOT change Create attach trigger or owner_create_post.
-- Omitting video_edit / media_order preserves prior republish behavior.

-- ---------------------------------------------------------------------------
-- 1) Internal apply — SECURITY DEFINER (clients cannot UPDATE post_media)
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

  -- Concurrency: REPLACE/REMOVE must match the caller's expected attached id when provided.
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

    -- Idempotent: staging already attached as the sole primary.
    IF v_attached_id IS NOT NULL AND v_attached_id = v_staged_id THEN
      NULL; -- fall through to media_order
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

      IF v_staging.owner_user_id IS DISTINCT FROM p_actor
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
      -- No current primary: treat as ADD if staging still unattached, or
      -- idempotent success if staging is already the attached primary.
      SELECT *
      INTO v_staging
      FROM public.post_media pm
      WHERE pm.id = v_staged_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Staged media not found'
          USING ERRCODE = 'P0002';
      END IF;

      IF v_staging.owner_user_id IS DISTINCT FROM p_actor
         OR v_staging.publish_post_id IS DISTINCT FROM p_post_id
      THEN
        RAISE EXCEPTION 'Staged media not authorized for this post'
          USING ERRCODE = '42501';
      END IF;

      IF v_staging.post_id = p_post_id THEN
        NULL; -- already committed
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
      NULL; -- idempotent replace already applied
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

      IF v_staging.owner_user_id IS DISTINCT FROM p_actor
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

      -- Free unattached sort slot starting at 1000 (never collide with staging slot 0).
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

      -- 1) Detach former primary away from sort_order 0.
      UPDATE public.post_media
      SET post_id = NULL,
          sort_order = v_retired_sort
      WHERE id = v_attached_id
        AND post_id = p_post_id;

      -- 2) Attach staging as new primary at sort_order 0.
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
      NULL; -- idempotent: already no attached video
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

  -- media_order: only when explicitly provided (omit ≠ clear).
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

      -- After REMOVE, order must not retain a video entry.
      IF v_op = 'REMOVE' AND v_video_ref_count > 0 THEN
        RAISE EXCEPTION 'REMOVE media_order must not reference a video'
          USING ERRCODE = '22023';
      END IF;

      -- After ADD/REPLACE, if order includes a video it must be the new primary.
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

COMMENT ON FUNCTION public.owner_apply_post_media_edit(uuid, uuid, jsonb, jsonb, boolean) IS
  'SECURITY DEFINER helper: apply owned Edit video ADD/REPLACE/REMOVE/UNCHANGED + optional media_order. No Bunny deletes.';

REVOKE ALL ON FUNCTION public.owner_apply_post_media_edit(uuid, uuid, jsonb, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_apply_post_media_edit(uuid, uuid, jsonb, jsonb, boolean)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Standalone commit RPC (media-only; not atomic with text unless unused)
-- Prefer owner_republish_post with video_edit for complete Edit Save.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_commit_post_media_edit(
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
  v_post_row public.posts%ROWTYPE;
  v_video_edit jsonb := NULL;
  v_media_order jsonb := NULL;
  v_media_order_provided boolean := false;
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

  IF p_payload ? 'video_edit'
     AND jsonb_typeof(p_payload->'video_edit') <> 'null'
  THEN
    v_video_edit := p_payload->'video_edit';
  END IF;

  IF p_payload ? 'media_order' THEN
    v_media_order_provided := true;
    v_media_order := p_payload->'media_order';
  END IF;

  IF v_video_edit IS NULL AND NOT v_media_order_provided THEN
    RAISE EXCEPTION 'Payload requires video_edit and/or media_order'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.owner_apply_post_media_edit(
    p_post_id,
    v_actor,
    v_video_edit,
    v_media_order,
    v_media_order_provided
  );

  SELECT * INTO v_post_row FROM public.posts p WHERE p.id = p_post_id;

  post := to_jsonb(v_post_row);
  updated := true;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.owner_commit_post_media_edit(uuid, jsonb) IS
  'Owner media-only Edit commit (video_edit + optional media_order). Prefer folding into owner_republish_post for full Save atomicity.';

REVOKE ALL ON FUNCTION public.owner_commit_post_media_edit(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_commit_post_media_edit(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) owner_republish_post — same body as 20261006120000 + optional media apply
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
  v_existing_type public.post_type;
  v_existing_selected_dates jsonb;
  v_existing_is_recurring boolean;
  v_existing_recurrence_days text[];
  v_final_selected_dates jsonb;
  v_final_is_recurring boolean;
  v_final_recurrence_days text[];
  v_has_structured boolean;
  v_requested_type text;
  v_final_type public.post_type;
  v_video_edit jsonb := NULL;
  v_media_order jsonb := NULL;
  v_media_order_provided boolean := false;
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

  SELECT
    p.author_id,
    p.type,
    p.selected_dates,
    p.is_recurring,
    p.recurrence_days
  INTO
    v_author_id,
    v_existing_type,
    v_existing_selected_dates,
    v_existing_is_recurring,
    v_existing_recurrence_days
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

  -- Final schedule from payload keys when present; else existing row (omit ≠ clear).
  v_final_selected_dates := CASE
    WHEN p_payload ? 'selected_dates'
         AND jsonb_typeof(p_payload->'selected_dates') = 'array'
    THEN (
      SELECT CASE
        WHEN count(*) = 0 THEN NULL
        ELSE jsonb_agg(value)
      END
      FROM jsonb_array_elements_text(p_payload->'selected_dates') AS t(value)
    )
    ELSE v_existing_selected_dates
  END;

  v_final_is_recurring := CASE
    WHEN p_payload ? 'is_recurring'
    THEN (p_payload->>'is_recurring')::boolean
    ELSE v_existing_is_recurring
  END;

  v_final_recurrence_days := CASE
    WHEN p_payload ? 'recurrence_days'
         AND jsonb_typeof(p_payload->'recurrence_days') = 'array'
    THEN (
      SELECT CASE
        WHEN count(*) = 0 THEN NULL
        ELSE array_agg(value)
      END
      FROM jsonb_array_elements_text(p_payload->'recurrence_days') AS t(value)
    )
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
    OR COALESCE(v_final_is_recurring, false) = true
  );

  -- Optional type: omit → preserve (incl. legacy). Switch only experience ↔ hangout.
  IF NOT (p_payload ? 'type') THEN
    v_final_type := v_existing_type;
  ELSE
    v_requested_type := nullif(p_payload->>'type', '');
    IF v_requested_type IS NULL
       OR v_requested_type = v_existing_type::text
    THEN
      v_final_type := v_existing_type;
    ELSE
      IF v_existing_type::text NOT IN ('experience', 'hangout') THEN
        RAISE EXCEPTION 'Post type switching is not supported for this post type'
          USING ERRCODE = '22023';
      END IF;

      IF v_requested_type NOT IN ('experience', 'hangout') THEN
        RAISE EXCEPTION 'Invalid post type for republish'
          USING ERRCODE = '22023';
      END IF;

      IF v_requested_type = 'hangout' AND NOT v_has_structured THEN
        RAISE EXCEPTION 'Event (hangout) requires a structured schedule'
          USING ERRCODE = '22023';
      END IF;

      IF v_requested_type = 'experience' AND v_has_structured THEN
        RAISE EXCEPTION 'Post (experience) cannot have a structured schedule'
          USING ERRCODE = '22023';
      END IF;

      v_final_type := v_requested_type::public.post_type;
    END IF;
  END IF;

  UPDATE public.posts
  SET
    type = v_final_type,
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

  -- Replace activities when payload includes an activities array (including []).
  IF p_payload ? 'activities'
     AND jsonb_typeof(p_payload->'activities') = 'array'
  THEN
    DELETE FROM public.activities WHERE post_id = p_post_id;

    IF jsonb_array_length(p_payload->'activities') > 0
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
  END IF;

  -- Optional Edit media commit (same transaction). Omit keys → prior behavior.
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
    PERFORM public.owner_apply_post_media_edit(
      p_post_id,
      v_actor,
      v_video_edit,
      v_media_order,
      v_media_order_provided
    );
    SELECT * INTO v_post_row FROM public.posts p WHERE p.id = p_post_id;
  END IF;

  post := to_jsonb(v_post_row);
  updated := true;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_republish_post(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_republish_post(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.owner_republish_post(uuid, jsonb) IS
  'Atomic owner edit. Optional payload.video_edit + payload.media_order apply post_media changes in the same transaction. Omitting those keys preserves non-video Edit behavior.';
