-- ============================================
-- PRIVATE ACCOUNTS MIGRATION
-- Safe migration for adding privacy features
-- This script is idempotent - safe to run multiple times
-- ============================================

-- ============================================
-- STEP 1: Add privacy columns to profiles table
-- ============================================

-- Check current profiles table structure first (for verification)
SELECT 
    'Current profiles table columns:' as info,
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;

-- Add is_private column (defaults to FALSE - all accounts public by default)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE NOT NULL;

-- Add social_media_public column (defaults to FALSE - social media hidden when private by default)
-- Note: This only matters when is_private is TRUE
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS social_media_public BOOLEAN DEFAULT FALSE NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN profiles.is_private IS 'Whether the account is private (requires approval to see posts)';
COMMENT ON COLUMN profiles.social_media_public IS 'Whether social media links are visible publicly even when account is private';

-- Verify columns were added
SELECT 
    'Verification: New columns added:' as info,
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('is_private', 'social_media_public');

-- ============================================
-- STEP 2: Add status column to follows table
-- ============================================

-- Check current follows table structure first (for verification)
SELECT 
    'Current follows table columns:' as info,
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'follows' 
ORDER BY ordinal_position;

-- Add status column to follows table
-- Default is 'approved' to maintain existing behavior (all current follows are approved)
ALTER TABLE follows 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved' NOT NULL;

-- Add CHECK constraint to ensure only valid status values
-- Note: We check if constraint exists first to avoid errors
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'follows_status_check'
    ) THEN
        ALTER TABLE follows 
        ADD CONSTRAINT follows_status_check 
        CHECK (status IN ('pending', 'approved', 'declined'));
    END IF;
END $$;

-- Update all existing follows to 'approved' status (they're already approved)
-- This ensures existing data is consistent
UPDATE follows 
SET status = 'approved' 
WHERE status IS NULL OR status = '';

-- Add comment for documentation
COMMENT ON COLUMN follows.status IS 'Follow request status: pending (awaiting approval), approved (can see content), declined (removed/denied)';

-- Verify column was added
SELECT 
    'Verification: New column added to follows:' as info,
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'follows' 
AND column_name = 'status';

-- ============================================
-- STEP 3: Create index for performance
-- ============================================

-- Create index on status column for faster queries
CREATE INDEX IF NOT EXISTS idx_follows_status ON follows(status);

-- Create composite index for common queries (checking if user is approved follower)
CREATE INDEX IF NOT EXISTS idx_follows_following_status ON follows(following_id, status) 
WHERE status = 'approved';

-- ============================================
-- STEP 4: Verification queries
-- ============================================

-- Verify all existing follows are marked as approved
SELECT 
    'Verification: Follow status distribution:' as info,
    status,
    COUNT(*) as count
FROM follows
GROUP BY status;

-- Verify all profiles have privacy settings (should all be FALSE by default)
SELECT 
    'Verification: Privacy settings distribution:' as info,
    is_private,
    COUNT(*) as count
FROM profiles
GROUP BY is_private;

-- Final summary
SELECT 
    'Migration completed successfully!' as status,
    (SELECT COUNT(*) FROM profiles WHERE is_private = TRUE) as private_accounts,
    (SELECT COUNT(*) FROM profiles WHERE is_private = FALSE) as public_accounts,
    (SELECT COUNT(*) FROM follows WHERE status = 'approved') as approved_follows,
    (SELECT COUNT(*) FROM follows WHERE status = 'pending') as pending_follows,
    (SELECT COUNT(*) FROM follows WHERE status = 'declined') as declined_follows;

