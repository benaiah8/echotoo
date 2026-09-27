-- Direct messaging privacy + generic feature access foundation.
-- LOCAL only until explicitly applied. Forward-only Pair Up unlock migration.
-- Replaces dm_direct_unlocks with dm_direct_access_grants; rewires create/send/list/access.
-- Does not modify push/Edge, Group Up messaging, interest/join paths, or client code.
--
-- Depends on: R1A stranger gate, R1B access RPC, Pair Up dm_direct_unlocks.

-- ---------------------------------------------------------------------------
-- 1) dm_direct_access_grants
-- ---------------------------------------------------------------------------
CREATE TABLE public.dm_direct_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  access_mode text NOT NULL CHECK (access_mode IN ('request', 'full')),
  source_type text NOT NULL,
  source_id uuid NULL,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dm_direct_access_grants_not_self CHECK (from_user_id <> to_user_id)
);

CREATE UNIQUE INDEX dm_direct_access_grants_with_source_uidx
  ON public.dm_direct_access_grants (from_user_id, to_user_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX dm_direct_access_grants_no_source_uidx
  ON public.dm_direct_access_grants (from_user_id, to_user_id, source_type)
  WHERE source_id IS NULL;

CREATE INDEX dm_direct_access_grants_lookup_idx
  ON public.dm_direct_access_grants (from_user_id, to_user_id);

ALTER TABLE public.dm_direct_access_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dm_direct_access_grants
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.dm_direct_access_grants IS
  'Directional DM access grants (request|full). Feature RPCs stamp via private helper; never client-writable. Messaging-only; does not affect profile/post privacy.';

-- ---------------------------------------------------------------------------
-- 2) Migrate existing Pair Up unlocks → two directional FULL grants
-- ---------------------------------------------------------------------------
INSERT INTO public.dm_direct_access_grants (
  from_user_id,
  to_user_id,
  access_mode,
  source_type,
  source_id,
  expires_at,
  created_at
)
SELECT u.user_low, u.user_high, 'full', 'pair_up', NULL::uuid, NULL::timestamptz, u.created_at
FROM public.dm_direct_unlocks u
UNION ALL
SELECT u.user_high, u.user_low, 'full', 'pair_up', NULL::uuid, NULL::timestamptz, u.created_at
FROM public.dm_direct_unlocks u;

