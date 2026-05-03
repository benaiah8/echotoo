-- Optional short invite note (in-app; push unchanged). Invitee notification additional_data
-- includes `invite_note` when non-empty after trim (max 200 chars in DB for safety).

ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN public.invites.note IS 'Optional plain-text note from inviter; max 200 chars; in-app only.';

-- Replace only the invite-creation notification function (not RSVP/status).
CREATE OR REPLACE FUNCTION public.create_invite_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    user_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    additional_data,
    is_read,
    created_at
  ) VALUES (
    NEW.invitee_id,
    NEW.inviter_id,
    'invite',
    'post',
    NEW.post_id,
    (
      jsonb_build_object(
        'post_id', NEW.post_id,
        'invite_id', NEW.id,
        'post_type', (SELECT p.type FROM public.posts p WHERE p.id = NEW.post_id),
        'post_caption', (SELECT p.caption FROM public.posts p WHERE p.id = NEW.post_id)
      )
      || CASE
        WHEN NEW.note IS NOT NULL AND btrim(NEW.note) <> '' THEN
          jsonb_build_object('invite_note', left(btrim(NEW.note), 200))
        ELSE '{}'::jsonb
      END
    ),
    false,
    NOW()
  );
  RETURN NEW;
END;
$$;
