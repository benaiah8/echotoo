-- Quick Fix for RSVP 406 Errors
-- Run this in your Supabase SQL editor

-- Drop all existing RLS policies on rsvp_responses
DROP POLICY IF EXISTS "Users can view RSVP responses for accessible posts" ON rsvp_responses;
DROP POLICY IF EXISTS "Users can insert their own RSVP responses" ON rsvp_responses;
DROP POLICY IF EXISTS "Users can update their own RSVP responses" ON rsvp_responses;
DROP POLICY IF EXISTS "Users can delete their own RSVP responses" ON rsvp_responses;
DROP POLICY IF EXISTS "Allow authenticated users to view RSVP responses" ON rsvp_responses;
DROP POLICY IF EXISTS "Allow authenticated users to insert RSVP responses" ON rsvp_responses;
DROP POLICY IF EXISTS "Allow authenticated users to update RSVP responses" ON rsvp_responses;
DROP POLICY IF EXISTS "Allow authenticated users to delete RSVP responses" ON rsvp_responses;

-- Create very simple, permissive policies
CREATE POLICY "Simple RSVP view policy" ON rsvp_responses
  FOR SELECT USING (true);

CREATE POLICY "Simple RSVP insert policy" ON rsvp_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Simple RSVP update policy" ON rsvp_responses
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Simple RSVP delete policy" ON rsvp_responses
  FOR DELETE USING (auth.uid() = user_id);

-- Verify policies are created
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'rsvp_responses';
