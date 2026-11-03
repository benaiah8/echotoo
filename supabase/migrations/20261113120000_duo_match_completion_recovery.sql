-- Duo mutual-match completion recovery. Local only — do not apply until approved.
--
-- Replaces only list_pair_up_candidates and complete_pair_up_match.
-- list_pair_up_candidates RETURNS jsonb, so adding duo_match_state inside the
-- payload does not change the SQL signature; CREATE OR REPLACE is enough.
--
-- Does not change express, join, leave, Discover, withdraw, comments, Open Plan,
-- or Group Up request/approval functions.

-- ---------------------------------------------------------------------------
-- list_pair_up_candidates: duo_match_state + keep actionable interests after expiry
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pair_up_candidates(
  p_source_post_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  c_max_caller_sources integer := 500;
  v_limit integer;
  v_offset integer;
  v_per_source integer;
  v_source_count integer;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('candidates', '[]'::jsonb, 'has_more', false);
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

  IF COALESCE(p_offset, 0) > 200 THEN
    RETURN jsonb_build_object('candidates', '[]'::jsonb, 'has_more', false);
  END IF;

  v_offset := GREATEST(COALESCE(p_offset, 0), 0);
  v_per_source := v_offset + v_limit + 1;

  SELECT COUNT(*)::integer
  INTO v_source_count
  FROM (
    SELECT DISTINCT o.source_post_id
    FROM public.social_opportunities o
    WHERE o.creator_id = v_me
      AND o.kind = 'pair_up'
      AND o.status = 'active'
      AND (p_source_post_id IS NULL OR o.source_post_id = p_source_post_id)
      AND (
        (
          o.discoverable_until > now()
          AND public.people_source_is_eligible(o.source_post_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.social_opportunity_interests i
          INNER JOIN public.social_opportunities other
            ON other.id = i.to_opportunity_id
           AND other.kind = 'pair_up'
           AND other.status = 'active'
           AND other.source_post_id = o.source_post_id
           AND other.creator_id <> v_me
          WHERE i.from_opportunity_id = o.id
            AND NOT EXISTS (
              SELECT 1
              FROM public.conversations c
              INNER JOIN public.messages msg
                ON msg.conversation_id = c.id
               AND msg.message_kind = 'match_context'
               AND msg.reference_type = 'pair_up_match'
               AND msg.reference_id = o.source_post_id
              WHERE c.kind = 'direct'
                AND c.direct_user_low = LEAST(v_me, other.creator_id)
                AND c.direct_user_high = GREATEST(v_me, other.creator_id)
            )
        )
      )
  ) s;

  IF v_source_count > c_max_caller_sources THEN
    RAISE EXCEPTION 'Too many active Pair Ups';
  END IF;

  IF v_source_count = 0 THEN
    RETURN jsonb_build_object('candidates', '[]'::jsonb, 'has_more', false);
  END IF;

  WITH my_opps AS (
    SELECT
      o.id,
      o.source_post_id,
      (
        o.discoverable_until > now()
        AND public.people_source_is_eligible(o.source_post_id)
      ) AS in_window
    FROM public.social_opportunities o
    WHERE o.creator_id = v_me
      AND o.kind = 'pair_up'
      AND o.status = 'active'
      AND (p_source_post_id IS NULL OR o.source_post_id = p_source_post_id)
      AND (
        (
          o.discoverable_until > now()
          AND public.people_source_is_eligible(o.source_post_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.social_opportunity_interests i
          INNER JOIN public.social_opportunities other
            ON other.id = i.to_opportunity_id
           AND other.kind = 'pair_up'
           AND other.status = 'active'
           AND other.source_post_id = o.source_post_id
           AND other.creator_id <> v_me
          WHERE i.from_opportunity_id = o.id
            AND NOT EXISTS (
              SELECT 1
              FROM public.conversations c
              INNER JOIN public.messages msg
                ON msg.conversation_id = c.id
               AND msg.message_kind = 'match_context'
               AND msg.reference_type = 'pair_up_match'
               AND msg.reference_id = o.source_post_id
              WHERE c.kind = 'direct'
                AND c.direct_user_low = LEAST(v_me, other.creator_id)
                AND c.direct_user_high = GREATEST(v_me, other.creator_id)
            )
        )
      )
  ),
  my_sources AS (
    SELECT
      source_post_id,
      bool_or(in_window) AS in_window
    FROM my_opps
    GROUP BY source_post_id
  ),
  sourced AS (
    SELECT c.id, c.source_post_id, c.creator_id, c.description,
           c.discoverable_until, c.created_at
    FROM my_sources s
    CROSS JOIN LATERAL (
      SELECT o.id, o.source_post_id, o.creator_id, o.description,
             o.discoverable_until, o.created_at
      FROM public.social_opportunities o
      INNER JOIN public.profiles pr
        ON pr.user_id = o.creator_id
       AND pr.deleted_at IS NULL
      WHERE o.source_post_id = s.source_post_id
        AND o.kind = 'pair_up'
        AND o.status = 'active'
        AND o.creator_id <> v_me
        AND NOT public.users_are_blocked_pair(v_me, o.creator_id)
        AND (
          (
            s.in_window
            AND o.discoverable_until > now()
          )
          OR EXISTS (
            SELECT 1
            FROM my_opps mo
            INNER JOIN public.social_opportunity_interests i
              ON i.from_opportunity_id = mo.id
             AND i.to_opportunity_id = o.id
            WHERE mo.source_post_id = s.source_post_id
              AND NOT EXISTS (
                SELECT 1
                FROM public.conversations c
                INNER JOIN public.messages msg
                  ON msg.conversation_id = c.id
                 AND msg.message_kind = 'match_context'
                 AND msg.reference_type = 'pair_up_match'
                 AND msg.reference_id = s.source_post_id
                WHERE c.kind = 'direct'
                  AND c.direct_user_low = LEAST(v_me, o.creator_id)
                  AND c.direct_user_high = GREATEST(v_me, o.creator_id)
              )
          )
        )
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT v_per_source
    ) c
  ),
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (
        PARTITION BY s.source_post_id
        ORDER BY s.created_at DESC, s.id DESC
      ) AS src_rn
    FROM sourced s
  ),
  mixed AS (
    SELECT *
    FROM ranked
    ORDER BY src_rn ASC, created_at DESC, id DESC
    OFFSET v_offset
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.src_rn ASC, t.created_at DESC, t.opportunity_id DESC),
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
        INNER JOIN my_opps mo
          ON mo.id = i.from_opportunity_id
         AND mo.source_post_id = m.source_post_id
        WHERE i.to_opportunity_id = m.id
      ) AS expressed_by_me,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.conversations c
          INNER JOIN public.messages msg
            ON msg.conversation_id = c.id
           AND msg.message_kind = 'match_context'
           AND msg.reference_type = 'pair_up_match'
           AND msg.reference_id = m.source_post_id
          WHERE c.kind = 'direct'
            AND c.direct_user_low = CASE WHEN v_me < m.creator_id THEN v_me ELSE m.creator_id END
            AND c.direct_user_high = CASE WHEN v_me < m.creator_id THEN m.creator_id ELSE v_me END
        ) THEN 'completed'
        WHEN EXISTS (
          SELECT 1
          FROM public.social_opportunity_interests i
          INNER JOIN my_opps mo
            ON mo.id = i.from_opportunity_id
           AND mo.source_post_id = m.source_post_id
          WHERE i.to_opportunity_id = m.id
        )
        AND EXISTS (
          SELECT 1
          FROM public.social_opportunity_interests i
          INNER JOIN my_opps mo
            ON mo.id = i.to_opportunity_id
           AND mo.source_post_id = m.source_post_id
          WHERE i.from_opportunity_id = m.id
        ) THEN 'mutual_pending'
        WHEN EXISTS (
          SELECT 1
          FROM public.social_opportunity_interests i
          INNER JOIN my_opps mo
            ON mo.id = i.from_opportunity_id
           AND mo.source_post_id = m.source_post_id
          WHERE i.to_opportunity_id = m.id
        ) THEN 'outgoing'
        ELSE 'none'
      END AS duo_match_state,
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
      m.src_rn
    FROM mixed m
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

  SELECT COALESCE(
    jsonb_agg(elem - 'src_rn' ORDER BY ordinality),
    '[]'::jsonb
  )
  INTO v_rows
  FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb))
    WITH ORDINALITY AS x(elem, ordinality);

  RETURN jsonb_build_object(
    'candidates', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer)
  TO authenticated;

