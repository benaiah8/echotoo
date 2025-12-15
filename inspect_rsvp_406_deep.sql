-- ============================================
-- READ-ONLY QUERIES: Deep RSVP 406 Error Diagnosis
-- ============================================
-- Purpose: Understand why RSVP queries are returning 406 errors
-- All queries are SAFE - they only read data
-- Run these ONE AT A TIME to see results clearly
-- ============================================

-- QUERY 1: Check RLS policies in detail (most likely cause of 406)
-- Run this FIRST - it shows what policies are active
SELECT 
    'RLS Policies Detail' as info,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd as command_type,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'rsvp_responses'
ORDER BY policyname;

-- QUERY 2: Check if RLS is actually enabled (should be true)
SELECT 
    'RLS Enabled Status' as info,
    tablename,
    rowsecurity as rls_enabled,
    CASE 
        WHEN rowsecurity THEN 'RLS is ENABLED - policies will be enforced'
        ELSE 'RLS is DISABLED - all rows visible'
    END as status_note
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'rsvp_responses';

-- QUERY 3: Test query pattern that matches frontend (exact pattern from dataCache.ts)
-- This simulates: SELECT id, user_id, status FROM rsvp_responses WHERE post_id = ? AND status = 'going'
SELECT 
    'Test Query - Frontend Pattern' as info,
    id,
    user_id,
    status,
    post_id,
    created_at
FROM rsvp_responses
WHERE post_id IN (SELECT post_id FROM rsvp_responses LIMIT 3)
  AND status = 'going'
ORDER BY created_at DESC
LIMIT 10;

-- QUERY 4: Check what status values actually exist (might be case-sensitive issue)
SELECT 
    'Status Values Analysis' as info,
    status,
    COUNT(*) as count,
    LENGTH(status::text) as status_length,
    ascii(status) as first_char_ascii
FROM rsvp_responses
GROUP BY status
ORDER BY count DESC;

-- QUERY 5: Check for any special characters or whitespace in status values
SELECT 
    'Status Value Details' as info,
    status,
    COUNT(*) as count,
    status = 'going' as matches_going_exact,
    status = 'Going' as matches_going_capitalized,
    LOWER(status) = 'going' as matches_going_lowercase,
    TRIM(status) = 'going' as matches_going_trimmed
FROM rsvp_responses
GROUP BY status
ORDER BY count DESC;

-- QUERY 6: Test the exact query that RSVPComponent uses (with maybeSingle)
-- Pattern: SELECT status FROM rsvp_responses WHERE post_id = ? AND user_id = ?
SELECT 
    'Test Query - RSVPComponent Pattern' as info,
    post_id,
    user_id,
    status
FROM rsvp_responses
WHERE post_id IN (SELECT post_id FROM rsvp_responses LIMIT 1)
  AND user_id IN (SELECT user_id FROM rsvp_responses LIMIT 1)
LIMIT 1;

-- QUERY 7: Check if there are any foreign key constraints that might affect queries
SELECT
    'Foreign Key Constraints' as info,
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition,
    confrelid::regclass as referenced_table
FROM pg_constraint
WHERE conrelid = 'rsvp_responses'::regclass
  AND contype = 'f'
ORDER BY conname;

-- QUERY 8: Check table permissions for authenticated users
-- This shows what operations are allowed
SELECT 
    'Table Permissions' as info,
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges
WHERE table_name = 'rsvp_responses'
  AND table_schema = 'public'
ORDER BY grantee, privilege_type;

-- QUERY 9: Check column-level permissions (might be blocking specific columns)
SELECT 
    'Column Permissions' as info,
    grantee,
    column_name,
    privilege_type
FROM information_schema.column_privileges
WHERE table_name = 'rsvp_responses'
  AND table_schema = 'public'
  AND column_name IN ('id', 'user_id', 'status', 'post_id')
ORDER BY grantee, column_name, privilege_type;

-- QUERY 10: Check if there are any views that might be interfering
SELECT 
    'Related Views' as info,
    table_name as view_name,
    view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND (view_definition LIKE '%rsvp_responses%' OR table_name LIKE '%rsvp%')
ORDER BY table_name;

-- QUERY 11: Test query with explicit column selection (what Supabase REST API does)
-- This is the exact pattern Supabase uses: SELECT "id", "user_id", "status" FROM rsvp_responses
SELECT 
    'Test Query - Explicit Columns' as info,
    "id",
    "user_id",
    "status"
FROM rsvp_responses
WHERE post_id IN (SELECT post_id FROM rsvp_responses LIMIT 1)
LIMIT 5;

-- QUERY 12: Check for any triggers that might be modifying data during SELECT
SELECT 
    'Triggers on Table' as info,
    trigger_name,
    event_manipulation as event_type,
    action_timing as timing,
    action_statement,
    action_orientation
FROM information_schema.triggers
WHERE event_object_table = 'rsvp_responses'
  AND event_object_schema = 'public'
ORDER BY trigger_name;

-- QUERY 13: Check if there's a mismatch in data types that could cause 406
-- 406 often means "Not Acceptable" - could be content-type or data format issue
SELECT 
    'Column Data Types' as info,
    column_name,
    data_type,
    udt_name as underlying_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'rsvp_responses'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- QUERY 14: Test with different status values to see if specific ones fail
SELECT 
    'Status Distribution by Post' as info,
    post_id,
    status,
    COUNT(*) as count
FROM rsvp_responses
GROUP BY post_id, status
ORDER BY post_id, status;

-- QUERY 15: Check if there are any indexes that might affect query performance/format
SELECT 
    'Indexes on Table' as info,
    indexname,
    indexdef,
    CASE 
        WHEN indexdef LIKE '%UNIQUE%' THEN 'UNIQUE'
        WHEN indexdef LIKE '%PRIMARY%' THEN 'PRIMARY KEY'
        ELSE 'REGULAR'
    END as index_type
FROM pg_indexes
WHERE tablename = 'rsvp_responses'
  AND schemaname = 'public'
ORDER BY indexname;
