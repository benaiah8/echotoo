-- Recurring hangout 30-day expiration (Africa/Addis_Ababa).
-- Local only — do not apply until explicitly approved.
--
-- Adds posts.recurrence_ends_on, stamps/renews via BEFORE trigger, grace-backfills
-- existing recurring rows, and wires People eligibility + Discover + Home feed /
-- calendar counts to a finite inclusive window.
--
-- Does NOT replace list_pair_up_candidates or complete_pair_up_match (applied
-- duo_match_completion_recovery). Does not delete opportunities, interests,
-- matches, messages, conversations, or memberships.

-- ---------------------------------------------------------------------------
-- Column
-- ---------------------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS recurrence_ends_on date NULL;

COMMENT ON COLUMN public.posts.recurrence_ends_on IS
  'Inclusive Africa/Addis_Ababa last day of a recurring hangout series. Stamped as Addis today + 29 on recurring publish or schedule edit. NULL when not recurring.';

REVOKE INSERT (recurrence_ends_on), UPDATE (recurrence_ends_on)
  ON TABLE public.posts
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_recurrence_series_is_open(
  p_recurrence_ends_on date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT
    p_recurrence_ends_on IS NOT NULL
    AND (now() AT TIME ZONE 'Africa/Addis_Ababa')::date
        <= p_recurrence_ends_on
    AND (now() AT TIME ZONE 'Africa/Addis_Ababa')::date
        >= (p_recurrence_ends_on - 29);
$function$;

REVOKE ALL ON FUNCTION public.post_recurrence_series_is_open(date)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.post_recurrence_series_is_open(date) IS
  'Internal. True when Addis today falls in the inclusive [ends_on - 29, ends_on] window.';

CREATE OR REPLACE FUNCTION public.post_recurrence_covers_addis_day(
  p_selected_dates jsonb,
  p_created_at timestamptz,
  p_is_recurring boolean,
  p_recurrence_days text[],
  p_recurrence_ends_on date,
  p_day date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_code text;
BEGIN
  IF COALESCE(p_is_recurring, false) IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF p_day IS NULL OR p_recurrence_ends_on IS NULL THEN
    RETURN false;
  END IF;

  IF p_day < (p_recurrence_ends_on - 29) OR p_day > p_recurrence_ends_on THEN
    RETURN false;
  END IF;

  v_code := CASE EXTRACT(ISODOW FROM p_day)::int
    WHEN 1 THEN 'MO'
    WHEN 2 THEN 'TU'
    WHEN 3 THEN 'WE'
    WHEN 4 THEN 'TH'
    WHEN 5 THEN 'FR'
    WHEN 6 THEN 'SA'
    WHEN 7 THEN 'SU'
    ELSE NULL
  END;

  IF v_code IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_recurrence_days, ARRAY[]::text[])) AS rec(code)
    WHERE upper(btrim(rec.code)) = v_code
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.post_recurrence_covers_addis_day(
  jsonb, timestamptz, boolean, text[], date, date
)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.post_recurrence_covers_addis_day(
  jsonb, timestamptz, boolean, text[], date, date
) IS
  'Internal. True when an Addis civil day is a weekday hit inside the inclusive finite recurrence window [ends_on - 29, ends_on]. NULL end never covers.';

-- ---------------------------------------------------------------------------
-- Stamp / renew / clear trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.posts_stamp_recurrence_ends_on()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Addis_Ababa')::date;
  v_end date := v_today + 29;
  v_recurring boolean;
  v_has_days boolean;
  v_schedule_changed boolean;