-- ---------------------------------------------------------------------------
-- 3) dm_grant_direct_access — private trusted feature stamp
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dm_grant_direct_access(
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_access_mode text,
  p_source_type text,
  p_source_id uuid,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF p_from_user_id IS NULL OR p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing grant users';
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot grant DM access to self';
  END IF;

  IF p_access_mode IS NULL OR p_access_mode NOT IN ('request', 'full') THEN
    RAISE EXCEPTION 'Invalid access_mode';
  END IF;

  IF p_source_type IS NULL OR btrim(p_source_type) = '' THEN
    RAISE EXCEPTION 'Missing source_type';
  END IF;

  IF p_source_id IS NOT NULL THEN
    INSERT INTO public.dm_direct_access_grants (
      from_user_id,
      to_user_id,
      access_mode,
      source_type,
      source_id,
      expires_at
    )
    VALUES (
      p_from_user_id,
      p_to_user_id,
      p_access_mode,
      p_source_type,
      p_source_id,
      p_expires_at
    )
    ON CONFLICT (from_user_id, to_user_id, source_type, source_id)
      WHERE source_id IS NOT NULL
    DO UPDATE SET
      access_mode = EXCLUDED.access_mode,
      expires_at = EXCLUDED.expires_at;
  ELSE
    INSERT INTO public.dm_direct_access_grants (
      from_user_id,
      to_user_id,
      access_mode,
      source_type,
      source_id,
      expires_at
    )
    VALUES (
      p_from_user_id,
      p_to_user_id,
      p_access_mode,
      p_source_type,
      NULL,
      p_expires_at
    )
    ON CONFLICT (from_user_id, to_user_id, source_type)
      WHERE source_id IS NULL
    DO UPDATE SET
      access_mode = EXCLUDED.access_mode,
      expires_at = EXCLUDED.expires_at;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.dm_grant_direct_access(uuid, uuid, text, text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.dm_grant_direct_access(uuid, uuid, text, text, uuid, timestamptz) IS
  'Private: idempotent directional DM grant stamp for trusted feature RPCs only.';

-- ---------------------------------------------------------------------------
-- 4) dm_direct_access_mode — canonical DENIED | REQUEST | FULL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dm_direct_access_mode(
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_conversation_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_pa uuid;
  v_pb uuid;
  v_target_private boolean;
  v_from_has_qualifying boolean := false;
  v_to_has_qualifying boolean := false;
BEGIN
  IF p_from_user_id IS NULL
     OR p_to_user_id IS NULL
     OR p_from_user_id = p_to_user_id THEN
    RETURN 'denied';
  END IF;

  IF public.users_are_blocked_pair(p_from_user_id, p_to_user_id) THEN
    RETURN 'denied';
  END IF;

  -- FULL: mutual approved follows
  SELECT pr.id
  INTO v_pa
  FROM public.profiles pr
  WHERE pr.user_id = p_from_user_id
    AND pr.deleted_at IS NULL
  LIMIT 1;

  SELECT pr.id
  INTO v_pb
  FROM public.profiles pr
  WHERE pr.user_id = p_to_user_id
    AND pr.deleted_at IS NULL
  LIMIT 1;

  IF v_pa IS NOT NULL AND v_pb IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = v_pa
        AND f.following_id = v_pb
        AND f.status = 'approved'
    ) AND EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = v_pb
        AND f.following_id = v_pa
        AND f.status = 'approved'
    ) THEN
      RETURN 'full';
    END IF;
  END IF;

  -- FULL: reply unlock (both sides qualifying) when conversation known
  IF p_conversation_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.conversation_id = p_conversation_id
        AND m.sender_user_id = p_from_user_id
        AND m.message_kind IN ('text', 'shared_post')
    )
    INTO v_from_has_qualifying;

    SELECT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.conversation_id = p_conversation_id
        AND m.sender_user_id = p_to_user_id
        AND m.message_kind IN ('text', 'shared_post')
    )
    INTO v_to_has_qualifying;

    IF COALESCE(v_from_has_qualifying, false)
       AND COALESCE(v_to_has_qualifying, false) THEN
      RETURN 'full';
    END IF;
  END IF;

  -- FULL: valid directional full grant
  IF EXISTS (
    SELECT 1
    FROM public.dm_direct_access_grants g
    WHERE g.from_user_id = p_from_user_id
      AND g.to_user_id = p_to_user_id
      AND g.access_mode = 'full'
      AND (g.expires_at IS NULL OR g.expires_at > now())
  ) THEN
    RETURN 'full';
  END IF;

  -- REQUEST: valid directional request grant
  IF EXISTS (
    SELECT 1
    FROM public.dm_direct_access_grants g
    WHERE g.from_user_id = p_from_user_id
      AND g.to_user_id = p_to_user_id
      AND g.access_mode = 'request'
      AND (g.expires_at IS NULL OR g.expires_at > now())
  ) THEN
    RETURN 'request';
  END IF;

  -- REQUEST: public recipient (missing profile → treat as not public)
  SELECT COALESCE(pr.is_private, false)
  INTO v_target_private
  FROM public.profiles pr
  WHERE pr.user_id = p_to_user_id
    AND pr.deleted_at IS NULL
  LIMIT 1;

  IF FOUND AND COALESCE(v_target_private, false) = false THEN
    RETURN 'request';
  END IF;

  -- REQUEST: in-flight request survives privacy flip
  -- (sender already has qualifying message(s); recipient has not replied)
  IF p_conversation_id IS NOT NULL
     AND COALESCE(v_from_has_qualifying, false)
     AND NOT COALESCE(v_to_has_qualifying, false) THEN
    RETURN 'request';
  END IF;

  RETURN 'denied';
END;
$function$;

