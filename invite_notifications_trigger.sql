-- Migration to add invite notifications trigger
-- This script creates a trigger that automatically creates notifications when invites are sent

-- Create function to handle invite notifications
CREATE OR REPLACE FUNCTION create_invite_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Create notification for the invitee
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
$$ LANGUAGE plpgsql;

-- Create trigger to fire when invites are inserted
DROP TRIGGER IF EXISTS invite_notification_trigger ON invites;
CREATE TRIGGER invite_notification_trigger
    AFTER INSERT ON invites
    FOR EACH ROW
    EXECUTE FUNCTION create_invite_notification();

-- Also create notifications for invite status updates (accepted/declined)
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
$$ LANGUAGE plpgsql;

-- Create trigger for invite status updates
DROP TRIGGER IF EXISTS invite_status_notification_trigger ON invites;
CREATE TRIGGER invite_status_notification_trigger
    AFTER UPDATE ON invites
    FOR EACH ROW
    EXECUTE FUNCTION create_invite_status_notification();
