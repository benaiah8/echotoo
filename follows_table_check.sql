-- Check and fix follows table schema and RLS policies
-- Run this in Supabase SQL editor to diagnose and fix follow button issues

-- 1. Check if follows table exists and its structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'follows' 
ORDER BY ordinal_position;

-- 2. Check current RLS policies on follows table
SELECT 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM pg_policies 
WHERE tablename = 'follows';

-- 3. Check if follows table has proper indexes
SELECT 
    indexname, 
    indexdef
FROM pg_indexes 
WHERE tablename = 'follows';

-- 4. Create follows table if it doesn't exist (with proper structure)
CREATE TABLE IF NOT EXISTS follows (
    follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

-- 5. Create proper indexes for performance
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_follows_created_at ON follows(created_at DESC);

-- 6. Enable RLS on follows table
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- 7. Drop existing policies if they exist (to recreate them properly)
DROP POLICY IF EXISTS "Users can follow others" ON follows;
DROP POLICY IF EXISTS "Users can view follows" ON follows;
DROP POLICY IF EXISTS "Users can unfollow" ON follows;
DROP POLICY IF EXISTS "Users can see who follows them" ON follows;

-- 8. Create proper RLS policies for follows table

-- Policy: Users can insert follow relationships (follow someone)
CREATE POLICY "Users can follow others" ON follows
    FOR INSERT 
    WITH CHECK (
        auth.uid() IS NOT NULL 
        AND follower_id IN (
            SELECT id FROM profiles WHERE user_id = auth.uid()
        )
        AND following_id != follower_id
    );

-- Policy: Users can delete their own follow relationships (unfollow)
CREATE POLICY "Users can unfollow" ON follows
    FOR DELETE 
    USING (
        auth.uid() IS NOT NULL 
        AND follower_id IN (
            SELECT id FROM profiles WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can view who they follow (following list)
CREATE POLICY "Users can view their following" ON follows
    FOR SELECT 
    USING (
        auth.uid() IS NOT NULL 
        AND follower_id IN (
            SELECT id FROM profiles WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can view who follows them (followers list)
CREATE POLICY "Users can view their followers" ON follows
    FOR SELECT 
    USING (
        auth.uid() IS NOT NULL 
        AND following_id IN (
            SELECT id FROM profiles WHERE user_id = auth.uid()
        )
    );

-- 9. Grant necessary permissions
GRANT ALL ON follows TO authenticated;
GRANT ALL ON follows TO anon;

-- 10. Test the table structure
SELECT 'Follows table structure:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'follows';

SELECT 'RLS Policies:' as info;
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'follows';

-- 11. Test data access (replace with actual user IDs if needed)
-- This will show if RLS is working correctly
SELECT 'Testing RLS access...' as info;
