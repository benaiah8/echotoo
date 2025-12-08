-- Fix RLS policies for invites and notifications tables
-- This script addresses the 403 Forbidden and 42501 RLS violation errors

-- ==============================================
-- STEP 1: Fix RLS policies for INVITES table
-- ==============================================

-- Enable RLS on invites table if not already enabled
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Allow authenticated users to create invites" ON invites;
DROP POLICY IF EXISTS "Users can view their own invites" ON invites;
DROP POLICY IF EXISTS "Users can create invites for their posts" ON invites;
DROP POLICY IF EXISTS "Invitees can update invite status" ON invites;
DROP POLICY IF EXISTS "Inviters can delete their invites" ON invites;

-- Policy 1: Allow authenticated users to INSERT invites
CREATE POLICY "Allow authenticated users to create invites"
ON invites FOR INSERT
TO authenticated
WITH CHECK (
    inviter_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM posts 
        WHERE posts.id = invites.post_id 
        AND posts.author_id = auth.uid()
    )
);

-- Policy 2: Allow users to SELECT invites they sent or received
CREATE POLICY "Users can view their own invites"
ON invites FOR SELECT
TO authenticated
USING (
    inviter_id = auth.uid() OR invitee_id = auth.uid()
);

-- Policy 3: Allow invitees to UPDATE status (accept/decline)
CREATE POLICY "Invitees can update invite status"
ON invites FOR UPDATE
TO authenticated
USING (invitee_id = auth.uid())
WITH CHECK (
    invitee_id = auth.uid() AND
    status IN ('accepted', 'declined')
);

-- Policy 4: Allow inviters to DELETE their invites
CREATE POLICY "Inviters can delete their invites"
ON invites FOR DELETE
TO authenticated
USING (inviter_id = auth.uid());

-- ==============================================
-- STEP 2: Fix RLS policies for NOTIFICATIONS table
-- ==============================================

-- Enable RLS on notifications table if not already enabled
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Allow service role to insert notifications" ON notifications;
DROP POLICY IF EXISTS "Allow authenticated users to update notifications" ON notifications;
DROP POLICY IF EXISTS "Allow authenticated users to delete notifications" ON notifications;

-- Policy 1: Allow users to SELECT their own notifications
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy 2: Allow service role to INSERT notifications (for triggers)
CREATE POLICY "Allow service role to insert notifications"
ON notifications FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy 3: Allow authenticated users to INSERT notifications (for manual creation)
CREATE POLICY "Allow authenticated users to insert notifications"
ON notifications FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Policy 4: Allow users to UPDATE their own notifications (mark as read)
CREATE POLICY "Allow authenticated users to update notifications"
ON notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy 5: Allow users to DELETE their own notifications
CREATE POLICY "Allow authenticated users to delete notifications"
ON notifications FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ==============================================
-- STEP 3: Update the notification trigger to use service role
-- ==============================================

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS invite_notification_trigger ON invites;
DROP TRIGGER IF EXISTS invite_status_notification_trigger ON invites;
DROP FUNCTION IF EXISTS create_invite_notification();
DROP FUNCTION IF EXISTS create_invite_status_notification();

-- Create function to handle invite notifications (using SECURITY DEFINER)
CREATE OR REPLACE FUNCTION create_invite_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Create notification for the invitee using SECURITY DEFINER
    INSERT INTO notifications (
        user_id,
        actor_id,
        type,
        entity_type,
        entity_id,
        additional_data,
        is_read,
        created_at
    ) VALUES (
        NEW.invitee_id,  -- The person receiving the invite
        NEW.inviter_id,  -- The person sending the invite
        'invite',
        'post',
        NEW.post_id,
        jsonb_build_object(
            'post_id', NEW.post_id,
            'invite_id', NEW.id,
            'post_type', (
                SELECT type FROM posts WHERE id = NEW.post_id
            ),
            'post_caption', (
                SELECT caption FROM posts WHERE id = NEW.post_id
            )
        ),
        false,
        NOW()
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to handle invite status notifications (using SECURITY DEFINER)
CREATE OR REPLACE FUNCTION create_invite_status_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create notification if status changed to accepted or declined
    IF OLD.status != NEW.status AND NEW.status IN ('accepted', 'declined') THEN
        -- Create notification for the inviter about the status change
        INSERT INTO notifications (
            user_id,
            actor_id,
            type,
            entity_type,
            entity_id,
            additional_data,
            is_read,
            created_at
        ) VALUES (
            NEW.inviter_id,  -- The person who sent the invite
            NEW.invitee_id,  -- The person who responded
            'rsvp',  -- Use rsvp type for accepted/declined responses
            'post',
            NEW.post_id,
            jsonb_build_object(
                'post_id', NEW.post_id,
                'invite_id', NEW.id,
                'status', NEW.status,
                'post_type', (
                    SELECT type FROM posts WHERE id = NEW.post_id
                ),
                'post_caption', (
                    SELECT caption FROM posts WHERE id = NEW.post_id
                )
            ),
            false,
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
CREATE TRIGGER invite_notification_trigger
    AFTER INSERT ON invites
    FOR EACH ROW
    EXECUTE FUNCTION create_invite_notification();

CREATE TRIGGER invite_status_notification_trigger
    AFTER UPDATE ON invites
    FOR EACH ROW
    EXECUTE FUNCTION create_invite_status_notification();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
