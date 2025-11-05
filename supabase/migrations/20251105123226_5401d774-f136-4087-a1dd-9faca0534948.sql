-- Add recovery tracking fields to trucks table
ALTER TABLE trucks 
ADD COLUMN IF NOT EXISTS needs_recovery BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS left_by_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

-- Add index for faster recovery queries
CREATE INDEX IF NOT EXISTS idx_trucks_needs_recovery ON trucks(needs_recovery) WHERE needs_recovery = true;

-- Add comment for documentation
COMMENT ON COLUMN trucks.needs_recovery IS 'Flag indicating truck needs a recovery driver assignment';
COMMENT ON COLUMN trucks.left_by_driver_id IS 'Track which driver left the truck (for historical reference)';