REVOKE ALL ON FUNCTION public.dm_direct_access_mode(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.dm_direct_access_mode(uuid, uuid, uuid) IS
  'Private: canonical direct DM access mode denied|request|full for from→to.';

-- ---------------------------------------------------------------------------
-- 5) dm_direct_is_unlocked — thin FULL wrapper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dm_direct_is_unlocked(
  p_conversation_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  RETURN public.dm_direct_access_mode(
    p_user_a,
    p_user_b,
    p_conversation_id
  ) = 'full';
END;
$function$;

REVOKE ALL ON FUNCTION public.dm_direct_is_unlocked(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.dm_direct_is_unlocked(uuid, uuid, uuid) IS
  'Compatibility: true when dm_direct_access_mode(a→b)=full.';

-- ---------------------------------------------------------------------------
-- 6) get_or_create_direct_conversation — access gate before create
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(
  p_other_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_conv_id uuid;
  v_created boolean := false;
  v_row public.conversations%ROWTYPE;
  v_mode text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_other_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing other user';
  END IF;

  IF p_other_user_id = v_me THEN
    RAISE EXCEPTION 'Cannot create a direct conversation with yourself';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = p_other_user_id
      AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  IF public.users_are_blocked_pair(v_me, p_other_user_id) THEN
    RAISE EXCEPTION 'Cannot message this user';
  END IF;

  IF v_me < p_other_user_id THEN
    v_low := v_me;
    v_high := p_other_user_id;
  ELSE
    v_low := p_other_user_id;
    v_high := v_me;
  END IF;

  SELECT c.id
  INTO v_conv_id
  FROM public.conversations c
  WHERE c.kind = 'direct'
    AND c.direct_user_low = v_low
    AND c.direct_user_high = v_high;

  v_mode := public.dm_direct_access_mode(v_me, p_other_user_id, v_conv_id);

  IF v_mode = 'denied' THEN
    RAISE EXCEPTION 'DM_DIRECT_ACCESS_DENIED';
  END IF;

  IF v_conv_id IS NULL THEN
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
      INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES
        (v_conv_id, v_me),
        (v_conv_id, p_other_user_id);
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

      INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES (v_conv_id, v_me)
      ON CONFLICT (conversation_id, user_id) DO UPDATE
      SET left_at = NULL;

      INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES (v_conv_id, p_other_user_id)
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
  ELSE
    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (v_conv_id, v_me)
    ON CONFLICT (conversation_id, user_id) DO UPDATE
    SET left_at = NULL;

    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (v_conv_id, p_other_user_id)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  SELECT c.*
  INTO v_row
  FROM public.conversations c
  WHERE c.id = v_conv_id;

  RETURN jsonb_build_object(
    'conversation_id', v_row.id,
    'kind', v_row.kind,
    'other_user_id', p_other_user_id,
    'created', v_created,
    'created_at', v_row.created_at,
    'last_message_at', v_row.last_message_at,
    'last_message_preview', v_row.last_message_preview,
    'last_message_sender_id', v_row.last_message_sender_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_or_create_direct_conversation(uuid) IS
  'Get/create unique direct DM; denies private ordinary strangers (DM_DIRECT_ACCESS_DENIED).';

-- ---------------------------------------------------------------------------
-- 7) send_message — canonical access mode
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_body text;
  v_preview text;
  v_kind text;
  v_low uuid;
  v_high uuid;
  v_other uuid;
  v_group_name text;
  v_msg public.messages%ROWTYPE;
  v_inserted boolean := false;
  v_mode text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL OR p_client_message_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation or client_message_id';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN
    RAISE EXCEPTION 'Message body is empty';
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
  END IF;

  -- Idempotent short-circuit before mutable gates.
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
        'created_at', v_msg.created_at
      ),
      'created', false
    );
  END IF;

  IF v_kind = 'direct' THEN
    IF public.users_are_blocked_pair(v_me, v_other) THEN
      RAISE EXCEPTION 'Cannot message this user';
    END IF;

    v_mode := public.dm_direct_access_mode(v_me, v_other, p_conversation_id);

    IF v_mode = 'denied' THEN
      RAISE EXCEPTION 'DM_DIRECT_ACCESS_DENIED';
    ELSIF v_mode = 'request' THEN
      PERFORM public.dm_direct_assert_can_send_new(
        p_conversation_id,
        v_me,
        v_other
      );
    END IF;
    -- full: unrestricted
  END IF;

  INSERT INTO public.messages (
    conversation_id,
    sender_user_id,
    body,
    client_message_id
  )
  VALUES (
    p_conversation_id,
    v_me,
    v_body,
    p_client_message_id
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
    v_preview := left(v_body, 200);

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
      'created_at', v_msg.created_at
    ),
    'created', v_inserted
  );
END;
$function$;

COMMENT ON FUNCTION public.send_message(uuid, text, uuid) IS
  'Send text; direct access_mode denied|request|full; request uses 2-message assert; idempotent-first.';

-- ---------------------------------------------------------------------------
-- 8) send_shared_post_message — same access mode
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
  v_mode text;
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
  END IF;

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

  IF v_kind = 'direct' THEN
    IF public.users_are_blocked_pair(v_me, v_other) THEN
      RAISE EXCEPTION 'Cannot message this user';
    END IF;

    v_mode := public.dm_direct_access_mode(v_me, v_other, p_conversation_id);

    IF v_mode = 'denied' THEN
      RAISE EXCEPTION 'DM_DIRECT_ACCESS_DENIED';
    ELSIF v_mode = 'request' THEN
      PERFORM public.dm_direct_assert_can_send_new(
        p_conversation_id,
        v_me,
        v_other
      );
    END IF;
  END IF;

  v_note := btrim(COALESCE(p_note, ''));
  IF char_length(v_note) > 200 THEN
    RAISE EXCEPTION 'Note is too long';
  END IF;

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

COMMENT ON FUNCTION public.send_shared_post_message(uuid, uuid, text, uuid) IS
  'Shared_post send; same direct access_mode as text; request counts toward 2-cap.';

