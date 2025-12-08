-- Notification System Database Schema
-- This creates the notifications table and triggers for automatic notification creation

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('like', 'follow', 'comment', 'invite', 'saved', 'rsvp')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('post', 'comment', 'hangout', 'experience')),
  entity_id UUID NOT NULL,
  additional_data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Note: INSERT policies will be handled by server-side triggers/APIs to ensure proper access control

-- Function to create notification (to be called from triggers)
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_actor_id UUID,
  p_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_additional_data JSONB DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  notification_id UUID;
BEGIN
  -- Don't create notification for self-actions
  IF p_user_id = p_actor_id THEN
    RETURN NULL;
  END IF;

  -- Insert the notification
  INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, additional_data)
  VALUES (p_user_id, p_actor_id, p_type, p_entity_type, p_entity_id, p_additional_data)
  RETURNING id INTO notification_id;

  RETURN notification_id;
END;
$$;

-- Trigger function for post likes
CREATE OR REPLACE FUNCTION notify_post_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  post_author_id UUID;
BEGIN
  -- Get the post author
  SELECT author_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  -- Create notification
  PERFORM create_notification(
    post_author_id,
    NEW.user_id,
    'like',
    'post',
    NEW.post_id
  );

  RETURN NEW;
END;
$$;

-- Trigger function for follows
CREATE OR REPLACE FUNCTION notify_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create notification for the user being followed
  PERFORM create_notification(
    NEW.following_id, -- The user being followed
    NEW.follower_id,  -- The user who is following
    'follow',
    'post', -- We'll use 'post' as entity_type for follows, entity_id can be null
    NEW.id -- Using the follow relationship id as entity_id
  );

  RETURN NEW;
END;
$$;

-- Trigger function for RSVP responses
CREATE OR REPLACE FUNCTION notify_rsvp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  post_author_id UUID;
  post_type TEXT;
  entity_type_val TEXT;
BEGIN
  -- Only notify for "going" status (not "maybe" or "not_going")
  IF NEW.status = 'going' THEN
    -- Get the post author and type
    SELECT author_id, type INTO post_author_id, post_type
    FROM posts
    WHERE id = NEW.post_id;

    -- Only create notification if the RSVP is not from the post author
    IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
      -- Determine entity type based on post type
      entity_type_val := CASE WHEN post_type = 'hangout' THEN 'hangout' ELSE 'experience' END;
      
      -- Create notification
      PERFORM create_notification(
        post_author_id,
        NEW.user_id,
        'rsvp',
        entity_type_val,
        NEW.post_id,
        jsonb_build_object('rsvp_status', NEW.status)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function for comments
CREATE OR REPLACE FUNCTION notify_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  post_author_id UUID;
BEGIN
  -- Get the post author
  SELECT author_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  -- Create notification for post author (not for the commenter themselves)
  PERFORM create_notification(
    post_author_id,
    NEW.author_id,
    'comment',
    'comment',
    NEW.id,
    jsonb_build_object('post_id', NEW.post_id, 'comment_text', LEFT(NEW.content, 100))
  );

  RETURN NEW;
END;
$$;

-- Create triggers (only if they don't exist)
DO $$
BEGIN
  -- Post likes trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_notify_post_like') THEN
    CREATE TRIGGER trigger_notify_post_like
      AFTER INSERT ON post_likes
      FOR EACH ROW
      EXECUTE FUNCTION notify_post_like();
  END IF;

  -- Follows trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_notify_follow') THEN
    CREATE TRIGGER trigger_notify_follow
      AFTER INSERT ON follows
      FOR EACH ROW
      EXECUTE FUNCTION notify_follow();
  END IF;

  -- Comments trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_notify_comment') THEN
    CREATE TRIGGER trigger_notify_comment
      AFTER INSERT ON comments
      FOR EACH ROW
      EXECUTE FUNCTION notify_comment();
  END IF;

  -- RSVP trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_notify_rsvp') THEN
    CREATE TRIGGER trigger_notify_rsvp
      AFTER INSERT OR UPDATE ON rsvp_responses
      FOR EACH ROW
      EXECUTE FUNCTION notify_rsvp();
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE notifications IS 'User notifications for likes, follows, and comments';
COMMENT ON COLUMN notifications.type IS 'Type of notification: like, follow, or comment';
COMMENT ON COLUMN notifications.entity_type IS 'Type of entity: post or comment';
COMMENT ON COLUMN notifications.entity_id IS 'ID of the related entity (post or comment ID)';
COMMENT ON COLUMN notifications.additional_data IS 'Additional context data (e.g., comment preview)';
COMMENT ON COLUMN notifications.actor_id IS 'User who performed the action (can be null for system notifications)';