BEGIN
  v_recurring := COALESCE(NEW.is_recurring, false) IS TRUE;
  v_has_days := EXISTS (
    SELECT 1
    FROM unnest(COALESCE(NEW.recurrence_days, ARRAY[]::text[])) AS rec(code)
    WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
  );

  IF TG_OP = 'INSERT' THEN
    IF v_recurring AND v_has_days THEN
      NEW.recurrence_ends_on := v_end;
    ELSE
      NEW.recurrence_ends_on := NULL;
    END IF;
    RETURN NEW;
  END IF;

  v_schedule_changed :=
    NEW.selected_dates IS DISTINCT FROM OLD.selected_dates
    OR NEW.is_recurring IS DISTINCT FROM OLD.is_recurring
    OR NEW.recurrence_days IS DISTINCT FROM OLD.recurrence_days;

  IF NOT v_schedule_changed THEN
    RETURN NEW;
  END IF;

  IF v_recurring AND v_has_days THEN
    NEW.recurrence_ends_on := v_end;
  ELSE
    NEW.recurrence_ends_on := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.posts_stamp_recurrence_ends_on()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.posts_stamp_recurrence_ends_on()
  TO authenticated;

DROP TRIGGER IF EXISTS posts_recurrence_ends_on_guard ON public.posts;
DROP TRIGGER IF EXISTS posts_stamp_recurrence_ends_on ON public.posts;

CREATE TRIGGER posts_stamp_recurrence_ends_on
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.posts_stamp_recurrence_ends_on();

COMMENT ON FUNCTION public.posts_stamp_recurrence_ends_on() IS
  'Stamps recurrence_ends_on to Addis today + 29 on recurring insert or when selected_dates / is_recurring / recurrence_days actually change. Clears when recurrence is off. Caption/media/status-only updates leave the end date alone.';

-- ---------------------------------------------------------------------------
-- Grace backfill (30 calendar days from rollout Addis today)
-- ---------------------------------------------------------------------------
UPDATE public.posts
SET recurrence_ends_on =
  ((now() AT TIME ZONE 'Africa/Addis_Ababa')::date + 29)
WHERE COALESCE(is_recurring, false) = true
  AND EXISTS (
    SELECT 1
    FROM unnest(COALESCE(recurrence_days, ARRAY[]::text[])) AS rec(code)
    WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
  );

