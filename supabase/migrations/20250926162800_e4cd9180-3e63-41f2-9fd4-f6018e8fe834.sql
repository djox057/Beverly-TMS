-- Drop the existing foreign key constraint
ALTER TABLE trucks DROP CONSTRAINT IF EXISTS trucks_dispatcher_id_fkey;

-- Add the correct foreign key constraint that references profiles(user_id)
ALTER TABLE trucks 
ADD CONSTRAINT trucks_dispatcher_id_fkey 
FOREIGN KEY (dispatcher_id) REFERENCES profiles(user_id) ON DELETE SET NULL;