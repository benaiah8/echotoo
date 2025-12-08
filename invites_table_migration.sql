-- Migration to create invites table
-- This script is idempotent and can be run multiple times safely

-- Create function to update updated_at timestamp (outside DO block)
CREATE OR REPLACE FUNCTION update_invites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create invites table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'invites') THEN
        CREATE TABLE invites (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
            
            -- Ensure unique invite per post per invitee
            UNIQUE(post_id, invitee_id)
        );
        
        -- Add indexes for better performance
        CREATE INDEX idx_invites_post_id ON invites(post_id);
        CREATE INDEX idx_invites_inviter_id ON invites(inviter_id);
        CREATE INDEX idx_invites_invitee_id ON invites(invitee_id);
        CREATE INDEX idx_invites_status ON invites(status);
        CREATE INDEX idx_invites_created_at ON invites(created_at);
        
        -- Add RLS (Row Level Security) policies
        ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
        
        -- Policy: Users can see invites they sent or received
        CREATE POLICY "Users can view their own invites" ON invites
            FOR SELECT USING (
                auth.uid() = inviter_id OR auth.uid() = invitee_id
            );
        
        -- Policy: Users can create invites for their own posts
        CREATE POLICY "Users can create invites for their posts" ON invites
            FOR INSERT WITH CHECK (
                auth.uid() = inviter_id AND
                EXISTS (
                    SELECT 1 FROM posts 
                    WHERE posts.id = invites.post_id 
                    AND posts.author_id = auth.uid()
                )
            );
        
        -- Policy: Invitees can update status of invites sent to them
        CREATE POLICY "Invitees can update invite status" ON invites
            FOR UPDATE USING (
                auth.uid() = invitee_id
            ) WITH CHECK (
                auth.uid() = invitee_id AND
                status IN ('accepted', 'declined')
            );
        
        -- Policy: Inviters can delete invites they sent
        CREATE POLICY "Inviters can delete their invites" ON invites
            FOR DELETE USING (
                auth.uid() = inviter_id
            );
        
        -- Create trigger to automatically update updated_at
        CREATE TRIGGER update_invites_updated_at_trigger
            BEFORE UPDATE ON invites
            FOR EACH ROW
            EXECUTE FUNCTION update_invites_updated_at();
        
        RAISE NOTICE 'Invites table created successfully';
    ELSE
        RAISE NOTICE 'Invites table already exists';
    END IF;
END $$;