-- ---------------------------------------------------------------------------
-- people_source_is_eligible
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_source_is_eligible(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.posts p
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    WHERE p.id = p_post_id
      AND p.type = 'hangout'
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND (
        auth.uid() IS NULL
        OR NOT public.users_are_blocked_pair(auth.uid(), p.author_id)
      )
      AND (
        (
          COALESCE(p.is_recurring, false) = true
          AND EXISTS (
            SELECT 1
            FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
            WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
          )
          AND public.post_recurrence_series_is_open(p.recurrence_ends_on)
        )
        OR (
          COALESCE(p.is_recurring, false) = false
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
            WHERE NULLIF(btrim(elem), '') IS NOT NULL
              AND ((btrim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
              >= (now() AT TIME ZONE 'Africa/Addis_Ababa')::date
          )
        )
      )
  );
$function$;

-- ---------------------------------------------------------------------------
-- group_up_source_is_eligible (experience branch unchanged)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_up_source_is_eligible(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.posts p
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    WHERE p.id = p_post_id
      AND p.type IN ('hangout', 'experience')
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND (
        auth.uid() IS NULL
        OR NOT public.users_are_blocked_pair(auth.uid(), p.author_id)
      )
      AND (
        p.type = 'experience'
        OR (
          COALESCE(p.is_recurring, false) = true
          AND EXISTS (
            SELECT 1
            FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
            WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
          )
          AND public.post_recurrence_series_is_open(p.recurrence_ends_on)
        )
        OR (
          COALESCE(p.is_recurring, false) = false
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
            WHERE NULLIF(btrim(elem), '') IS NOT NULL
              AND ((btrim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
              >= (now() AT TIME ZONE 'Africa/Addis_Ababa')::date
          )
        )
      )
  );
$function$;

-- ---------------------------------------------------------------------------
-- list_discover_pair_up_candidates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_discover_pair_up_candidates(
  p_limit integer DEFAULT 20,
  p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_discover boolean;
  v_limit integer;
  v_has_cursor boolean := false;
  v_cursor_b integer;
  v_cursor_t timestamptz;
  v_cursor_id uuid;
  v_cursor_raw text;
  v_cursor_json jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_empty jsonb := jsonb_build_object(
    'candidates', '[]'::jsonb,
    'has_more', false,
    'next_cursor', NULL
  );
BEGIN
  IF v_me IS NULL THEN
    RETURN v_empty;
  END IF;

  SELECT pr.p2p_discover_enabled
  INTO v_discover
  FROM public.profiles pr
  WHERE pr.user_id = v_me
    AND pr.deleted_at IS NULL;

  IF NOT FOUND OR v_discover IS NOT TRUE THEN
    RETURN v_empty;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

  IF p_cursor IS NOT NULL AND btrim(p_cursor) <> '' THEN
    BEGIN
      v_cursor_raw := replace(replace(btrim(p_cursor), '-', '+'), '_', '/');
      WHILE length(v_cursor_raw) % 4 <> 0 LOOP
        v_cursor_raw := v_cursor_raw || '=';
      END LOOP;
      v_cursor_json := convert_from(decode(v_cursor_raw, 'base64'), 'UTF8')::jsonb;
      v_cursor_b := (v_cursor_json ->> 'b')::integer;
      v_cursor_t := (v_cursor_json ->> 't')::timestamptz;
      v_cursor_id := (v_cursor_json ->> 'i')::uuid;
      IF v_cursor_b IS NULL OR v_cursor_b NOT IN (0, 1)
         OR v_cursor_t IS NULL
         OR v_cursor_id IS NULL THEN
        RETURN v_empty;
      END IF;
      v_has_cursor := true;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN v_empty;
    END;
  END IF;

  WITH inbound_creators AS (
    SELECT DISTINCT from_opp.creator_id
    FROM public.social_opportunity_interests i
    INNER JOIN public.social_opportunities from_opp
      ON from_opp.id = i.from_opportunity_id
    INNER JOIN public.social_opportunities to_opp
      ON to_opp.id = i.to_opportunity_id
    WHERE to_opp.creator_id = v_me
      AND from_opp.kind = 'pair_up'
      AND from_opp.status = 'active'
      AND from_opp.discoverable_until > now()
      AND to_opp.kind = 'pair_up'
      AND to_opp.status = 'active'
      AND to_opp.discoverable_until > now()
  ),
  eligible AS (
    SELECT
      o.id,
      o.source_post_id,
      o.creator_id,
      o.description,
      o.discoverable_until,
      o.created_at,
      CASE WHEN ic.creator_id IS NOT NULL THEN 1 ELSE 0 END AS interested
    FROM public.social_opportunities o
    INNER JOIN public.profiles pr
      ON pr.user_id = o.creator_id
     AND pr.deleted_at IS NULL
     AND pr.p2p_discover_enabled = true
    INNER JOIN public.posts p
      ON p.id = o.source_post_id
    INNER JOIN public.profiles author_profile
      ON author_profile.user_id = p.author_id
     AND author_profile.deleted_at IS NULL
    LEFT JOIN inbound_creators ic
      ON ic.creator_id = o.creator_id
    WHERE o.kind = 'pair_up'
      AND o.status = 'active'
      AND (
        o.discoverable_until > now()
        OR EXISTS (
          SELECT 1
          FROM public.social_opportunities mine
          INNER JOIN public.social_opportunity_interests i
            ON i.from_opportunity_id = mine.id
           AND i.to_opportunity_id = o.id
          WHERE mine.creator_id = v_me
            AND mine.source_post_id = o.source_post_id
            AND mine.kind = 'pair_up'
            AND mine.status = 'active'
        )
      )
      AND o.creator_id <> v_me
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.social_opportunities mine
          WHERE mine.creator_id = v_me
            AND mine.source_post_id = o.source_post_id
            AND mine.kind = 'pair_up'
            AND mine.status = 'active'
        )
        OR (
          EXISTS (
            SELECT 1
            FROM public.discover_pair_up_candidate_pins pin
            WHERE pin.viewer_id = v_me
              AND pin.to_opportunity_id = o.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.social_opportunities mine
            INNER JOIN public.social_opportunity_interests rev
              ON rev.to_opportunity_id = mine.id
             AND rev.from_opportunity_id = o.id
            WHERE mine.creator_id = v_me
              AND mine.source_post_id = o.source_post_id
              AND mine.kind = 'pair_up'
              AND mine.status = 'active'
          )
        )
      )
      AND NOT public.users_are_blocked_pair(v_me, o.creator_id)
      AND p.type = 'hangout'
      AND COALESCE(p.status, 'published') = 'published'
      AND p.visibility = 'public'
      AND COALESCE(author_profile.is_private, false) = false
      AND public.can_view_post(p.id)
      AND NOT public.users_are_blocked_pair(v_me, p.author_id)
      AND (
        EXISTS (
          SELECT 1
          FROM public.social_opportunities mine
          INNER JOIN public.social_opportunity_interests i
            ON i.from_opportunity_id = mine.id
           AND i.to_opportunity_id = o.id
          WHERE mine.creator_id = v_me
            AND mine.source_post_id = o.source_post_id
            AND mine.kind = 'pair_up'
            AND mine.status = 'active'
        )
        OR (
          (
            COALESCE(p.is_recurring, false) = true
            AND EXISTS (
              SELECT 1
              FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
              WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
            )
            AND public.post_recurrence_series_is_open(p.recurrence_ends_on)
          )
          OR (
            COALESCE(p.is_recurring, false) = false
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
              WHERE NULLIF(btrim(elem), '') IS NOT NULL
                AND ((btrim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
                  >= (now() AT TIME ZONE 'Africa/Addis_Ababa')::date
            )
          )
        )
      )
  ),
  paged AS (
    SELECT u.*
    FROM (
      (
        SELECT
          e.id,
          e.source_post_id,
          e.creator_id,
          e.description,
          e.discoverable_until,
          e.created_at,
          e.interested
        FROM eligible e
        WHERE e.interested = 1
          AND (NOT v_has_cursor OR v_cursor_b = 1)
          AND (
            NOT v_has_cursor
            OR v_cursor_b <> 1
            OR e.created_at < v_cursor_t
            OR (e.created_at = v_cursor_t AND e.id < v_cursor_id)
          )
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT (v_limit + 1)
      )
      UNION ALL
      (
        SELECT
          e.id,
          e.source_post_id,
          e.creator_id,
          e.description,
          e.discoverable_until,
          e.created_at,
          e.interested
        FROM eligible e
        WHERE e.interested = 0
          AND (
            NOT v_has_cursor
            OR v_cursor_b = 1
            OR (
              v_cursor_b = 0
              AND (
                e.created_at < v_cursor_t
                OR (e.created_at = v_cursor_t AND e.id < v_cursor_id)
              )
            )
          )
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT (v_limit + 1)
      )
    ) u
    ORDER BY u.interested DESC, u.created_at DESC, u.id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      row_to_json(t)::jsonb
      ORDER BY t.interested DESC, t.created_at DESC, t.opportunity_id DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      m.id AS opportunity_id,
      m.source_post_id,
      m.creator_id,
      m.description,
      m.discoverable_until,
      m.created_at,
      pr.id AS profile_id,
      pr.display_name,
      pr.username,
      pr.avatar_url,
      pr.profile_photos,
      pr.echo_preset,
      pr.bio,
      p.caption AS source_caption,
      p.type AS source_type,
      p.created_at AS source_created_at,
      p.selected_dates AS source_selected_dates,
      p.is_recurring AS source_is_recurring,
      p.recurrence_days AS source_recurrence_days,
      EXISTS (
        SELECT 1
        FROM public.social_opportunity_interests i
        INNER JOIN public.social_opportunities mo
          ON mo.id = i.from_opportunity_id
         AND mo.source_post_id = m.source_post_id
         AND mo.creator_id = v_me
         AND mo.kind = 'pair_up'
         AND mo.status = 'active'
        WHERE i.to_opportunity_id = m.id
      ) AS expressed_by_me,
      EXISTS (
        SELECT 1
        FROM public.conversations c
        INNER JOIN public.conversation_members mem
          ON mem.conversation_id = c.id
         AND mem.user_id = v_me
         AND mem.left_at IS NULL
        INNER JOIN public.messages msg
          ON msg.conversation_id = c.id
         AND msg.sender_user_id = v_me
         AND msg.message_kind = 'shared_post'
         AND msg.reference_type = 'post'
         AND msg.reference_id = m.source_post_id
         AND msg.reference_snapshot->>'origin' = 'duo'
        WHERE c.kind = 'direct'
          AND c.direct_user_low = CASE WHEN v_me < m.creator_id THEN v_me ELSE m.creator_id END
          AND c.direct_user_high = CASE WHEN v_me < m.creator_id THEN m.creator_id ELSE v_me END
          AND public.dm_direct_access_mode(v_me, m.creator_id, c.id) IN ('full', 'request')
      ) AS duo_commented_by_me,
      EXISTS (
        SELECT 1
        FROM public.social_opportunities mine_pool
        WHERE mine_pool.creator_id = v_me
          AND mine_pool.source_post_id = m.source_post_id
          AND mine_pool.kind = 'pair_up'
          AND mine_pool.status = 'active'
          AND mine_pool.discoverable_until > now()
      ) AS viewer_has_active_pair_up,
      m.interested
    FROM paged m
    INNER JOIN public.profiles pr
      ON pr.user_id = m.creator_id
     AND pr.deleted_at IS NULL
    INNER JOIN public.posts p
      ON p.id = m.source_post_id
  ) t;

  IF jsonb_array_length(v_rows) > v_limit THEN
    v_has_more := true;
    SELECT jsonb_agg(elem ORDER BY ordinality)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(elem, ordinality)
    WHERE ordinality <= v_limit;
  END IF;

  IF v_has_more AND jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > 0 THEN
    v_last := v_rows -> -1;
    v_next_cursor := replace(
      replace(
        rtrim(
          encode(
            convert_to(
              jsonb_build_object(
                'b', (v_last ->> 'interested')::integer,
                't', v_last ->> 'created_at',
                'i', v_last ->> 'opportunity_id'
              )::text,
              'UTF8'
            ),
            'base64'
          ),
          '='
        ),
        '+',
        '-'
      ),
      '/',
      '_'
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(elem - 'interested' ORDER BY ordinality),
    '[]'::jsonb
  )
  INTO v_rows
  FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb))
    WITH ORDINALITY AS x(elem, ordinality);

  RETURN jsonb_build_object(
    'candidates', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- withdraw_duo_pair_up_interest: keep unmatched Duo Hearts withdrawable after
-- source end or discoverable_until. Existing interest row is enough.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_duo_pair_up_interest(
  p_to_opportunity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_to public.social_opportunities%ROWTYPE;
  v_from public.social_opportunities%ROWTYPE;
  v_from_id uuid;
  v_to_id uuid;
  v_deleted integer := 0;
  v_has_outgoing boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_to_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing target opportunity';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_me
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  SELECT *
  INTO v_to
  FROM public.social_opportunities o
  WHERE o.id = p_to_opportunity_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target opportunity not found';
  END IF;

  IF v_to.kind <> 'pair_up'
     OR v_to.status <> 'active'
     OR v_to.creator_id = v_me THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_to.creator_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  SELECT *
  INTO v_from
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = v_to.source_post_id
    AND o.kind = 'pair_up'
    AND o.status = 'active'
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not in pool';
  END IF;

  v_from_id := v_from.id;
  v_to_id := v_to.id;

  SELECT EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_from_id
      AND i.to_opportunity_id = v_to_id
      AND i.discover_sourced IS FALSE
  )
  INTO v_has_outgoing;

  IF NOT v_has_outgoing THEN
    IF v_to.discoverable_until <= now()
       OR v_from.discoverable_until <= now()
       OR NOT public.people_source_is_eligible(v_to.source_post_id) THEN
      RAISE EXCEPTION 'Target is not an active Pair Up';
    END IF;
    RAISE EXCEPTION 'Not a Duo interest';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_to.creator_id) THEN
    RAISE EXCEPTION 'Cannot Pair Up with this user';
  END IF;

  PERFORM o.id
  FROM public.social_opportunities o
  WHERE o.id IN (v_from_id, v_to_id)
  ORDER BY o.id
  FOR UPDATE;

  SELECT *
  INTO v_from
  FROM public.social_opportunities o
  WHERE o.id = v_from_id;

  IF NOT FOUND
     OR v_from.kind <> 'pair_up'
     OR v_from.status <> 'active'
     OR v_from.creator_id <> v_me THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  SELECT *
  INTO v_to
  FROM public.social_opportunities o
  WHERE o.id = v_to_id;

  IF NOT FOUND
     OR v_to.kind <> 'pair_up'
     OR v_to.status <> 'active'
     OR v_to.creator_id = v_me
     OR v_from.source_post_id <> v_to.source_post_id THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_to_id
      AND i.to_opportunity_id = v_from_id
  ) THEN
    RAISE EXCEPTION 'Duo interest is matched';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_from_id
      AND i.to_opportunity_id = v_to_id
      AND i.discover_sourced IS TRUE
  ) THEN
    RAISE EXCEPTION 'Not a Duo interest';
  END IF;

  DELETE FROM public.social_opportunity_interests i
  WHERE i.from_opportunity_id = v_from_id
    AND i.to_opportunity_id = v_to_id
    AND i.discover_sourced IS FALSE;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'to_opportunity_id', v_to_id,
    'from_opportunity_id', v_from_id,
    'withdrawn', v_deleted > 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.withdraw_duo_pair_up_interest(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_duo_pair_up_interest(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.withdraw_duo_pair_up_interest(uuid) IS
  'Delete the caller outgoing Duo interest when discover_sourced is false and no reverse interest exists. Existing unmatched interests remain withdrawable after discoverable_until or source end.';

-- ---------------------------------------------------------------------------
-- withdraw_discover_pair_up_interest: keep Discover-sourced Hearts withdrawable
-- after discoverable_until when the current interest row still exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_discover_pair_up_interest(
  p_to_opportunity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_to public.social_opportunities%ROWTYPE;
  v_from public.social_opportunities%ROWTYPE;
  v_from_id uuid;
  v_to_id uuid;
  v_deleted integer := 0;
  v_has_outgoing boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_to_opportunity_id IS NULL THEN
    RAISE EXCEPTION 'Missing target opportunity';
  END IF;

  SELECT *
  INTO v_to
  FROM public.social_opportunities o
  WHERE o.id = p_to_opportunity_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target opportunity not found';
  END IF;

  IF v_to.kind <> 'pair_up' OR v_to.creator_id = v_me THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  SELECT *
  INTO v_from
  FROM public.social_opportunities o
  WHERE o.creator_id = v_me
    AND o.source_post_id = v_to.source_post_id
    AND o.kind = 'pair_up'
    AND o.status = 'active'
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not in pool';
  END IF;

  v_from_id := v_from.id;
  v_to_id := v_to.id;

  SELECT EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_from_id
      AND i.to_opportunity_id = v_to_id
      AND i.discover_sourced IS TRUE
  )
  INTO v_has_outgoing;

  IF NOT v_has_outgoing THEN
    IF v_from.discoverable_until <= now()
       OR v_to.discoverable_until <= now()
       OR v_to.status <> 'active' THEN
      RAISE EXCEPTION 'Target is not an active Pair Up';
    END IF;
    RAISE EXCEPTION 'Not a Discover interest';
  END IF;

  PERFORM o.id
  FROM public.social_opportunities o
  WHERE o.id IN (v_from_id, v_to_id)
  ORDER BY o.id
  FOR UPDATE;

  SELECT *
  INTO v_from
  FROM public.social_opportunities o
  WHERE o.id = v_from_id;

  IF NOT FOUND
     OR v_from.kind <> 'pair_up'
     OR v_from.status <> 'active'
     OR v_from.creator_id <> v_me THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  SELECT *
  INTO v_to
  FROM public.social_opportunities o
  WHERE o.id = v_to_id;

  IF NOT FOUND
     OR v_to.kind <> 'pair_up'
     OR v_to.status <> 'active'
     OR v_to.creator_id = v_me
     OR v_from.source_post_id <> v_to.source_post_id THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_to_id
      AND i.to_opportunity_id = v_from_id
  ) THEN
    RAISE EXCEPTION 'Discover interest is matched';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.discover_pair_up_candidate_pins pin
    WHERE pin.viewer_id = v_me
      AND pin.to_opportunity_id = v_to_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_from_id
      AND i.to_opportunity_id = v_to_id
      AND i.discover_sourced IS TRUE
  ) THEN
    RAISE EXCEPTION 'Not a Discover interest';
  END IF;

  DELETE FROM public.social_opportunity_interests i
  WHERE i.from_opportunity_id = v_from_id
    AND i.to_opportunity_id = v_to_id
    AND i.discover_sourced IS TRUE;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'to_opportunity_id', v_to_id,
    'from_opportunity_id', v_from_id,
    'withdrawn', v_deleted > 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.withdraw_discover_pair_up_interest(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_discover_pair_up_interest(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.withdraw_discover_pair_up_interest(uuid) IS
  'Delete the caller outgoing Discover-sourced Pair Up interest when the pin exists and no reverse interest exists. Existing unmatched Discover interests remain withdrawable after discoverable_until.';

-- ---------------------------------------------------------------------------
-- get_feed_with_related_data
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
            (
              COALESCE(p.is_recurring, false) = true
              AND public.post_recurrence_series_is_open(p.recurrence_ends_on)
              AND EXISTS (
                SELECT 1
                FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
                WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
              )
            )
            OR (
              COALESCE(p.is_recurring, false) = false
              AND COALESCE(jsonb_array_length(p.selected_dates), 0) = 0
            )
            OR (
              COALESCE(p.is_recurring, false) = false
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
                WHERE NULLIF(trim(elem), '') IS NOT NULL
                  AND ((trim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
                    >= (timezone('Africa/Addis_Ababa', now()))::date
              )
            )
          )
        )
      )
      AND (
        p_viewer_user_id IS NULL
        OR NOT public.users_are_blocked_pair(p_viewer_user_id, p.author_id)
      )
      -- V1.1: hide non-ready attached video from Home Feed for everyone (including creator).
      AND NOT public.post_has_nonready_attached_video(p.id)
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
      --    Experiences and non-recurring hangouts qualify via selected_dates (A).
      --    Recurring hangouts qualify only via post_recurrence_covers_addis_day (B).
      -- 3) Single-day mode (Today/Tomorrow spotlight) — p_occurs_on + p_occurs_tz when range inactive.
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
            (
              (
                p.type <> 'hangout'
                OR COALESCE(p.is_recurring, false) = false
              )
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS sched
                WHERE NULLIF(trim(sched), '') IS NOT NULL
                  AND (((trim(sched))::timestamptz AT TIME ZONE p_occurs_tz)::date
                       BETWEEN p_occurs_from AND p_occurs_to)
              )
            )
            OR (
              p.type = 'hangout'
              AND EXISTS (
                SELECT 1
                FROM generate_series(
                  p_occurs_from::timestamp,
                  p_occurs_to::timestamp,
                  interval '1 day'
                ) AS gs(d)
                WHERE public.post_recurrence_covers_addis_day(
                  p.selected_dates,
                  p.created_at,
                  p.is_recurring,
                  p.recurrence_days,
                  p.recurrence_ends_on,
                  gs.d::date
                )
              )
            )
          )
        )
        OR (
          (p_occurs_from IS NULL OR p_occurs_to IS NULL)
          AND p_occurs_on IS NOT NULL
          AND p_occurs_tz IS NOT NULL
          AND (
            (
              (
                p.type <> 'hangout'
                OR COALESCE(p.is_recurring, false) = false
              )
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS sched
                WHERE NULLIF(trim(sched), '') IS NOT NULL
                  AND (((trim(sched))::timestamptz AT TIME ZONE p_occurs_tz)::date = p_occurs_on)
              )
            )
            OR (
              p.type = 'hangout'
              AND public.post_recurrence_covers_addis_day(
                p.selected_dates,
                p.created_at,
                p.is_recurring,
                p.recurrence_days,
                p.recurrence_ends_on,
                p_occurs_on
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
$function$;

-- ---------------------------------------------------------------------------
-- get_home_hangout_occurrence_day_counts
-- ---------------------------------------------------------------------------
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
      p.recurrence_days,
      p.recurrence_ends_on,
      p.created_at
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
        (
          COALESCE(p.is_recurring, false) = true
          AND public.post_recurrence_series_is_open(p.recurrence_ends_on)
          AND EXISTS (
            SELECT 1
            FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
            WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
          )
        )
        OR (
          COALESCE(p.is_recurring, false) = false
          AND COALESCE(jsonb_array_length(p.selected_dates), 0) = 0
        )
        OR (
          COALESCE(p.is_recurring, false) = false
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(p.selected_dates, '[]'::jsonb)) AS elem
            WHERE NULLIF(trim(elem), '') IS NOT NULL
              AND ((trim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
                >= (timezone('Africa/Addis_Ababa', now()))::date
          )
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
      (
        COALESCE(ep.is_recurring, false) = false
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(ep.selected_dates, '[]'::jsonb)) AS sched
          WHERE NULLIF(trim(sched), '') IS NOT NULL
            AND (((trim(sched))::timestamptz AT TIME ZONE v_tz)::date = md.day)
        )
      )
      OR public.post_recurrence_covers_addis_day(
        ep.selected_dates,
        ep.created_at,
        ep.is_recurring,
        ep.recurrence_days,
        ep.recurrence_ends_on,
        md.day
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

REVOKE ALL ON FUNCTION public.list_discover_pair_up_candidates(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_discover_pair_up_candidates(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_discover_pair_up_candidates(integer, text) IS
  'Global event-P2P Discover page (hangout sources only). Finite recurring series via recurrence_ends_on. Outgoing interests stay visible after source end. Viewer Discover OFF returns empty. Keeps duo_commented_by_me and viewer_has_active_pair_up.';

COMMENT ON FUNCTION public.get_home_hangout_occurrence_day_counts(date, uuid, boolean, text) IS
  'Home calendar: daily discoverable hangout counts for one month (Addis). Recurring hits require post_recurrence_covers_addis_day within the finite series window.';

GRANT EXECUTE ON FUNCTION public.get_home_hangout_occurrence_day_counts(date, uuid, boolean, text)
  TO anon;
GRANT EXECUTE ON FUNCTION public.get_home_hangout_occurrence_day_counts(date, uuid, boolean, text)
  TO authenticated;
