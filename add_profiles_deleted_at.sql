-- Migration: Add deleted_at column to profiles table for soft account deletion
-- Run this in Supabase SQL Editor before deploying frontend changes
-- Safe: uses IF NOT EXISTS patterns, can be run multiple times

-- Add deleted_at column (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE profiles ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- Index to support active-profile lookups (WHERE deleted_at IS NULL)
-- Covers getProfileByUserId, getProfilesByUserIds, and similar filters
CREATE INDEX IF NOT EXISTS idx_profiles_active_user_id ON profiles(user_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN profiles.deleted_at IS 'When set, profile is soft-deleted; exclude from queries with deleted_at IS NULL';
