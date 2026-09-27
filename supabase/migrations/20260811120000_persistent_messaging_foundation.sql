-- Phase 0: persistent messaging foundation (additive only).
-- Tables: conversations, conversation_members, messages.
-- No RPCs, no Realtime publication, no invite/notification changes.
-- Writes will be SECURITY DEFINER RPCs in later phases; clients get SELECT only.

-- ---------------------------------------------------------------------------
-- 1) conversations
-- ---------------------------------------------------------------------------
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  direct_user_low uuid NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  direct_user_high uuid NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  last_message_at timestamptz NULL,
  last_message_preview text NULL,
  last_message_sender_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_kind_check CHECK (kind = ANY (ARRAY['direct'::text, 'group'::text])),
  CONSTRAINT conversations_direct_pair_shape_check CHECK (
    (
      kind = 'direct'
      AND direct_user_low IS NOT NULL
      AND direct_user_high IS NOT NULL
      AND direct_user_low < direct_user_high
    )
    OR (
      kind = 'group'
      AND direct_user_low IS NULL
      AND direct_user_high IS NULL
    )
  ),
  CONSTRAINT conversations_direct_pair_key UNIQUE (direct_user_low, direct_user_high)
);

COMMENT ON TABLE public.conversations IS
  'Persistent DM/group conversations (Phase 0). Distinct from temporary invite_threads.';
COMMENT ON COLUMN public.conversations.title IS
  'Optional group display name; null for direct or untitled groups.';
COMMENT ON COLUMN public.conversations.direct_user_low IS
  'Normalized lower auth user id for kind=direct; null for groups.';
COMMENT ON COLUMN public.conversations.direct_user_high IS
  'Normalized higher auth user id for kind=direct; null for groups.';
COMMENT ON CONSTRAINT conversations_direct_pair_key ON public.conversations IS
  'One durable direct conversation per user pair. Multiple (NULL,NULL) group rows allowed in Postgres UNIQUE.';

CREATE OR REPLACE FUNCTION public.update_conversations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_conversations_updated_at ON public.conversations;
CREATE TRIGGER trigger_update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversations_updated_at();

-- ---------------------------------------------------------------------------
-- 2) conversation_members
-- ---------------------------------------------------------------------------
CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz NULL,
  unread_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT conversation_members_unread_nonnegative_check CHECK (unread_count >= 0)
);

COMMENT ON TABLE public.conversation_members IS
  'Membership + thread-level unread for persistent conversations. Active member: left_at IS NULL.';

-- Inbox / "my active memberships" lookups are by user_id; PK is (conversation_id, user_id).
CREATE INDEX conversation_members_user_active_idx
  ON public.conversation_members (user_id, conversation_id)
  WHERE left_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3) messages (text-only MVP)
-- ---------------------------------------------------------------------------
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL,
  client_message_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_body_nonempty_check CHECK (length(btrim(body)) > 0),
  CONSTRAINT messages_client_idempotency_key UNIQUE (conversation_id, sender_user_id, client_message_id)
);

COMMENT ON TABLE public.messages IS
  'Persistent conversation messages (text-only Phase 0). Typed cards added in a later phase.';
COMMENT ON COLUMN public.messages.client_message_id IS
  'Client-generated UUID for idempotent send retries.';

-- Keyset pagination: newest-first pages on (created_at, id).
CREATE INDEX messages_conversation_created_id_desc_idx
  ON public.messages (conversation_id, created_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- 4) Grants: SELECT only for authenticated; no direct client writes
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.conversation_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.messages FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.conversations TO authenticated;
GRANT SELECT ON TABLE public.conversation_members TO authenticated;
GRANT SELECT ON TABLE public.messages TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) RLS (SELECT only; no INSERT/UPDATE/DELETE policies)
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Own membership rows only (avoids recursive co-member exposure in Phase 0).
CREATE POLICY conversation_members_select_own
  ON public.conversation_members
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Conversation visible when viewer has an active membership.
-- Subquery sees only own member rows under conversation_members_select_own (no recursion).
CREATE POLICY conversations_select_active_member
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversation_members m
      WHERE m.conversation_id = conversations.id
        AND m.user_id = (SELECT auth.uid())
        AND m.left_at IS NULL
    )
  );

-- Messages visible when viewer has an active membership in that conversation.
CREATE POLICY messages_select_active_member
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversation_members m
      WHERE m.conversation_id = messages.conversation_id
        AND m.user_id = (SELECT auth.uid())
        AND m.left_at IS NULL
    )
  );
