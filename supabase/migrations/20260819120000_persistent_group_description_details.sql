-- Phase 5E2A: optional group description + admin update_group_details.
-- LOCAL until explicitly applied. Does not change create/rename signatures.
-- No Group Up coupling.

-- ---------------------------------------------------------------------------
-- Schema: conversations.description
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS description text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_description_length_check'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_description_length_check
      CHECK (
        description IS NULL
        OR char_length(description) <= 200
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.conversations.description IS
  'Optional group about text (max 200). NULL for directs and untitled about; Messaging-owned after create.';

-- ---------------------------------------------------------------------------
-- Private helper: _normalize_group_description
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._normalize_group_description(p_description text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_description text;
BEGIN
  IF p_description IS NULL THEN
    RETURN NULL;
  END IF;

  v_description := btrim(p_description);
  IF length(v_description) = 0 THEN
    RETURN NULL;
  END IF;
  IF length(v_description) > 200 THEN
    RAISE EXCEPTION 'Group description is too long';
  END IF;
  RETURN v_description;
END;
$function$;

REVOKE ALL ON FUNCTION public._normalize_group_description(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- update_group_details (admin; atomic title + description)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_group_details(
  p_conversation_id uuid,
  p_title text,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_title text;
  v_description text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public._lock_group_conversation(p_conversation_id);
  PERFORM public._ensure_group_has_admin(p_conversation_id);
  PERFORM public._assert_active_group_admin(p_conversation_id, v_me);

  v_title := public._normalize_group_title(p_title);
  v_description := public._normalize_group_description(p_description);

  UPDATE public.conversations c
  SET
    title = v_title,
    description = v_description,
    updated_at = now()
  WHERE c.id = p_conversation_id;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'title', v_title,
    'description', v_description
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_group_details(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_group_details(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.update_group_details(uuid, text, text) IS
  'Admin updates group title (required, max 80) and optional description (max 200) atomically.';
