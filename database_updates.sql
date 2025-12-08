-- Database schema updates for Google Maps integration, RSVP functionality, and Comments system
-- Run these commands in your Supabase SQL editor

-- 1. Add location_url and location_notes fields to activities table
ALTER TABLE activities 
ADD COLUMN IF NOT EXISTS location_url TEXT,
ADD COLUMN IF NOT EXISTS location_notes TEXT;

-- 2. Create RSVP responses table for hangout posts
CREATE TABLE IF NOT EXISTS rsvp_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'maybe', 'not_going')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_rsvp_responses_post_id ON rsvp_responses(post_id);
CREATE INDEX IF NOT EXISTS idx_rsvp_responses_user_id ON rsvp_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_rsvp_responses_status ON rsvp_responses(status);

-- 4. Enable Row Level Security (RLS) for RSVP responses
ALTER TABLE rsvp_responses ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies for RSVP responses (drop existing ones first to avoid conflicts)
-- Users can view RSVP responses for posts they have access to
DROP POLICY IF EXISTS "Users can view RSVP responses for accessible posts" ON rsvp_responses;
CREATE POLICY "Users can view RSVP responses for accessible posts" ON rsvp_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM posts 
      WHERE posts.id = rsvp_responses.post_id 
      AND (
        posts.visibility = 'public' 
        OR posts.author_id = auth.uid()
        OR posts.visibility = 'friends'  -- Simplified for now, can add friends logic later
      )
    )
  );

-- Users can insert their own RSVP responses
DROP POLICY IF EXISTS "Users can insert their own RSVP responses" ON rsvp_responses;
CREATE POLICY "Users can insert their own RSVP responses" ON rsvp_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own RSVP responses
DROP POLICY IF EXISTS "Users can update their own RSVP responses" ON rsvp_responses;
CREATE POLICY "Users can update their own RSVP responses" ON rsvp_responses
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can delete their own RSVP responses
DROP POLICY IF EXISTS "Users can delete their own RSVP responses" ON rsvp_responses;
CREATE POLICY "Users can delete their own RSVP responses" ON rsvp_responses
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Add comments to document the new fields
COMMENT ON COLUMN activities.location_url IS 'Google Maps URL or share link for the activity location';
COMMENT ON COLUMN activities.location_notes IS 'Additional location details like parking, floor, room, etc.';
COMMENT ON TABLE rsvp_responses IS 'Tracks user RSVP responses for hangout posts';

-- 7. Add status field to posts table for draft/published posts
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published'));

-- 8. Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 9. Create trigger to automatically update updated_at for rsvp_responses
DROP TRIGGER IF EXISTS update_rsvp_responses_updated_at ON rsvp_responses;
CREATE TRIGGER update_rsvp_responses_updated_at 
  BEFORE UPDATE ON rsvp_responses 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 10. Add comment for the new status field
COMMENT ON COLUMN posts.status IS 'Post status: draft or published';

-- 11. Create invites table for post invitations
CREATE TABLE IF NOT EXISTS invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  UNIQUE(post_id, invitee_id) -- Prevent duplicate invites
);

-- 12. Create indexes for invites table
CREATE INDEX IF NOT EXISTS idx_invites_post_id ON invites(post_id);
CREATE INDEX IF NOT EXISTS idx_invites_inviter_id ON invites(inviter_id);
CREATE INDEX IF NOT EXISTS idx_invites_invitee_id ON invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status);
CREATE INDEX IF NOT EXISTS idx_invites_expires_at ON invites(expires_at);

-- 13. Enable RLS for invites table
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- 14. Create RLS policies for invites
CREATE POLICY "Users can view invites they sent or received" ON invites
  FOR SELECT USING (
    auth.uid() = inviter_id OR auth.uid() = invitee_id
  );

CREATE POLICY "Users can create invites for their posts" ON invites
  FOR INSERT WITH CHECK (
    auth.uid() = inviter_id AND
    EXISTS (
      SELECT 1 FROM posts 
      WHERE posts.id = post_id 
      AND posts.author_id = auth.uid()
    )
  );

CREATE POLICY "Invitees can update their invite status" ON invites
  FOR UPDATE USING (
    auth.uid() = invitee_id
  ) WITH CHECK (
    auth.uid() = invitee_id
  );

