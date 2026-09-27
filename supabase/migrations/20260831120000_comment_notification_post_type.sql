-- Comment inbox: include post_type in notification additional_data.
-- Idempotent trigger ensure. Inbox-only — no push outbox.

CREATE OR REPLACE FUNCTION public.notify_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  post_author_id uuid;
  post_type text;
BEGIN
  SELECT p.author_id, p.type::text
  INTO post_author_id, post_type
  FROM public.posts p
  WHERE p.id = NEW.post_id;

  -- Post author only; self-comments excluded inside create_notification().
  PERFORM public.create_notification(
    post_author_id,
    NEW.author_id,
    'comment',
    'comment',
    NEW.id,
    jsonb_build_object(
      'post_id', NEW.post_id,
      'post_type', post_type,
      'comment_text', LEFT(NEW.content, 100)
    )
  );

  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF to_regclass('public.comments') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trigger_notify_comment'
    ) THEN
      CREATE TRIGGER trigger_notify_comment
        AFTER INSERT ON public.comments
        FOR EACH ROW
        EXECUTE FUNCTION public.notify_comment();
    END IF;
  END IF;
END $$;

COMMENT ON FUNCTION public.notify_comment() IS
  'Notify post author on new comment. additional_data: post_id, post_type, comment_text. No reply fan-out.';
