-- Add driver_id column to lost_day_notes (nullable first)
ALTER TABLE lost_day_notes ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES drivers(id);

-- Migrate existing data from truck_id to driver_id (only where driver exists)
UPDATE lost_day_notes 
SET driver_id = (SELECT driver1_id FROM trucks WHERE trucks.id = lost_day_notes.truck_id)
WHERE driver_id IS NULL
  AND EXISTS (SELECT 1 FROM trucks WHERE trucks.id = lost_day_notes.truck_id AND trucks.driver1_id IS NOT NULL);

-- Delete lost_day_notes records where we can't find a valid driver
DELETE FROM lost_day_notes
WHERE driver_id IS NULL;

-- Now make driver_id not null
ALTER TABLE lost_day_notes ALTER COLUMN driver_id SET NOT NULL;

-- Drop truck_id column
ALTER TABLE lost_day_notes DROP COLUMN IF EXISTS truck_id;