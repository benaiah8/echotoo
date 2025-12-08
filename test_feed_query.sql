-- Test query to diagnose feed loading issues
-- Run this in Supabase SQL editor to check if posts are accessible

-- 1. Check if posts table exists and has data
SELECT 
    'Posts table overview' as info,
    COUNT(*) as total_posts,
    COUNT(CASE WHEN is_anonymous = false OR is_anonymous IS NULL THEN 1 END) as public_posts,
    COUNT(CASE WHEN type = 'hangout' THEN 1 END) as hangout_posts,
    COUNT(CASE WHEN type = 'experience' THEN 1 END) as experience_posts
FROM posts;

-- 2. Check recent public posts
SELECT 
    'Recent public posts' as info,
    id,
    type,
    caption,
    is_anonymous,
    created_at,
    author_id
FROM posts 
WHERE is_anonymous IS NULL OR is_anonymous = false
ORDER BY created_at DESC 
LIMIT 5;

-- 3. Check RLS policies on posts table
SELECT 
    'RLS policies on posts' as info,
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM pg_policies 
WHERE tablename = 'posts';

-- 4. Test basic query that the app uses (without joins)
SELECT 
    'Basic posts query test' as info,
    id,
    type,
    caption,
    is_anonymous,
    created_at,
    selected_dates,
    tags,
    author_id
FROM posts 
WHERE (is_anonymous IS NULL OR is_anonymous = false)
ORDER BY created_at DESC 
LIMIT 3;

-- 5. Check if profiles table is accessible for joins
SELECT 
    'Profiles accessibility' as info,
    COUNT(*) as total_profiles
FROM profiles;

-- 6. Test the exact query structure the app uses (with profile join)
SELECT 
    'Full query test' as info,
    p.id,
    p.type,
    p.caption,
    p.is_anonymous,
    p.created_at,
    p.selected_dates,
    p.tags,
    p.author_id,
    pr.id as profile_id,
    pr.username,
    pr.display_name,
    pr.avatar_url
FROM posts p
LEFT JOIN profiles pr ON p.author_id = pr.id
WHERE (p.is_anonymous IS NULL OR p.is_anonymous = false)
ORDER BY p.created_at DESC 
LIMIT 3;
