-- ============================================
-- FOCUSED QUERIES: Check Trigger vs Manual Notifications
-- ============================================
-- Run these queries to identify if the trigger is creating duplicate notifications
-- All queries are READ-ONLY and safe
-- ============================================

-- QUERY 1: Check if the follow notification trigger exists
SELECT 
    'Trigger Check' as info,
    trigger_name,
    event_object_table as table_name,
    event_manipulation as event_type,
    action_timing as timing
FROM information_schema.triggers 
WHERE event_object_table = 'follows'
  AND trigger_name LIKE '%notify%';

-- QUERY 2: Get recent follow notifications and identify their source
-- This will show if notifications have follow_request_status (manual) or not (trigger)
SELECT 
    n.id,
    n.type,
    n.entity_type,
    n.created_at,
    n.additional_data->>'follow_request_status' as follow_request_status,
    CASE 
        WHEN n.additional_data->>'follow_request_status' IS NOT NULL 
        THEN 'Manual (has follow_request_status)'
        ELSE '⚠️ Possible Trigger (no follow_request_status)'
    END as notification_source,
    (SELECT display_name FROM profiles WHERE user_id = n.actor_id) as actor_name,
    (SELECT display_name FROM profiles WHERE user_id = n.user_id) as target_name
FROM notifications n
WHERE n.type = 'follow'
  AND n.created_at > NOW() - INTERVAL '7 days'
ORDER BY n.created_at DESC
LIMIT 30;

-- QUERY 3: Check for duplicate notifications (same actor, same target, within 5 seconds)
-- This helps identify if trigger is creating duplicates alongside manual notifications
SELECT 
    n1.id as notification1_id,
    n2.id as notification2_id,
    n1.actor_id,
    n1.user_id,
    n1.created_at as notification1_created,
    n2.created_at as notification2_created,
    ABS(EXTRACT(EPOCH FROM (n1.created_at - n2.created_at))) as seconds_apart,
    n1.additional_data->>'follow_request_status' as notification1_status,
    n2.additional_data->>'follow_request_status' as notification2_status,
    CASE 
        WHEN n1.additional_data->>'follow_request_status' IS NOT NULL 
        THEN 'Manual'
        ELSE 'Trigger'
    END as notification1_source,
    CASE 
        WHEN n2.additional_data->>'follow_request_status' IS NOT NULL 
        THEN 'Manual'
        ELSE 'Trigger'
    END as notification2_source
FROM notifications n1
JOIN notifications n2 
    ON n1.actor_id = n2.actor_id 
    AND n1.user_id = n2.user_id
    AND n1.type = 'follow'
    AND n2.type = 'follow'
    AND n1.id < n2.id
    AND ABS(EXTRACT(EPOCH FROM (n1.created_at - n2.created_at))) < 10
    AND n1.created_at > NOW() - INTERVAL '7 days'
ORDER BY n1.created_at DESC
LIMIT 30;

