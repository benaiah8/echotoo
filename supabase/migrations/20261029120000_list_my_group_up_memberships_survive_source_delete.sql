-- list_my_group_up_memberships: conversation-first so established Groups
-- remain in Yours after source post CASCADE-deletes social_opportunities.
--
-- Does NOT change FKs, cascades, discovery RPCs, or conversation tables.
-- LOCAL ONLY — do not apply until explicitly approved.

-- ---------------------------------------------------------------------------
-- list_my_group_up_memberships (conversation-first)
-- Signature + grants preserved.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_group_up_memberships(
  p_limit integer DEFAULT 20,
  p_cursor text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_limit integer;
  v_has_cursor boolean := false;
  v_cursor_c timestamptz;
  v_cursor_id uuid;
  v_cursor_raw text;
  v_cursor_json jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_empty jsonb := jsonb_build_object(
    'memberships', '[]'::jsonb,
    'has_more', false,
    'next_cursor', NULL
  );
BEGIN
  IF v_me IS NULL THEN
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
      v_cursor_c := (v_cursor_json ->> 'c')::timestamptz;
      v_cursor_id := (v_cursor_json ->> 'i')::uuid;
      IF v_cursor_c IS NULL OR v_cursor_id IS NULL THEN
        RETURN v_empty;
      END IF;
      v_has_cursor := true;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN v_empty;
    END;
  END IF;

  WITH my_groups AS (
    -- Conversation-first: active group membership, not dissolved.
    SELECT
      cm.conversation_id,
      cm.joined_at,
      cm.role AS member_role,
      c.title AS group_title,
      c.description AS group_description,
      c.created_by,
      c.created_at AS conversation_created_at
    FROM public.conversation_members cm
    INNER JOIN public.conversations c
      ON c.id = cm.conversation_id
     AND c.kind = 'group'
     AND c.dissolved_at IS NULL
    WHERE cm.user_id = v_me
      AND cm.left_at IS NULL
  ),
  with_opportunity AS (
    SELECT
      g.conversation_id,
      g.joined_at,
      g.member_role,
      g.group_title,
      g.group_description,
      g.created_by,
      g.conversation_created_at,
      (
        SELECT o.id
        FROM public.social_opportunities o
        WHERE o.kind = 'group_up'
          AND o.conversation_id = g.conversation_id
          AND o.status = 'active'
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 1
      ) AS active_opp_id,
      (
        SELECT o.id
        FROM public.social_opportunities o
        WHERE o.kind = 'group_up'
          AND o.conversation_id = g.conversation_id
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 1
      ) AS hist_opp_id
    FROM my_groups g
  ),
  resolved AS (
    SELECT
      w.conversation_id,
      w.joined_at,
      w.member_role,
      w.group_title,
      w.group_description,
      w.created_by,
      w.conversation_created_at,
      COALESCE(w.active_opp_id, w.hist_opp_id) AS opportunity_id
    FROM with_opportunity w
  ),
  enriched AS (
    SELECT
      r.conversation_id,
      r.joined_at,
      r.group_title,
      r.group_description,
      o.id AS opportunity_id,
      o.source_post_id,
      o.occurs_at,
      o.occurs_time_explicit,
      o.discoverable_until,
      COALESCE(o.created_at, r.conversation_created_at) AS created_at,
      p.caption AS source_caption,
      p.type AS source_type,
      p.selected_dates AS source_selected_dates,
      p.recurrence_days AS source_recurrence_days,
      p.is_recurring AS source_is_recurring,
      COALESCE(o.creator_id, r.created_by) AS organizer_user_id,
      pr.display_name AS organizer_display_name,
      pr.username AS organizer_username,
      pr.avatar_url AS organizer_avatar_url,
      pr.echo_preset AS organizer_echo_preset,
      public._count_active_members(r.conversation_id) AS member_count,
      CASE
        WHEN o.id IS NOT NULL AND o.creator_id = v_me THEN 'owner'
        WHEN o.id IS NULL
             AND (
               r.member_role = 'admin'
               OR r.created_by = v_me
             )
        THEN 'owner'
        ELSE 'member'
      END AS viewer_state,
      -- Source context requires both opportunity and live post row.
      (o.id IS NULL OR p.id IS NULL) AS source_unavailable
    FROM resolved r
    LEFT JOIN public.social_opportunities o
      ON o.id = r.opportunity_id
    LEFT JOIN public.posts p
      ON p.id = o.source_post_id
    LEFT JOIN public.profiles pr
      ON pr.user_id = COALESCE(o.creator_id, r.created_by)
     AND pr.deleted_at IS NULL
  ),
  paged AS (
    SELECT e.*
    FROM enriched e
    WHERE (
      NOT v_has_cursor
      OR e.joined_at < v_cursor_c
      OR (
        e.joined_at = v_cursor_c
        AND e.conversation_id < v_cursor_id
      )
    )
    ORDER BY e.joined_at DESC, e.conversation_id DESC
    LIMIT (v_limit + 1)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'opportunity_id', t.opportunity_id,
        'conversation_id', t.conversation_id,
        'source_post_id', t.source_post_id,
        'group_title', t.group_title,
        'group_description', t.group_description,
        'occurs_at', t.occurs_at,
        'occurs_time_explicit', t.occurs_time_explicit,
        'discoverable_until', t.discoverable_until,
        'created_at', t.created_at,
        'source_type', t.source_type,
        'source_caption', t.source_caption,
        'source_selected_dates', t.source_selected_dates,
        'source_recurrence_days', t.source_recurrence_days,
        'source_is_recurring', t.source_is_recurring,
        'organizer_user_id', t.organizer_user_id,
        'organizer_display_name', t.organizer_display_name,
        'organizer_username', t.organizer_username,
        'organizer_avatar_url', t.organizer_avatar_url,
        'organizer_echo_preset', t.organizer_echo_preset,
        'member_count', t.member_count,
        'viewer_state', t.viewer_state,
        'request_id', NULL,
        'joined_at', t.joined_at,
        'source_unavailable', t.source_unavailable
      )
      ORDER BY t.joined_at DESC, t.conversation_id DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM paged t;

  IF jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit THEN
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
                'c', v_last ->> 'joined_at',
                'i', v_last ->> 'conversation_id'
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

  RETURN jsonb_build_object(
    'memberships', COALESCE(v_rows, '[]'::jsonb),
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_group_up_memberships(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_group_up_memberships(integer, text)
  TO authenticated;

COMMENT ON FUNCTION public.list_my_group_up_memberships(integer, text) IS
  'Persistent Yours Host|Member. Conversation-first: survives source post CASCADE. source_unavailable when opportunity/post absent. Keyset on joined_at/conversation_id.';

-- ---------------------------------------------------------------------------
-- Rollback plan (do NOT run unless reverting):
-- Restore prior opportunity-required definition from
-- supabase/migrations/20260921120000_group_up_occurs_time_explicit.sql
-- (CREATE OR REPLACE FUNCTION public.list_my_group_up_memberships …),
-- or pg_get_functiondef from production backup taken before apply.
-- Keep REVOKE/GRANT as above.
--
-- DO NOT APPLY THIS MIGRATION until explicitly approved.
-- ---------------------------------------------------------------------------

-- Verification examples (read-only after apply):
-- SELECT public.list_my_group_up_memberships(20, NULL);
-- Expect surviving groups with source_unavailable=true when posts deleted.
-- Expect live-source rows with source_unavailable=false and prior fields.
