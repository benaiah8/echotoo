-- Fix the notify_follow trigger that's causing the follow function to fail
-- The trigger is trying to access NEW.id which doesn't exist in the follows table

-- 1. First, let's see the current trigger definition
SELECT 
    'Current notify_follow trigger' as info,
    trigger_name, 
    event_manipulation, 
    action_statement,
    action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'follows' 
  AND trigger_name LIKE '%notify%';

-- 2. Drop the problematic trigger
DROP TRIGGER IF EXISTS trigger_notify_follow ON follows;

-- 3. Fix the notify_follow function to not use NEW.id
CREATE OR REPLACE FUNCTION notify_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id UUID;
  follower_user_id UUID;
BEGIN
  -- Get the user_id for the person being followed (following_id is a profile_id)
  SELECT user_id INTO target_user_id
  FROM profiles 
  WHERE id = NEW.following_id;
  
  -- Get the user_id for the person following (follower_id is a profile_id) 
  SELECT user_id INTO follower_user_id
  FROM profiles 
  WHERE id = NEW.follower_id;

  -- Only create notification if both user_ids are found
  IF target_user_id IS NOT NULL AND follower_user_id IS NOT NULL THEN
    -- Create notification for the user being followed
    PERFORM create_notification(
      target_user_id,    -- p_user_id: The user being followed (auth.users.id)
      follower_user_id,  -- p_actor_id: The user who is following (auth.users.id)
      'follow',
      'post',            -- p_entity_type: Using 'post' as entity_type for follows
      NEW.follower_id    -- p_entity_id: Use follower_id as entity_id instead of NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Recreate the trigger with the fixed function
CREATE TRIGGER trigger_notify_follow
    AFTER INSERT ON follows
    FOR EACH ROW
    EXECUTE FUNCTION notify_follow();

-- 5. Verify the trigger was created correctly
SELECT 
    'Updated notify_follow trigger' as info,
    trigger_name, 
    event_manipulation, 
    action_statement,
    action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'follows' 
  AND trigger_name LIKE '%notify%';

-- 6. Test the function definition
SELECT 
    'Updated notify_follow function' as info,
    routine_name,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'notify_follow'
  AND routine_type = 'FUNCTION';
