-- Server-side new-post follower notifications (SECURITY DEFINER).
-- Bypasses RLS for fan-out only; does not change RLS policies.
-- Idempotent: skips insert if a matching 'post' notification already exists for (recipient, post, actor).

-- Ensure follows.status exists for approved-only fan-out (no-op if already present).
DO $$
BEGIN
  IF to_regclass('public.follows') IS NOT NULL THEN
    ALTER TABLE public.follows ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';
  END IF;
END $$;

-- Allow notification type 'post' for follower post notifications.
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
      CHECK (type IN ('like', 'follow', 'comment', 'invite', 'saved', 'rsvp', 'post'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_post_follower_notifications(
  p_post_id uuid,
  p_post_type text,
  p_author_auth_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_profile_id uuid;
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.follows') IS NULL
     OR to_regclass('public.notifications') IS NULL
     OR to_regclass('public.notification_settings') IS NULL THEN
    RETURN;
  END IF;

  IF p_post_id IS NULL OR p_author_auth_user_id IS NULL THEN
    RETURN;
  END IF;

  IF p_post_type IS NULL OR p_post_type NOT IN ('hangout', 'experience') THEN
    RETURN;
  END IF;

  SELECT p.id
  INTO v_author_profile_id
  FROM public.profiles p
  WHERE p.user_id = p_author_auth_user_id
  LIMIT 1;

  IF v_author_profile_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, actor_id, type, entity_type, entity_id, additional_data)
  SELECT DISTINCT
    fp.user_id,
    p_author_auth_user_id,
    'post',
    p_post_type,
    p_post_id,
    '{}'::jsonb
  FROM public.follows f
  INNER JOIN public.profiles fp ON fp.id = f.follower_id
  INNER JOIN public.notification_settings ns
    ON ns.target_user_id = v_author_profile_id
   AND ns.user_id = fp.user_id
   AND ns.enabled = true
  WHERE f.following_id = v_author_profile_id
    AND COALESCE(f.status, 'approved') = 'approved'
    AND fp.user_id IS NOT NULL
    AND fp.user_id IS DISTINCT FROM p_author_auth_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = fp.user_id
        AND n.entity_id = p_post_id
        AND n.type = 'post'
        AND n.actor_id = p_author_auth_user_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_post_followers_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.status, '') = 'published' THEN
      PERFORM public.create_post_follower_notifications(NEW.id, NEW.type::text, NEW.author_id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.status, '') = 'published'
       AND (OLD.status IS DISTINCT FROM NEW.status) THEN
      PERFORM public.create_post_follower_notifications(NEW.id, NEW.type::text, NEW.author_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_posts_notify_followers_on_publish ON public.posts;
    CREATE TRIGGER trg_posts_notify_followers_on_publish
      AFTER INSERT OR UPDATE OF status ON public.posts
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_post_followers_on_publish();
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.create_post_follower_notifications(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_post_followers_on_publish() FROM PUBLIC;

COMMENT ON FUNCTION public.create_post_follower_notifications(uuid, text, uuid) IS
  'Fan-out post notifications to followers with notification_settings enabled; runs as definer to bypass RLS.';