-- ---------------------------------------------------------------------------
-- 9) list_my_conversations — is_request via access_mode(other→viewer)
-- ---------------------------------------------------------------------------
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
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_last_message_at DESC NULLS LAST, t.created_at DESC),
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
      c.last_message_at AS sort_last_message_at,
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
      END AS is_request
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
    ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'conversations', v_rows
  );
END;
$function$;

COMMENT ON FUNCTION public.list_my_conversations(integer) IS
  'Inbox rows; is_request when other→viewer access_mode=request; excludes blocked directs.';

-- ---------------------------------------------------------------------------
-- 10) get_direct_messaging_access — access_mode + mapped fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_direct_messaging_access(
  p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_kind text;
  v_low uuid;
  v_high uuid;
  v_other uuid;
  v_mode text;
  v_unlocked boolean;
  v_count integer;
  v_can_send boolean;
  v_remaining integer;
  v_restriction text;
  v_is_request boolean;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Missing conversation';
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

  SELECT c.kind, c.direct_user_low, c.direct_user_high
  INTO v_kind, v_low, v_high
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_kind IS DISTINCT FROM 'direct' THEN
    RETURN jsonb_build_object(
      'conversation_id', p_conversation_id,
      'kind', COALESCE(v_kind, 'group'),
      'access_mode', 'full',
      'unlocked', true,
      'can_send', true,
      'qualifying_sent_count', 0,
      'messages_remaining', NULL,
      'restriction', NULL,
      'is_request', false
    );
  END IF;

  IF v_low = v_me THEN
    v_other := v_high;
  ELSIF v_high = v_me THEN
    v_other := v_low;
  ELSE
    RAISE EXCEPTION 'Invalid direct conversation';
  END IF;

  IF v_other IS NULL THEN
    RAISE EXCEPTION 'Invalid direct conversation';
  END IF;

  v_mode := public.dm_direct_access_mode(v_me, v_other, p_conversation_id);

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_user_id = v_me
    AND m.message_kind IN ('text', 'shared_post');

  v_count := COALESCE(v_count, 0);

  IF v_mode = 'full' THEN
    v_unlocked := true;
    v_can_send := true;
    v_remaining := NULL;
    v_restriction := NULL;
    v_is_request := false;
  ELSIF v_mode = 'request' THEN
    v_unlocked := false;
    v_is_request := EXISTS (
      SELECT 1
      FROM public.messages msg
      WHERE msg.conversation_id = p_conversation_id
        AND msg.sender_user_id = v_other
        AND msg.message_kind IN ('text', 'shared_post')
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.messages msg
      WHERE msg.conversation_id = p_conversation_id
        AND msg.sender_user_id = v_me
        AND msg.message_kind IN ('text', 'shared_post')
    );
    IF v_count >= 2 THEN
      v_can_send := false;
      v_remaining := 0;
      v_restriction := 'waiting_for_reply';
    ELSE
      v_can_send := true;
      v_remaining := GREATEST(0, 2 - v_count);
      v_restriction := NULL;
    END IF;
  ELSE
    -- denied
    v_unlocked := false;
    v_can_send := false;
    v_remaining := NULL;
    v_is_request := false;
    IF public.users_are_blocked_pair(v_me, v_other) THEN
      v_restriction := 'blocked';
    ELSE
      v_restriction := 'private';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'kind', 'direct',
    'access_mode', v_mode,
    'unlocked', v_unlocked,
    'can_send', v_can_send,
    'qualifying_sent_count', v_count,
    'messages_remaining', v_remaining,
    'restriction', v_restriction,
    'is_request', v_is_request
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_direct_messaging_access(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_direct_messaging_access(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_direct_messaging_access(uuid) IS
  'Direct DM access snapshot: access_mode + unlocked/can_send/count/restriction/is_request.';

-- ---------------------------------------------------------------------------
-- 11) complete_pair_up_match — stamp FULL grants both directions
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
     OR v_to.discoverable_until <= now() THEN
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
    AND o.discoverable_until > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not in pool';
  END IF;

  IF NOT public.people_source_is_eligible(v_to.source_post_id) THEN
    RAISE EXCEPTION 'Source is not eligible';
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
     OR v_from.discoverable_until <= now()
     OR v_from.creator_id <> v_me
     OR v_to.kind <> 'pair_up'
     OR v_to.status <> 'active'
     OR v_to.discoverable_until <= now()
     OR v_to.creator_id = v_me
     OR v_from.source_post_id <> v_to.source_post_id
     OR NOT public.people_source_is_eligible(v_to.source_post_id)
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

  IF NOT v_has_outgoing OR NOT v_has_incoming THEN
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
  'Mutual Pair Up: reuse direct DM, reactivate members, stamp bidirectional FULL dm_direct_access_grants.';

-- ---------------------------------------------------------------------------
-- 12) Drop legacy Pair-Up-only unlock table (single source of truth)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.dm_direct_unlocks;