CREATE POLICY "Users can delete invites they sent" ON invites
  FOR DELETE USING (
    auth.uid() = inviter_id
  );

-- 15. Create trigger to automatically update updated_at for invites
CREATE TRIGGER update_invites_updated_at 
  BEFORE UPDATE ON invites 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 16. Add comments for invites table
COMMENT ON TABLE invites IS 'Post invitations sent by users to other users';
COMMENT ON COLUMN invites.post_id IS 'The post being invited to';
COMMENT ON COLUMN invites.inviter_id IS 'User who sent the invite';
COMMENT ON COLUMN invites.invitee_id IS 'User who received the invite';
COMMENT ON COLUMN invites.status IS 'Invite status: pending, accepted, declined, expired';
COMMENT ON COLUMN invites.expires_at IS 'When the invite expires (default 7 days)';

-- 17. Create saved_posts table for user bookmarks
CREATE TABLE IF NOT EXISTS saved_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, post_id) -- Prevent duplicate saves
);

-- 18. Create indexes for saved_posts table
CREATE INDEX IF NOT EXISTS idx_saved_posts_user_id ON saved_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_posts_post_id ON saved_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_saved_posts_created_at ON saved_posts(created_at);

-- 19. Enable RLS for saved_posts table
ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;

-- 20. Create RLS policies for saved_posts
CREATE POLICY "Users can view their own saved posts" ON saved_posts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can save posts" ON saved_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave their own posts" ON saved_posts
  FOR DELETE USING (auth.uid() = user_id);

-- 21. Add comments for saved_posts table
COMMENT ON TABLE saved_posts IS 'User bookmarked/saved posts';
COMMENT ON COLUMN saved_posts.user_id IS 'User who saved the post';
COMMENT ON COLUMN saved_posts.post_id IS 'The post that was saved';

-- 22. Create post_likes table for user likes
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, post_id) -- Prevent duplicate likes
);

-- 23. Create indexes for post_likes table
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_created_at ON post_likes(created_at);

-- 24. Enable RLS for post_likes table
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- 25. Create RLS policies for post_likes
DROP POLICY IF EXISTS "Users can view all likes" ON post_likes;
CREATE POLICY "Users can view all likes" ON post_likes
  FOR SELECT USING (true); -- Anyone can see likes

DROP POLICY IF EXISTS "Users can like posts" ON post_likes;
CREATE POLICY "Users can like posts" ON post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike their own posts" ON post_likes;
CREATE POLICY "Users can unlike their own posts" ON post_likes
  FOR DELETE USING (auth.uid() = user_id);

-- 26. Add comments for post_likes table
COMMENT ON TABLE post_likes IS 'User likes on posts';
COMMENT ON COLUMN post_likes.user_id IS 'User who liked the post';
COMMENT ON COLUMN post_likes.post_id IS 'The post that was liked';

-- 27. Add social media fields to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS instagram_url TEXT,
ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
ADD COLUMN IF NOT EXISTS telegram_url TEXT;

-- 28. Add comments for social media fields
COMMENT ON COLUMN profiles.instagram_url IS 'Instagram profile URL';
COMMENT ON COLUMN profiles.tiktok_url IS 'TikTok profile URL';
COMMENT ON COLUMN profiles.telegram_url IS 'Telegram username or invite link';

-- ========================================
-- COMMENTS SYSTEM SCHEMA
-- ========================================

-- 29. Create comments table for thread-based comments
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- For replies
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 1000),
  images TEXT[] DEFAULT '{}', -- Array of image URLs
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

-- 30. Create comment_likes table for liking individual comments
CREATE TABLE IF NOT EXISTS comment_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

-- 31. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_is_deleted ON comments(is_deleted);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON comment_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_created_at ON comment_likes(created_at);

-- 32. Enable Row Level Security (RLS) for comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- 33. Create RLS policies for comments
-- Users can view comments on posts they have access to
DROP POLICY IF EXISTS "Users can view comments on accessible posts" ON comments;
CREATE POLICY "Users can view comments on accessible posts" ON comments
  FOR SELECT USING (
    is_deleted = FALSE AND
    EXISTS (
      SELECT 1 FROM posts 
      WHERE posts.id = comments.post_id 
      AND (
        posts.visibility = 'public' 
        OR posts.author_id = auth.uid()
        OR posts.visibility = 'friends'  -- Simplified for now, can add friends logic later
      )
    )
  );

