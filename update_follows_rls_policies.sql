-- ============================================
-- UPDATE RLS POLICIES FOR FOLLOWS TABLE
-- Adds UPDATE policy for follow request status changes
-- Safe to run multiple times (idempotent)
-- ============================================

-- ============================================
-- STEP 1: Check current RLS policies
-- ============================================

SELECT 
    'Current RLS policies on follows table:' as info,
    policyname, 
    cmd,
    permissive,
    roles
FROM pg_policies 
WHERE tablename = 'follows'
ORDER BY policyname;

-- ============================================
-- STEP 2: Add UPDATE policy for status changes
-- ============================================

-- Drop policy if it exists (for idempotency)
DROP POLICY IF EXISTS "Account owners can update follow status" ON follows;

-- Policy: Account owners can UPDATE follow status (approve/decline/remove followers)
-- This allows:
-- - Approving pending follow requests (status: pending -> approved)
-- - Declining follow requests (status: pending -> declined)
-- - Removing followers (status: approved -> declined)
-- Only works for follows where the current user is being followed (following_id)
CREATE POLICY "Account owners can update follow status"
ON follows
FOR UPDATE
TO authenticated
USING (
    auth.uid() IS NOT NULL 
    AND following_id IN (
        SELECT id FROM profiles WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    auth.uid() IS NOT NULL 
    AND following_id IN (
        SELECT id FROM profiles WHERE user_id = auth.uid()
    )
    AND status IN ('pending', 'approved', 'declined')
);

-- ============================================
-- STEP 3: Verification
-- ============================================

-- Verify the new policy was created
SELECT 
    'Verification: Updated RLS policies on follows table:' as info,
    policyname, 
    cmd,
    permissive,
    roles
FROM pg_policies 
WHERE tablename = 'follows'
ORDER BY policyname;

-- Summary
SELECT 
    'RLS policy update completed!' as status,
    COUNT(*) as total_policies
FROM pg_policies 
WHERE tablename = 'follows';

