-- Fix the follows table trigger issue causing "record 'new' has no field 'id'" error
-- Run this in Supabase SQL editor

-- 1. Check if there are any triggers on the follows table
SELECT 
    'Triggers on follows table' as info,
    trigger_name, 
    event_manipulation, 
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'follows';

-- 2. Check the current follows table structure to confirm no 'id' column
SELECT 
    'Follows table columns' as info,
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'follows' 
ORDER BY ordinal_position;

-- 3. Look for any notification triggers that might be causing the issue
-- These triggers often try to access NEW.id when they should access the composite key
SELECT 
    'Notification triggers' as info,
    trigger_name,
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE action_statement LIKE '%notify%' 
   OR action_statement LIKE '%notification%';

-- 4. If there's a problematic trigger, we'll need to see its definition
-- This will help identify which trigger is trying to access NEW.id

-- 5. Alternative: Try to create a proper insert without issues
-- Test insert (comment out if you don't want to actually insert)
/*
INSERT INTO follows (follower_id, following_id) 
VALUES (
    (SELECT id FROM profiles LIMIT 1), -- Replace with actual profile ID
    (SELECT id FROM profiles LIMIT 1)  -- Replace with actual profile ID
) ON CONFLICT (follower_id, following_id) DO NOTHING;
*/

-- 6. Check if there are any functions that might be causing issues
SELECT 
    'Functions that reference follows table' as info,
    routine_name,
    routine_definition
FROM information_schema.routines 
WHERE routine_definition LIKE '%follows%' 
  AND routine_type = 'FUNCTION';