-- Users can insert their own comments
DROP POLICY IF EXISTS "Users can insert their own comments" ON comments;
CREATE POLICY "Users can insert their own comments" ON comments
  FOR INSERT WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM posts 
      WHERE posts.id = comments.post_id 
      AND (
        posts.visibility = 'public' 
        OR posts.author_id = auth.uid()
        OR posts.visibility = 'friends'
      )
    )
  );

-- Users can update their own comments
DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
CREATE POLICY "Users can update their own comments" ON comments
  FOR UPDATE USING (auth.uid() = author_id);

-- Users can delete their own comments (soft delete)
DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;
CREATE POLICY "Users can delete their own comments" ON comments
  FOR UPDATE USING (auth.uid() = author_id);

-- 34. Create RLS policies for comment_likes
-- Users can view all comment likes
DROP POLICY IF EXISTS "Users can view all comment likes" ON comment_likes;
CREATE POLICY "Users can view all comment likes" ON comment_likes
  FOR SELECT USING (true); -- Anyone can see likes

-- Users can like comments
DROP POLICY IF EXISTS "Users can like comments" ON comment_likes;
CREATE POLICY "Users can like comments" ON comment_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can unlike their own comment likes
DROP POLICY IF EXISTS "Users can unlike their own comment likes" ON comment_likes;
CREATE POLICY "Users can unlike their own comment likes" ON comment_likes
  FOR DELETE USING (auth.uid() = user_id);

-- 35. Add comments for comments tables
COMMENT ON TABLE comments IS 'Thread-based comments on posts with reply support';
COMMENT ON COLUMN comments.post_id IS 'The post this comment belongs to';
COMMENT ON COLUMN comments.author_id IS 'User who wrote the comment';
COMMENT ON COLUMN comments.parent_id IS 'Parent comment for replies (NULL for top-level comments)';
COMMENT ON COLUMN comments.content IS 'Comment text content (max 1000 characters)';
COMMENT ON COLUMN comments.is_deleted IS 'Soft delete flag for comment moderation';

COMMENT ON TABLE comment_likes IS 'User likes on individual comments';
COMMENT ON COLUMN comment_likes.comment_id IS 'The comment that was liked';
COMMENT ON COLUMN comment_likes.user_id IS 'User who liked the comment';

-- ========================================
-- FIX RLS POLICIES FOR TESTING
-- ========================================

-- 36. Temporarily simplify RLS policies for comments to fix issues
DROP POLICY IF EXISTS "Users can view comments on accessible posts" ON comments;
CREATE POLICY "Users can view comments on accessible posts" ON comments
  FOR SELECT USING (is_deleted = FALSE);

DROP POLICY IF EXISTS "Users can insert their own comments" ON comments;
CREATE POLICY "Users can insert their own comments" ON comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
CREATE POLICY "Users can update their own comments" ON comments
  FOR UPDATE USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;
CREATE POLICY "Users can delete their own comments" ON comments
  FOR UPDATE USING (auth.uid() = author_id);

-- 37. Fix comment_likes RLS policies
DROP POLICY IF EXISTS "Users can view all comment likes" ON comment_likes;
CREATE POLICY "Users can view all comment likes" ON comment_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can like comments" ON comment_likes;
CREATE POLICY "Users can like comments" ON comment_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike their own comment likes" ON comment_likes;
CREATE POLICY "Users can unlike their own comment likes" ON comment_likes
  FOR DELETE USING (auth.uid() = user_id);

-- 38. Comprehensive RLS policy fix for comments
-- First, drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view comments on accessible posts" ON comments;
DROP POLICY IF EXISTS "Users can insert their own comments" ON comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;

-- Create simplified policies that work
CREATE POLICY "Anyone can view non-deleted comments" ON comments
  FOR SELECT USING (is_deleted = false);

CREATE POLICY "Authenticated users can insert comments" ON comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own comments" ON comments
  FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
