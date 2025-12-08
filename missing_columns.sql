-- Add missing columns to activities table for full functionality
-- Run these commands in your Supabase SQL editor

-- 1. Add additional_info column to activities table (JSONB for structured data)
ALTER TABLE activities 
ADD COLUMN IF NOT EXISTS additional_info JSONB;

-- 2. Add tags column to activities table (TEXT[] for multiple activities per section)
ALTER TABLE activities 
ADD COLUMN IF NOT EXISTS tags TEXT[];

-- 3. Add comments to document the new columns
COMMENT ON COLUMN activities.additional_info IS 'Structured additional information as JSONB array of {title, value} objects';
COMMENT ON COLUMN activities.tags IS 'Array of activity tags for multiple activities within the same activity section';

-- 4. Create indexes for better performance on the new columns
CREATE INDEX IF NOT EXISTS idx_activities_additional_info ON activities USING GIN (additional_info);
CREATE INDEX IF NOT EXISTS idx_activities_tags ON activities USING GIN (tags);
