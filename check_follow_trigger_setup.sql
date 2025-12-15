-- ============================================
-- READ-ONLY QUERY: Check Follow Trigger Setup
-- ============================================
-- Purpose: Check the current state of the follow notification trigger
-- This query is SAFE - it only reads data, does NOT modify anything
-- Run this in Supabase SQL Editor to check the trigger configuration
-- ============================================

-- 1. Check if the trigger exists on the follows table
SELECT 
    'Trigger Check' as info,
    trigger_name,
    event_object_table as table_name,
    event_manipulation as event_type,
    action_timing as timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'follows'
  AND trigger_name LIKE '%notify%';

-- 2. Check the trigger function definition (if trigger exists)
SELECT 
    'Trigger Function Definition' as info,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'notify_follow'
  AND n.nspname = 'public';

-- 3. Check the follows table structure (to understand what columns are available)
SELECT 
    'Follows Table Structure' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'follows'
ORDER BY ordinal_position;

-- 4. Check recent follow notifications created by trigger vs manual
-- This helps identify if duplicates are being created
SELECT 
    'Recent Follow Notifications' as info,
    n.id,
    n.type,
    n.entity_type,
    n.created_at,
    n.additional_data->>'follow_request_status' as follow_request_status,
    CASE 
        WHEN n.additional_data->>'follow_request_status' IS NOT NULL 
        THEN 'Manual (has follow_request_status)'
        ELSE 'Possible Trigger (no follow_request_status)'
    END as notification_source,
    p1.display_name as actor_name,
    p2.display_name as target_name
FROM notifications n
LEFT JOIN profiles p1 ON p1.user_id = n.actor_id
LEFT JOIN profiles p2 ON p2.user_id = n.user_id
WHERE n.type = 'follow'
  AND n.created_at > NOW() - INTERVAL '7 days'
ORDER BY n.created_at DESC
LIMIT 20;

-- 5. Check if there are duplicate follow notifications (same actor, same target, close timestamps)
SELECT 
    'Potential Duplicate Notifications' as info,
    n1.id as notification1_id,
    n2.id as notification2_id,
    n1.actor_id,
    n1.user_id,
    n1.created_at as notification1_created,
    n2.created_at as notification2_created,
    ABS(EXTRACT(EPOCH FROM (n1.created_at - n2.created_at))) as seconds_apart,
    n1.additional_data->>'follow_request_status' as notification1_status,
    n2.additional_data->>'follow_request_status' as notification2_status
FROM notifications n1
JOIN notifications n2 
    ON n1.actor_id = n2.actor_id 
    AND n1.user_id = n2.user_id
    AND n1.type = 'follow'
    AND n2.type = 'follow'
    AND n1.id < n2.id
    AND ABS(EXTRACT(EPOCH FROM (n1.created_at - n2.created_at))) < 5
    AND n1.created_at > NOW() - INTERVAL '7 days'
ORDER BY n1.created_at DESC
LIMIT 20;

-- 6. Check recent follows and their status (pending vs approved)
SELECT 
    'Recent Follows Status' as info,
    f.follower_id,
    f.following_id,
    f.status,
    f.created_at,
    p1.display_name as follower_name,
    p2.display_name as following_name,
    p2.is_private as account_is_private
FROM follows f
LEFT JOIN profiles p1 ON p1.id = f.follower_id
LEFT JOIN profiles p2 ON p2.id = f.following_id
WHERE f.created_at > NOW() - INTERVAL '7 days'
ORDER BY f.created_at DESC
LIMIT 20;

