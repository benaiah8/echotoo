-- Fix RSVP 406 Errors - Simplified RLS Policies
-- Run this in your Supabase SQL editor to fix the 406 Not Acceptable errors

-- ========================================
-- DIAGNOSTIC QUERIES (Run these first)
-- ========================================

-- Check current RLS policies on rsvp_responses table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'rsvp_responses';

-- Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE tablename = 'rsvp_responses';

-- Test current user authentication
SELECT auth.uid() as current_user_id;

-- ========================================
-- FIX RLS POLICIES (Run these to fix)
-- ========================================

-- Drop all existing RLS policies on rsvp_responses to start fresh
DROP POLICY IF EXISTS "Users can view RSVP responses for accessible posts" ON rsvp_responses;
DROP POLICY IF EXISTS "Users can insert their own RSVP responses" ON rsvp_responses;
DROP POLICY IF EXISTS "Users can update their own RSVP responses" ON rsvp_responses;
DROP POLICY IF EXISTS "Users can delete their own RSVP responses" ON rsvp_responses;

-- Create very permissive policies for testing (we can tighten these later)
-- Allow all authenticated users to view RSVP responses
CREATE POLICY "Allow authenticated users to view RSVP responses" ON rsvp_responses
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Allow authenticated users to insert their own RSVP responses
CREATE POLICY "Allow authenticated users to insert RSVP responses" ON rsvp_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to update their own RSVP responses
CREATE POLICY "Allow authenticated users to update RSVP responses" ON rsvp_responses
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to delete their own RSVP responses
CREATE POLICY "Allow authenticated users to delete RSVP responses" ON rsvp_responses
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- VERIFICATION QUERIES (Run these to test)
-- ========================================

-- Test inserting an RSVP response (replace with actual post_id and user_id)
-- This should work without 406 errors
-- SELECT auth.uid() as current_user_id;

-- Check that policies are now in place
SELECT 
  policyname,
  cmd,
  permissive,
  roles
FROM pg_policies 
WHERE tablename = 'rsvp_responses'
ORDER BY policyname;

-- ========================================
-- ALTERNATIVE: TEMPORARILY DISABLE RLS (Use only if above doesn't work)
-- ========================================

-- If the above policies still cause issues, you can temporarily disable RLS:
-- ALTER TABLE rsvp_responses DISABLE ROW LEVEL SECURITY;

-- To re-enable RLS later:
-- ALTER TABLE rsvp_responses ENABLE ROW LEVEL SECURITY;
