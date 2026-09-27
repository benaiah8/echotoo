-- D2A: Allow validated experience ↔ hangout type switch on republish RPCs.
-- Base bodies: 20260825120100_activities_section_body.sql (owner + admin republish).
--
-- Backward compatible:
--   - omit payload `type` → preserve existing posts.type (D1 clients)
--   - present type equal to existing → preserve; no schedule consistency reject
--   - switch only experience ↔ hangout when final structured schedule matches
-- Legacy rendezvous/playbook: immutable; omit type preserves.
-- No data backfill. No social/RSVP/ratings side effects beyond existing field writes.

-- ---------------------------------------------------------------------------
-- owner_republish_post — atomic owner edit
-- Optional validated type: experience ↔ hangout only (omit type → preserve)
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

  post := to_jsonb(v_post_row);
  updated := true;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_republish_post(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_republish_post(uuid, jsonb) TO authenticated;


-- ---------------------------------------------------------------------------
-- admin_republish_post — reviewer edit
-- Same optional validated experience ↔ hangout type switch as owner.
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
declare
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
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.report_reviewers rr
    where rr.user_id = v_actor_user_id
  ) then
    raise exception 'Admin permission required'
      using errcode = '42501';
  end if;

  if p_post_id is null then
    raise exception 'Post id is required'
      using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload must be a JSON object'
      using errcode = '22023';
  end if;

  select
    p.author_id,
    p.type,
    p.selected_dates,
    p.is_recurring,
    p.recurrence_days,
    left(coalesce(p.caption, ''), 240)
  into
    v_author_id,
    v_existing_type,
    v_existing_selected_dates,
    v_existing_is_recurring,
    v_existing_recurrence_days,
    v_caption_preview
  from public.posts p
  where p.id = p_post_id
  for update;

  if v_author_id is null then
    raise exception 'Post not found'
      using errcode = 'P0002';
  end if;

  -- Final schedule from payload keys when present; else existing row (omit ≠ clear).
  -- Mirrors this RPC's UPDATE CASE semantics for selected_dates / recurrence / recurring.
  v_final_selected_dates := case
    when p_payload ? 'selected_dates' then
      case
        when jsonb_typeof(p_payload->'selected_dates') = 'array' then p_payload->'selected_dates'
        when jsonb_typeof(p_payload->'selected_dates') = 'null' then null
        when nullif(p_payload->>'selected_dates', '') is not null then jsonb_build_array(p_payload->>'selected_dates')
        else null
      end
    else v_existing_selected_dates
  end;

  v_final_is_recurring := case
    when p_payload ? 'is_recurring' then
      coalesce((p_payload->>'is_recurring')::boolean, false)
    else v_existing_is_recurring
  end;

  v_final_recurrence_days := case
    when p_payload ? 'recurrence_days' then
      case
        when jsonb_typeof(p_payload->'recurrence_days') = 'array' then
          nullif(
            array(select jsonb_array_elements_text(p_payload->'recurrence_days')),
            '{}'::text[]
          )
        when jsonb_typeof(p_payload->'recurrence_days') = 'null' then null
        when nullif(p_payload->>'recurrence_days', '') is not null then array[p_payload->>'recurrence_days']
        else null
      end
    else v_existing_recurrence_days
  end;

  v_has_structured := (
    (
      v_final_selected_dates is not null
      and jsonb_typeof(v_final_selected_dates) = 'array'
      and jsonb_array_length(v_final_selected_dates) > 0
    )
    or (
      v_final_recurrence_days is not null
      and cardinality(v_final_recurrence_days) > 0
    )
    or coalesce(v_final_is_recurring, false) = true
  );

  -- Optional type: omit / equal → preserve. Switch only experience ↔ hangout + schedule.
  if not (p_payload ? 'type') then
    v_final_type := v_existing_type;
  else
    v_payload_type := nullif(p_payload->>'type', '');
    if v_payload_type is null
       or v_payload_type = v_existing_type::text
    then
      v_final_type := v_existing_type;
    else
      if v_existing_type::text not in ('experience', 'hangout') then
        raise exception 'Post type switching is not supported for this post type'
          using errcode = '22023';
      end if;

      if v_payload_type not in ('experience', 'hangout') then
        raise exception 'Invalid post type for republish'
          using errcode = '22023';
      end if;

      if v_payload_type = 'hangout' and not v_has_structured then
        raise exception 'Event (hangout) requires a structured schedule'
          using errcode = '22023';
      end if;

      if v_payload_type = 'experience' and v_has_structured then
        raise exception 'Post (experience) cannot have a structured schedule'
          using errcode = '22023';
      end if;

      v_final_type := v_payload_type::public.post_type;
    end if;
  end if;

  insert into public.admin_post_action_audit (
    action,
    actor_user_id,
    target_post_id,
    old_author_id,
    new_author_id,
    metadata
  )
  values (
    'edit_post',
    v_actor_user_id,
    p_post_id,
    v_author_id,
    null,
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

  update public.posts p
  set
    type = v_final_type,

    caption = case
      when p_payload ? 'caption' then p_payload->>'caption'
      else p.caption
    end,

    visibility = case
      when p_payload ? 'visibility' then p_payload->>'visibility'
      else p.visibility
    end,

    tags = case
      when p_payload ? 'tags' then
        case
          when jsonb_typeof(p_payload->'tags') = 'array' then
            nullif(
              array(select jsonb_array_elements_text(p_payload->'tags')),
              '{}'::text[]
            )
          when jsonb_typeof(p_payload->'tags') = 'null' then null
          when nullif(p_payload->>'tags', '') is not null then array[p_payload->>'tags']
          else null
        end
      else p.tags
    end,

    selected_dates = case
      when p_payload ? 'selected_dates' then
        case
          when jsonb_typeof(p_payload->'selected_dates') = 'array' then p_payload->'selected_dates'
          when jsonb_typeof(p_payload->'selected_dates') = 'null' then null
          when nullif(p_payload->>'selected_dates', '') is not null then jsonb_build_array(p_payload->>'selected_dates')
          else null
        end
      else p.selected_dates
    end,

    rsvp_capacity = case
      when p_payload ? 'rsvp_capacity' then
        nullif(p_payload->>'rsvp_capacity', '')::integer
      else p.rsvp_capacity
    end,

    is_recurring = case
      when p_payload ? 'is_recurring' then
        coalesce((p_payload->>'is_recurring')::boolean, false)
      else p.is_recurring
    end,

    repeat_weekly = case
      when p_payload ? 'repeat_weekly' then
        coalesce((p_payload->>'repeat_weekly')::boolean, false)
      else p.repeat_weekly
    end,

    recurrence_days = case
      when p_payload ? 'recurrence_days' then
        case
          when jsonb_typeof(p_payload->'recurrence_days') = 'array' then
            nullif(
              array(select jsonb_array_elements_text(p_payload->'recurrence_days')),
              '{}'::text[]
            )
          when jsonb_typeof(p_payload->'recurrence_days') = 'null' then null
          when nullif(p_payload->>'recurrence_days', '') is not null then array[p_payload->>'recurrence_days']
          else null
        end
      else p.recurrence_days
    end,

    rating_enabled = case
      when p_payload ? 'rating_enabled' then
        coalesce((p_payload->>'rating_enabled')::boolean, false)
      else p.rating_enabled
    end,

    duration = case
      when p_payload ? 'duration' then nullif(p_payload->>'duration', '')
      else p.duration
    end,

    start_at = case
      when p_payload ? 'start_at' then
        nullif(p_payload->>'start_at', '')::timestamptz
      else p.start_at
    end,

    hero_images = case
      when p_payload ? 'hero_images' then
        case
          when jsonb_typeof(p_payload->'hero_images') = 'array' then
            coalesce(
              array(select jsonb_array_elements_text(p_payload->'hero_images')),
              '{}'::text[]
            )
          when jsonb_typeof(p_payload->'hero_images') = 'null' then '{}'::text[]
          when nullif(p_payload->>'hero_images', '') is not null then array[p_payload->>'hero_images']
          else '{}'::text[]
        end
      else p.hero_images
    end
  where p.id = p_post_id;

  if p_payload ? 'activities' then
    if jsonb_typeof(p_payload->'activities') <> 'array' then
      raise exception 'activities must be a JSON array'
        using errcode = '22023';
    end if;

    delete from public.activities a
    where a.post_id = p_post_id;

    insert into public.activities (
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
    select
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
      case
        when item ? 'additional_info'
         and jsonb_typeof(item->'additional_info') in ('array', 'object')
        then item->'additional_info'
        else '[]'::jsonb
      end,
      case
        when item ? 'tags' and jsonb_typeof(item->'tags') = 'array' then
          coalesce(array(select jsonb_array_elements_text(item->'tags')), '{}'::text[])
        when item ? 'tags' and jsonb_typeof(item->'tags') = 'null' then
          '{}'::text[]
        when item ? 'tags' and nullif(item->>'tags', '') is not null then
          array[item->>'tags']
        else '{}'::text[]
      end,
      case
        when item ? 'images' and jsonb_typeof(item->'images') = 'array' then
          coalesce(array(select jsonb_array_elements_text(item->'images')), '{}'::text[])
        when item ? 'images' and jsonb_typeof(item->'images') = 'null' then
          '{}'::text[]
        when item ? 'images' and nullif(item->>'images', '') is not null then
          array[item->>'images']
        else '{}'::text[]
      end,
      nullif(item->>'section_body', '')
    from jsonb_array_elements(p_payload->'activities') with ordinality as rows(item, ordinality);
  end if;

  return query
  select
    p_post_id,
    v_author_id,
    true;
end;
$function$;


REVOKE ALL ON FUNCTION public.admin_republish_post(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_republish_post(uuid, jsonb) TO authenticated;
