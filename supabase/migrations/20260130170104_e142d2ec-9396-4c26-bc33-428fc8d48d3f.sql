-- Add individual_mode column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS individual_mode boolean DEFAULT false;

-- Partial index for performance (only indexes rows where individual_mode = true)
CREATE INDEX IF NOT EXISTS idx_profiles_individual_mode 
ON profiles(individual_mode) 
WHERE individual_mode = true;

-- Comment for documentation
COMMENT ON COLUMN profiles.individual_mode IS 
'When true, dispatcher sees only their own booked orders and dispatched drivers';