-- Local only — list_my_conversations: add viewer_role for group inbox rows.
-- Additive field only. Preserves member_preview, inbox_hidden_at, COALESCE sort,
-- unread/mute, requests, blocking, member_count, direct profile fields, limits.
-- Do NOT use created_by for authorization; role comes from active membership m.role.

CREATE OR REPLACE FUNCTION public.list_my_conversations(
  p_limit integer DEFAULT 40
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
  v_rows jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 50);

  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at DESC, t.created_at DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      c.id AS conversation_id,
      c.kind,
      CASE
        WHEN c.kind = 'direct' AND c.direct_user_low = v_me THEN c.direct_user_high
        WHEN c.kind = 'direct' AND c.direct_user_high = v_me THEN c.direct_user_low
        ELSE NULL
      END AS other_user_id,
      pr.display_name,
      pr.username,
      pr.avatar_url,
      c.title,
      c.last_message_at,
      c.last_message_preview,
      c.last_message_sender_id,
      m.unread_count,
      (c.last_message_sender_id IS NOT NULL AND c.last_message_sender_id = v_me) AS is_last_from_me,
      c.created_at,
      COALESCE(c.last_message_at, c.created_at) AS sort_at,
      CASE
        WHEN c.kind = 'group' THEN (
          SELECT COUNT(*)::integer
          FROM public.conversation_members cm
          WHERE cm.conversation_id = c.id
            AND cm.left_at IS NULL
        )
        ELSE NULL
      END AS member_count,
      CASE
        WHEN c.kind = 'group' THEN (
          SELECT COALESCE(
            jsonb_agg(preview.row_json ORDER BY preview.ord),
            '[]'::jsonb
          )
          FROM (
            SELECT
              jsonb_build_object(
                'user_id', cm.user_id,
                'avatar_url', p.avatar_url,
                'display_name', p.display_name,
                'username', p.username,
                'joined_at', cm.joined_at
              ) AS row_json,
              ROW_NUMBER() OVER (
                ORDER BY cm.joined_at DESC NULLS LAST, cm.user_id ASC
              ) AS ord
            FROM public.conversation_members cm
            -- Live profiles only so deleted/missing users do not consume top-3 slots.
            INNER JOIN public.profiles p
              ON p.user_id = cm.user_id
              AND p.deleted_at IS NULL
            WHERE cm.conversation_id = c.id
              AND cm.left_at IS NULL
          ) preview
          WHERE preview.ord <= 3
        )
        ELSE NULL
      END AS member_preview,
      CASE
        WHEN c.kind = 'group' THEN m.role
        ELSE NULL
      END AS viewer_role,
      CASE
        WHEN c.kind <> 'direct' THEN false
        WHEN c.last_message_at IS NULL THEN false
        WHEN CASE
          WHEN c.direct_user_low = v_me THEN c.direct_user_high
          WHEN c.direct_user_high = v_me THEN c.direct_user_low
          ELSE NULL
        END IS NULL THEN false
        WHEN NOT EXISTS (
          SELECT 1
          FROM public.messages msg
          WHERE msg.conversation_id = c.id
            AND msg.sender_user_id = CASE
              WHEN c.direct_user_low = v_me THEN c.direct_user_high
              ELSE c.direct_user_low
            END
            AND msg.message_kind IN ('text', 'shared_post')
        ) THEN false
        WHEN EXISTS (
          SELECT 1
          FROM public.messages msg
          WHERE msg.conversation_id = c.id
            AND msg.sender_user_id = v_me
            AND msg.message_kind IN ('text', 'shared_post')
        ) THEN false
        WHEN public.dm_direct_access_mode(
          CASE
            WHEN c.direct_user_low = v_me THEN c.direct_user_high
            ELSE c.direct_user_low
          END,
          v_me,
          c.id
        ) = 'request' THEN true
        ELSE false
      END AS is_request,
      m.notifications_muted
    FROM public.conversation_members m
    JOIN public.conversations c ON c.id = m.conversation_id
    LEFT JOIN public.profiles pr
      ON pr.user_id = CASE
        WHEN c.kind = 'direct' AND c.direct_user_low = v_me THEN c.direct_user_high
        WHEN c.kind = 'direct' AND c.direct_user_high = v_me THEN c.direct_user_low
        ELSE NULL
      END
      AND pr.deleted_at IS NULL
    WHERE m.user_id = v_me
      AND m.left_at IS NULL
      AND m.inbox_hidden_at IS NULL
      AND NOT (
        c.kind = 'direct'
        AND public.users_are_blocked_pair(
          v_me,
          CASE
            WHEN c.direct_user_low = v_me THEN c.direct_user_high
            WHEN c.direct_user_high = v_me THEN c.direct_user_low
            ELSE NULL
          END
        )
      )
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'conversations', v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_conversations(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_conversations(integer) TO authenticated;

COMMENT ON FUNCTION public.list_my_conversations(integer) IS
  'Inbox rows; excludes viewer inbox_hidden_at; group member_preview = latest 3 joined (active); group viewer_role = m.role (admin|member), null for direct.';
