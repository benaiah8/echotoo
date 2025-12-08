-- Fix Older Accounts Data Migration Script
-- Run this in your Supabase SQL editor to fix data inconsistencies for older accounts

-- ========================================
-- 1. DIAGNOSTIC QUERIES (Run these first to see what's wrong)
-- ========================================

-- Check for profiles without user_id
SELECT 
  id, 
  username, 
  display_name, 
  user_id,
  created_at
FROM profiles 
WHERE user_id IS NULL 
ORDER BY created_at ASC;

-- Check for auth users without profiles
SELECT 
  au.id as auth_user_id,
  au.email,
  au.created_at as auth_created_at,
  p.id as profile_id,
  p.username,
  p.created_at as profile_created_at
FROM auth.users au
LEFT JOIN profiles p ON p.user_id = au.id
WHERE p.id IS NULL
ORDER BY au.created_at ASC;

-- Check for profiles with invalid user_id references
SELECT 
  p.id as profile_id,
  p.username,
  p.user_id,
  au.id as auth_user_id,
  au.email
FROM profiles p
LEFT JOIN auth.users au ON au.id = p.user_id
WHERE p.user_id IS NOT NULL AND au.id IS NULL
ORDER BY p.created_at ASC;

-- ========================================
-- 2. DATA FIXES (Run these to fix the issues)
-- ========================================

-- Fix profiles that have user_id but it doesn't match any auth user
-- This can happen if auth users were deleted but profiles remained
-- NOTE: We can't set user_id to NULL if it has NOT NULL constraint
-- Instead, we'll delete these orphaned profiles
DELETE FROM profiles 
WHERE user_id IS NOT NULL 
  AND user_id NOT IN (SELECT id FROM auth.users);

-- Create missing profiles for auth users who don't have profiles
-- This creates basic profiles for older auth users
INSERT INTO profiles (user_id, username, display_name, avatar_url, bio, created_at, updated_at)
SELECT 
  au.id,
  COALESCE(au.email, 'user_' || substr(au.id::text, 1, 8)) as username,
  COALESCE(au.email, 'User') as display_name,
  NULL as avatar_url,
  NULL as bio,
  au.created_at,
  NOW() as updated_at
FROM auth.users au
LEFT JOIN profiles p ON p.user_id = au.id
WHERE p.id IS NULL;

-- NOTE: Since user_id has NOT NULL constraint, we can't have profiles with NULL user_id
-- If there are profiles without valid user_id, we need to either:
-- 1. Delete them, or 
-- 2. Create a dummy auth user for them

-- First, let's see if there are any profiles with NULL user_id
-- (This should return 0 rows if the constraint is working)
SELECT COUNT(*) as profiles_with_null_user_id FROM profiles WHERE user_id IS NULL;

-- If there are profiles with NULL user_id, we need to handle them differently
-- For now, let's skip the UPDATE operations since they would violate the constraint

-- ========================================
-- 3. ADD MISSING COLUMNS FOR OLDER ACCOUNTS
-- ========================================

-- Ensure all required columns exist with proper defaults
-- NOTE: user_id column already exists with NOT NULL constraint
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS instagram_url TEXT,
ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
ADD COLUMN IF NOT EXISTS telegram_url TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ========================================
-- 4. SET PROPER DEFAULTS FOR OLDER ACCOUNTS
-- ========================================

-- Set default usernames for profiles that don't have them
UPDATE profiles 
SET username = COALESCE(username, 'user_' || substr(id::text, 1, 8))
WHERE username IS NULL OR username = '';

-- Set default display names for profiles that don't have them
UPDATE profiles 
SET display_name = COALESCE(display_name, 'User')
WHERE display_name IS NULL OR display_name = '';

-- Set created_at for profiles that don't have it
UPDATE profiles 
SET created_at = COALESCE(created_at, NOW())
WHERE created_at IS NULL;

-- Set updated_at for profiles that don't have it
UPDATE profiles 
SET updated_at = COALESCE(updated_at, NOW())
WHERE updated_at IS NULL;

-- ========================================
-- 5. CREATE INDEXES FOR BETTER PERFORMANCE
-- ========================================

-- Create index on user_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- Create unique index on user_id to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id_unique ON profiles(user_id);

-- ========================================
-- 6. FINAL VERIFICATION QUERIES
-- ========================================

-- Check that all auth users now have profiles
SELECT 
  COUNT(*) as auth_users_without_profiles
FROM auth.users au
LEFT JOIN profiles p ON p.user_id = au.id
WHERE p.id IS NULL;

-- Check that all profiles now have valid user_id
SELECT 
  COUNT(*) as profiles_without_user_id
FROM profiles 
WHERE user_id IS NULL;

-- Check for any remaining data inconsistencies
SELECT 
  COUNT(*) as profiles_with_invalid_user_id
FROM profiles p
LEFT JOIN auth.users au ON au.id = p.user_id
WHERE p.user_id IS NOT NULL AND au.id IS NULL;

-- Show summary of fixed accounts
SELECT 
  'Total Auth Users' as metric,
  COUNT(*) as count
FROM auth.users
UNION ALL
SELECT 
  'Total Profiles' as metric,
  COUNT(*) as count
FROM profiles
UNION ALL
SELECT 
  'Profiles with Valid User ID' as metric,
  COUNT(*) as count
FROM profiles p
JOIN auth.users au ON au.id = p.user_id;