COMMENT ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer) IS
  'Mixed Pair Up deck across the caller''s eligible in-window sources, plus unmatched outgoing or mutual-pending pairs after the window or source end. Adds duo_match_state (none|outgoing|mutual_pending|completed), duo_commented_by_me, and viewer_has_active_pair_up. Optional p_source_post_id scopes to one source. c_max_caller_sources=500 is a DoS guardrail.';

-- ---------------------------------------------------------------------------
-- complete_pair_up_match: already-mutual pairs skip window + source eligibility
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_pair_up_match(
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
  v_other uuid;
  v_low uuid;
  v_high uuid;
  v_conv_id uuid;
  v_created boolean := false;
  v_has_outgoing boolean := false;
  v_has_incoming boolean := false;
  v_prior_match_msg uuid;
  v_match_msg_id uuid;
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

  -- Closed or expired rows stay rejected. Window is checked after interests.
  IF v_to.kind <> 'pair_up'
     OR v_to.status <> 'active' THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF v_to.creator_id = v_me THEN
    RAISE EXCEPTION 'Cannot complete a match with yourself';
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
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not in pool';
  END IF;

  IF public.users_are_blocked_pair(v_me, v_to.creator_id) THEN
    RAISE EXCEPTION 'Cannot Pair Up with this user';
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
     OR v_from.creator_id <> v_me
     OR v_to.kind <> 'pair_up'
     OR v_to.status <> 'active'
     OR v_to.creator_id = v_me
     OR v_from.source_post_id <> v_to.source_post_id
     OR public.users_are_blocked_pair(v_me, v_to.creator_id) THEN
    RAISE EXCEPTION 'Target is not an active Pair Up';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_me
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = v_to.creator_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_from_id
      AND i.to_opportunity_id = v_to_id
  )
  INTO v_has_outgoing;

  SELECT EXISTS (
    SELECT 1
    FROM public.social_opportunity_interests i
    WHERE i.from_opportunity_id = v_to_id
      AND i.to_opportunity_id = v_from_id
  )
  INTO v_has_incoming;

  -- Already-mutual pairs may finish after source end or discoverable_until.
  -- New non-mutual completes still require the live window and source gate.
  IF v_has_outgoing AND v_has_incoming THEN
    NULL;
  ELSE
    IF v_from.discoverable_until <= now()
       OR v_to.discoverable_until <= now()
       OR NOT public.people_source_is_eligible(v_to.source_post_id) THEN
      RAISE EXCEPTION 'Target is not an active Pair Up';
    END IF;
    RAISE EXCEPTION 'Not a mutual Pair Up';
  END IF;

  v_other := v_to.creator_id;

  IF v_me < v_other THEN
    v_low := v_me;
    v_high := v_other;
  ELSE
    v_low := v_other;
    v_high := v_me;
  END IF;

  INSERT INTO public.conversations (
    kind,
    created_by,
    direct_user_low,
    direct_user_high
  )
  VALUES (
    'direct',
    v_me,
    v_low,
    v_high
  )
  ON CONFLICT (direct_user_low, direct_user_high) DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NOT NULL THEN
    v_created := true;
  ELSE
    SELECT c.id
    INTO v_conv_id
    FROM public.conversations c
    WHERE c.kind = 'direct'
      AND c.direct_user_low = v_low
      AND c.direct_user_high = v_high;

    IF v_conv_id IS NULL THEN
      RAISE EXCEPTION 'Failed to resolve direct conversation';
    END IF;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conv_id, v_me)
  ON CONFLICT (conversation_id, user_id) DO UPDATE
  SET left_at = NULL;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conv_id, v_other)
  ON CONFLICT (conversation_id, user_id) DO UPDATE
  SET left_at = NULL;

  PERFORM public.dm_grant_direct_access(v_me, v_other, 'full', 'pair_up', NULL, NULL);
  PERFORM public.dm_grant_direct_access(v_other, v_me, 'full', 'pair_up', NULL, NULL);

  SELECT m.id
  INTO v_prior_match_msg
  FROM public.messages m
  WHERE m.conversation_id = v_conv_id
    AND m.message_kind = 'match_context'
    AND m.reference_type = 'pair_up_match'
    AND m.reference_id = v_from.source_post_id
  LIMIT 1;

  PERFORM public.insert_match_context_message(
    v_conv_id,
    v_me,
    'pair_up_match',
    v_from.source_post_id,
    v_from.source_post_id,
    NULL,
    'You matched through P2P'
  );

  IF v_prior_match_msg IS NULL THEN
    SELECT m.id
    INTO v_match_msg_id
    FROM public.messages m
    WHERE m.conversation_id = v_conv_id
      AND m.message_kind = 'match_context'
      AND m.reference_type = 'pair_up_match'
      AND m.reference_id = v_from.source_post_id
    LIMIT 1;

    IF v_match_msg_id IS NOT NULL THEN
      PERFORM public.notify_duo_match_recipient(
        v_conv_id,
        v_match_msg_id,
        v_me,
        v_other
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'conversation_id', v_conv_id,
    'other_user_id', v_other,
    'source_post_id', v_from.source_post_id,
    'created', v_created
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_pair_up_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_pair_up_match(uuid) TO authenticated;

COMMENT ON FUNCTION public.complete_pair_up_match(uuid) IS
  'Mutual Pair Up: reuse direct DM, FULL grants, idempotent match_context. Already-mutual active rows may complete after discoverable_until or source end. A new match message notifies only the other member.';
