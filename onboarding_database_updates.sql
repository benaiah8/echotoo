-- Database updates for onboarding flow
-- Add new columns to profiles table for user preferences and referral tracking

-- Add columns for user preferences and onboarding
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS selected_tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS referral_source VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS user_number INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

-- Create a function to assign sequential user numbers
CREATE OR REPLACE FUNCTION assign_user_number()
RETURNS INTEGER AS $$
DECLARE
    next_number INTEGER;
BEGIN
    -- Get the next user number by finding the highest existing number + 1
    SELECT COALESCE(MAX(user_number), 0) + 1 INTO next_number
    FROM profiles
    WHERE user_number IS NOT NULL;
    
    RETURN next_number;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to auto-assign user numbers for new profiles
CREATE OR REPLACE FUNCTION trigger_assign_user_number()
RETURNS TRIGGER AS $$
BEGIN
    -- Only assign if user_number is NULL (new user)
    IF NEW.user_number IS NULL THEN
        NEW.user_number := assign_user_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS assign_user_number_trigger ON profiles;
CREATE TRIGGER assign_user_number_trigger
    BEFORE INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION trigger_assign_user_number();

-- Update existing users who don't have user numbers assigned
UPDATE profiles 
SET user_number = assign_user_number()
WHERE user_number IS NULL;

-- Create an index on user_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_number ON profiles(user_number);

-- Create a table for referral sources (optional - could be hardcoded in frontend)
CREATE TABLE IF NOT EXISTS referral_sources (
    id SERIAL PRIMARY KEY,
    value VARCHAR(100) UNIQUE NOT NULL,
    label VARCHAR(200) NOT NULL,
    display_order INTEGER DEFAULT 0
);

-- Insert common referral sources
INSERT INTO referral_sources (value, label, display_order) VALUES
('social_media', 'Social Media (Instagram, TikTok, etc.)', 1),
('friends', 'Friends or Family', 2),
('search', 'Google Search', 3),
('app_store', 'App Store Discovery', 4),
('blog', 'Blog or Article', 5),
('event', 'Event or Meetup', 6),
('advertisement', 'Advertisement', 7),
('other', 'Other', 99)
ON CONFLICT (value) DO NOTHING;

-- Create a table for available interest tags
CREATE TABLE IF NOT EXISTS interest_tags (
    id SERIAL PRIMARY KEY,
    value VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    display_order INTEGER DEFAULT 0
);

-- Insert common interest tags
INSERT INTO interest_tags (value, label, category, display_order) VALUES
-- Adventure & Outdoors
('adventure', 'Adventure', 'outdoors', 1),
('hiking', 'Hiking', 'outdoors', 2),
('camping', 'Camping', 'outdoors', 3),
('water_sports', 'Water Sports', 'outdoors', 4),

-- Food & Dining
('foodie', 'Foodie', 'food', 5),
('cooking', 'Cooking', 'food', 6),
('restaurants', 'Restaurants', 'food', 7),
('wine', 'Wine & Spirits', 'food', 8),

-- Arts & Culture
('art', 'Art', 'culture', 9),
('music', 'Music', 'culture', 10),
('theater', 'Theater', 'culture', 11),
('museums', 'Museums', 'culture', 12),

-- Sports & Fitness
('fitness', 'Fitness', 'sports', 13),
('yoga', 'Yoga', 'sports', 14),
('team_sports', 'Team Sports', 'sports', 15),
('running', 'Running', 'sports', 16),

-- Technology & Learning
('technology', 'Technology', 'learning', 17),
('startups', 'Startups', 'learning', 18),
('programming', 'Programming', 'learning', 19),
('design', 'Design', 'learning', 20),

-- Social & Networking
('networking', 'Networking', 'social', 21),
('volunteering', 'Volunteering', 'social', 22),
('travel', 'Travel', 'social', 23),
('photography', 'Photography', 'social', 24)
ON CONFLICT (value) DO NOTHING;
