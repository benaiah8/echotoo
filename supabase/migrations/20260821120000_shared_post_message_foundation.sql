-- Share S0: typed shared_post message foundation (local until explicitly applied).
-- Adds message_kind / reference_* columns, private can_view_post_as,
-- list_messages typed fields, and send_shared_post_message.
-- Does NOT alter can_view_post or send_message.

-- ---------------------------------------------------------------------------
-- 1) Typed message columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_kind text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS reference_type text NULL,
  ADD COLUMN IF NOT EXISTS reference_id uuid NULL,
  ADD COLUMN IF NOT EXISTS reference_snapshot jsonb NULL;

COMMENT ON COLUMN public.messages.message_kind IS
  'text | shared_post. Future system kinds are a separate migration.';
COMMENT ON COLUMN public.messages.reference_type IS
  'For shared_post: post. Null for text.';
COMMENT ON COLUMN public.messages.reference_id IS
  'Stable source id (posts.id for shared_post).';
COMMENT ON COLUMN public.messages.reference_snapshot IS
  'Server-built structural fallback only, e.g. {v:1, post_type}. No UGC copy.';

-- Replace nonempty-body check with kind-aware rule.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_body_nonempty_check;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_kind_shape_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_kind_shape_check CHECK (
    (
      message_kind = 'text'
      AND reference_type IS NULL
      AND reference_id IS NULL
      AND reference_snapshot IS NULL
      AND length(btrim(body)) > 0
    )
    OR (
      message_kind = 'shared_post'
      AND reference_type = 'post'
      AND reference_id IS NOT NULL
      AND reference_snapshot IS NOT NULL
      AND jsonb_typeof(reference_snapshot) = 'object'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Private can_view_post_as — copy of can_view_post with explicit viewer.
--    can_view_post is intentionally NOT redefined or wrapped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_post_as(
  p_viewer_user_id uuid,
  p_post_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_viewer_user_id uuid := p_viewer_user_id;
  v_viewer_profile_id uuid;
  v_post record;
  v_author_profile record;
  v_viewer_follows_author boolean := false;
  v_author_follows_viewer boolean := false;
BEGIN
  SELECT p.*
  INTO v_post
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT pr.*
  INTO v_author_profile
  FROM public.profiles pr
  WHERE pr.user_id = v_post.author_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_author_profile.deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Authors can see their own posts, including drafts.
  IF v_viewer_user_id IS NOT NULL AND v_post.author_id = v_viewer_user_id THEN
    RETURN true;
  END IF;

  -- Non-authors should not see drafts/unpublished posts.
  IF coalesce(v_post.status::text, 'published') <> 'published' THEN
    RETURN false;
  END IF;

  IF v_viewer_user_id IS NOT NULL THEN
    SELECT pr.id
    INTO v_viewer_profile_id
    FROM public.profiles pr
    WHERE pr.user_id = v_viewer_user_id
    LIMIT 1;
  END IF;

  -- Block checks only apply when we know the viewer profile.
  IF v_viewer_profile_id IS NOT NULL THEN
    IF public.users_are_blocked_pair(v_viewer_profile_id, v_author_profile.id) THEN
      RETURN false;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = v_viewer_profile_id
        AND f.following_id = v_author_profile.id
        AND f.status = 'approved'
    )
    INTO v_viewer_follows_author;

    SELECT EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = v_author_profile.id
        AND f.following_id = v_viewer_profile_id
        AND f.status = 'approved'
    )
    INTO v_author_follows_viewer;
  END IF;

  -- Private authors require approved follower access unless this is the author.
  IF coalesce(v_author_profile.is_private, false) = true
     AND v_viewer_follows_author = false THEN
    RETURN false;
  END IF;

  -- Public/anonymous/null visibility is visible after profile privacy checks.
  IF v_post.visibility IS NULL
     OR v_post.visibility::text IN ('public', 'anonymous') THEN
    RETURN true;
  END IF;

  -- Followers visibility: viewer follows author.
  IF v_post.visibility::text = 'followers' THEN
    RETURN v_viewer_follows_author;
  END IF;

  -- Friends visibility: both users follow each other.
  IF v_post.visibility::text = 'friends' THEN
    RETURN v_viewer_follows_author AND v_author_follows_viewer;
  END IF;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.can_view_post_as(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.can_view_post_as(uuid, uuid) IS
  'Share S0 private helper: can_view_post semantics for an explicit viewer. Not client-callable.';

-- ---------------------------------------------------------------------------
-- 3) list_messages — same signature/keyset; additive typed fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_messages(
  p_conversation_id uuid,
  p_limit integer DEFAULT 20,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
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
  v_fetch integer;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor jsonb := NULL;
  v_oldest jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
  END IF;

  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid cursor: created_at and id are both required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = v_me
      AND m.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_fetch := v_limit + 1;

  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC, t.id DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      m.id,
      m.conversation_id,
      m.sender_user_id,
      m.body,
      m.client_message_id,
      m.created_at,
      m.message_kind,
      m.reference_type,
      m.reference_id,
      m.reference_snapshot
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND (
        p_before_created_at IS NULL
        OR m.created_at < p_before_created_at
        OR (
          m.created_at = p_before_created_at
          AND m.id < p_before_id
        )
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_fetch
  ) t;

  IF jsonb_array_length(v_rows) > v_limit THEN
    v_has_more := true;
    v_rows := (
      SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(elem, ord)
      WHERE ord <= v_limit
    );
  END IF;

  IF jsonb_array_length(v_rows) > 0 THEN
    v_oldest := v_rows -> (jsonb_array_length(v_rows) - 1);
    v_next_cursor := jsonb_build_object(
      'created_at', v_oldest ->> 'created_at',
      'id', v_oldest ->> 'id'
    );
  END IF;

  IF NOT v_has_more THEN
    v_next_cursor := NULL;
  END IF;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'messages', v_rows,
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_messages(uuid, integer, timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_messages(uuid, integer, timestamptz, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.list_messages(uuid, integer, timestamptz, uuid) IS
  'Newest-first keyset page with typed message fields (Share S0). Same cursor/has_more contract.';

-- ---------------------------------------------------------------------------
-- 4) send_shared_post_message
--    After conversation auth, short-circuit on existing
--    (conversation_id, sender, client_message_id) before mutable post visibility.
--    ON CONFLICT remains for concurrent new-send races. send_message untouched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_shared_post_message(
  p_conversation_id uuid,
  p_post_id uuid,
  p_note text,
  p_client_message_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_note text;
  v_preview text;
  v_kind text;
  v_low uuid;
  v_high uuid;
  v_other uuid;
  v_group_name text;
  v_post_type text;
  v_snapshot jsonb;
  v_msg public.messages%ROWTYPE;
  v_inserted boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL
     OR p_post_id IS NULL
     OR p_client_message_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation, post, or client_message_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = v_me
      AND m.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  SELECT c.kind, c.direct_user_low, c.direct_user_high, c.title
  INTO v_kind, v_low, v_high, v_group_name
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_kind = 'direct' THEN
    IF v_low IS NULL OR v_high IS NULL THEN
      RAISE EXCEPTION 'Invalid direct conversation';
    END IF;

    IF v_me = v_low THEN
      v_other := v_high;
    ELSIF v_me = v_high THEN
      v_other := v_low;
    ELSE
      RAISE EXCEPTION 'Not a participant of this direct conversation';
    END IF;

    IF public.users_are_blocked_pair(v_me, v_other) THEN
      RAISE EXCEPTION 'Cannot message this user';
    END IF;
  END IF;

  -- Idempotent short-circuit: after conversation auth only.
  -- Mutable post visibility is not rechecked for an already-stored message.
  SELECT m.*
  INTO v_msg
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_user_id = v_me
    AND m.client_message_id = p_client_message_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'message', jsonb_build_object(
        'id', v_msg.id,
        'conversation_id', v_msg.conversation_id,
        'sender_user_id', v_msg.sender_user_id,
        'body', v_msg.body,
        'client_message_id', v_msg.client_message_id,
        'created_at', v_msg.created_at,
        'message_kind', v_msg.message_kind,
        'reference_type', v_msg.reference_type,
        'reference_id', v_msg.reference_id,
        'reference_snapshot', v_msg.reference_snapshot
      ),
      'created', false
    );
  END IF;

  -- New-send path only below.
  v_note := btrim(COALESCE(p_note, ''));
  IF char_length(v_note) > 200 THEN
    RAISE EXCEPTION 'Note is too long';
  END IF;

  -- Every active member must be allowed to view the referenced post.
  IF EXISTS (
    SELECT 1
    FROM public.conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.left_at IS NULL
      AND NOT public.can_view_post_as(m.user_id, p_post_id)
  ) THEN
    RAISE EXCEPTION 'This post can''t be shared with everyone in this conversation';
  END IF;

  SELECT p.type::text
  INTO v_post_type
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF v_post_type IS NULL THEN
    RAISE EXCEPTION 'This post can''t be shared with everyone in this conversation';
  END IF;

  IF v_post_type NOT IN ('hangout', 'experience') THEN
    RAISE EXCEPTION 'This post can''t be shared with everyone in this conversation';
  END IF;

  v_snapshot := jsonb_build_object(
    'v', 1,
    'post_type', v_post_type
  );

  INSERT INTO public.messages (
    conversation_id,
    sender_user_id,
    body,
    client_message_id,
    message_kind,
    reference_type,
    reference_id,
    reference_snapshot
  )
  VALUES (
    p_conversation_id,
    v_me,
    v_note,
    p_client_message_id,
    'shared_post',
    'post',
    p_post_id,
    v_snapshot
  )
  ON CONFLICT (conversation_id, sender_user_id, client_message_id) DO NOTHING
  RETURNING * INTO v_msg;

  IF FOUND THEN
    v_inserted := true;
  ELSE
    SELECT m.*
    INTO v_msg
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_user_id = v_me
      AND m.client_message_id = p_client_message_id;

    IF v_msg.id IS NULL THEN
      RAISE EXCEPTION 'Failed to resolve message after conflict';
    END IF;
  END IF;

  IF v_inserted THEN
    IF length(v_note) > 0 THEN
      IF v_post_type = 'hangout' THEN
        v_preview := left('Shared a hangout · ' || v_note, 200);
      ELSE
        v_preview := left('Shared an experience · ' || v_note, 200);
      END IF;
    ELSE
      IF v_post_type = 'hangout' THEN
        v_preview := 'Shared a hangout';
      ELSE
        v_preview := 'Shared an experience';
      END IF;
    END IF;

    UPDATE public.conversations c
    SET
      last_message_at = v_msg.created_at,
      last_message_preview = v_preview,
      last_message_sender_id = v_me,
      updated_at = now()
    WHERE c.id = p_conversation_id
      AND (
        c.last_message_at IS NULL
        OR c.last_message_at <= v_msg.created_at
      );

    UPDATE public.conversation_members m
    SET unread_count = m.unread_count + 1
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id <> v_me
      AND m.left_at IS NULL;

    BEGIN
      PERFORM public.enqueue_dm_push_outbox_for_message(
        v_msg.id,
        p_conversation_id,
        v_me,
        v_preview,
        v_kind,
        v_group_name
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING
          'dm_push_outbox enqueue failed for conversation %: %',
          p_conversation_id,
          SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'message', jsonb_build_object(
      'id', v_msg.id,
      'conversation_id', v_msg.conversation_id,
      'sender_user_id', v_msg.sender_user_id,
      'body', v_msg.body,
      'client_message_id', v_msg.client_message_id,
      'created_at', v_msg.created_at,
      'message_kind', v_msg.message_kind,
      'reference_type', v_msg.reference_type,
      'reference_id', v_msg.reference_id,
      'reference_snapshot', v_msg.reference_snapshot
    ),
    'created', v_inserted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.send_shared_post_message(uuid, uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_shared_post_message(uuid, uuid, text, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.send_shared_post_message(uuid, uuid, text, uuid) IS
  'Share S0: insert shared_post message after all-active-member can_view_post_as gate. send_message untouched.';
