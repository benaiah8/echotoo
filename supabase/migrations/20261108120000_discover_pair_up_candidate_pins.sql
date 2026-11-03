-- Discover Heart R1 — reversible one-way interest.
-- LOCAL FILE ONLY. Do NOT apply without explicit production approval.
--
-- Baseline Discover list body is the comment-status function in
-- 20261107120000_duo_comment_status_and_lookup.sql.
-- connect_discover_pair_up baseline is 20260831120000_connect_discover_pair_up.sql.
--
-- Does not replace join_pair_up, leave_pair_up, express_pair_up_interest,
-- complete_pair_up_match, or list_pair_up_candidates.
-- A Duo Heart still does not insert a Discover pin.
-- Withdrawal deletes only the outgoing interest row. The pin and the
-- viewer's Pair Up pool row stay.

-- ---------------------------------------------------------------------------
-- Pin
-- ---------------------------------------------------------------------------
CREATE TABLE public.discover_pair_up_candidate_pins (
  viewer_id uuid NOT NULL
    REFERENCES public.profiles (user_id)
    ON DELETE CASCADE,
  to_opportunity_id uuid NOT NULL
    REFERENCES public.social_opportunities (id)
    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_id, to_opportunity_id)
);

ALTER TABLE public.discover_pair_up_candidate_pins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.discover_pair_up_candidate_pins
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.discover_pair_up_candidate_pins IS
  'Discover-only keep-visible pin for one viewer and one target Pair Up opportunity. Inserted only by connect_discover_pair_up. Not a visibility bypass. Withdrawal does not delete the pin.';

-- ---------------------------------------------------------------------------
-- connect_discover_pair_up
-- Same validation, join, and express path. One pin insert after express.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.connect_discover_pair_up(
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
  v_target_creator uuid;
  v_source_post_id uuid;
  v_viewer_discover boolean;
  v_target_discover boolean;
  v_join jsonb;
  v_express jsonb;
  v_opportunity jsonb;
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

  IF v_to.kind <> 'pair_up'
     OR v_to.status <> 'active'
     OR v_to.discoverable_until <= now() THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF v_to.creator_id = v_me THEN
    RAISE EXCEPTION 'Cannot connect with yourself';
  END IF;

  v_target_creator := v_to.creator_id;
  v_source_post_id := v_to.source_post_id;

  PERFORM pr.user_id
  FROM public.profiles pr
  WHERE pr.user_id IN (v_me, v_target_creator)
  ORDER BY pr.user_id
  FOR UPDATE;

  SELECT pr.p2p_discover_enabled
  INTO v_viewer_discover
  FROM public.profiles pr
  WHERE pr.user_id = v_me
    AND pr.deleted_at IS NULL;

  IF NOT FOUND OR v_viewer_discover IS NOT TRUE THEN
    RAISE EXCEPTION 'Discover is not enabled';
  END IF;

  SELECT pr.p2p_discover_enabled
  INTO v_target_discover
  FROM public.profiles pr
  WHERE pr.user_id = v_target_creator
    AND pr.deleted_at IS NULL;

  IF NOT FOUND OR v_target_discover IS NOT TRUE THEN
    RAISE EXCEPTION 'Target is not available in Discover';
  END IF;

  IF NOT public.people_source_is_eligible(v_source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_target_creator) THEN
    RAISE EXCEPTION 'Cannot Pair Up with this user';
  END IF;

  v_join := public.join_pair_up(v_source_post_id, NULL);
  v_opportunity := v_join -> 'opportunity';

  IF v_opportunity IS NULL OR jsonb_typeof(v_opportunity) = 'null' THEN
    RAISE EXCEPTION 'Join failed';
  END IF;

  v_express := public.express_pair_up_interest(p_to_opportunity_id);

  INSERT INTO public.discover_pair_up_candidate_pins (
    viewer_id,
    to_opportunity_id
  )
  VALUES (v_me, p_to_opportunity_id)
  ON CONFLICT (viewer_id, to_opportunity_id) DO NOTHING;

  RETURN jsonb_build_object(
    'opportunity', v_opportunity,
    'from_opportunity_id', v_express ->> 'from_opportunity_id',
    'to_opportunity_id', v_express ->> 'to_opportunity_id',
    'matched', COALESCE((v_express ->> 'matched')::boolean, false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.connect_discover_pair_up(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_discover_pair_up(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.connect_discover_pair_up(uuid) IS
  'Atomic Discover Connect: validate Discover prefs + eligibility, join_pair_up(source, NULL), express_pair_up_interest(target), then insert one discover_pair_up_candidate_pins row. Same transaction. Does not create DM/push. Does not change My Plans RPCs.';


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
      AND o.discoverable_until > now()
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
        (
          COALESCE(p.is_recurring, false) = true
          AND EXISTS (
            SELECT 1
            FROM unnest(COALESCE(p.recurrence_days, ARRAY[]::text[])) AS rec(code)
            WHERE upper(btrim(rec.code)) IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
          )
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

REVOKE ALL ON FUNCTION public.list_discover_pair_up_candidates(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_discover_pair_up_candidates(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_discover_pair_up_candidates(integer, text) IS
  'Global event-P2P Discover page (hangout sources only). Viewer Discover OFF returns empty. Hides sources where the viewer already has an active Pair Up, except a Discover pin for that candidate while no reverse interest exists. Hidden inbound ranking uses current in-window active pair_up interests only and is never returned. Opaque next_cursor is keyset (bucket, created_at, id). Keeps duo_commented_by_me and viewer_has_active_pair_up. Does not change My Plans eligibility, ordering, or pool membership.';


-- ---------------------------------------------------------------------------
-- withdraw_discover_pair_up_interest
-- Locks both opportunity ids ascending, the same order as express and complete.
-- A reverse interest raises and deletes nothing. A missing Discover pin
-- raises and deletes nothing. Otherwise only the outgoing interest row
-- is deleted.
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
    AND o.discoverable_until > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not in pool';
  END IF;

  v_from_id := v_from.id;
  v_to_id := v_to.id;

  PERFORM o.id
  FROM public.social_opportunities o
  WHERE o.id IN (v_from_id, v_to_id)
  ORDER BY o.id
  FOR UPDATE;

  SELECT *
  INTO v_from
  FROM public.social_opportunities o
  WHERE o.id = v_from_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  SELECT *
  INTO v_to
  FROM public.social_opportunities o
  WHERE o.id = v_to_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF v_from.kind <> 'pair_up'
     OR v_from.status <> 'active'
     OR v_from.discoverable_until <= now()
     OR v_from.creator_id <> v_me
     OR v_to.kind <> 'pair_up'
     OR v_to.status <> 'active'
     OR v_to.discoverable_until <= now()
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
  ) THEN
    RAISE EXCEPTION 'Not a Discover interest';
  END IF;

  DELETE FROM public.social_opportunity_interests i
  WHERE i.from_opportunity_id = v_from_id
    AND i.to_opportunity_id = v_to_id;

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
  'Delete the caller outgoing Pair Up interest for one target opportunity when that caller has a Discover pin and no reverse interest exists. Locks both opportunity ids ascending. Does not delete the Discover pin, the pool row, conversations, or grants.';
