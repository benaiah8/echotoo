-- Migration: Add anonymous_name and anonymous_avatar columns to posts table
-- This migration adds support for anonymous posting with custom names and avatars
-- Safe version that checks if columns exist before adding them

-- Add anonymous_name column to posts table (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'posts' AND column_name = 'anonymous_name'
    ) THEN
        ALTER TABLE posts ADD COLUMN anonymous_name TEXT;
    END IF;
END $$;

-- Add anonymous_avatar column to posts table (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'posts' AND column_name = 'anonymous_avatar'
    ) THEN
        ALTER TABLE posts ADD COLUMN anonymous_avatar TEXT;
    END IF;
END $$;

-- Add comments to explain the columns (safe to run multiple times)
COMMENT ON COLUMN posts.anonymous_name IS 'Custom name displayed for anonymous posts instead of username';
COMMENT ON COLUMN posts.anonymous_avatar IS 'Custom avatar (letter/number/emoji) displayed for anonymous posts instead of profile picture';

-- Create indexes for better query performance when filtering anonymous posts (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_posts_anonymous_name ON posts(anonymous_name) WHERE anonymous_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_anonymous_avatar ON posts(anonymous_avatar) WHERE anonymous_avatar IS NOT NULL;

-- Update existing anonymous posts to have NULL anonymous_name and anonymous_avatar (they will show as "Anonymous" or similar)
-- This is safe since existing anonymous posts don't have custom names/avatars
UPDATE posts 
SET anonymous_name = NULL, anonymous_avatar = NULL
WHERE is_anonymous = true AND (anonymous_name IS NULL OR anonymous_avatar IS NULL);
