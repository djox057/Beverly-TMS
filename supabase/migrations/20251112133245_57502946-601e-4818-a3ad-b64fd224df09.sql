-- Add driver_id column to truck_notes table (nullable first)
ALTER TABLE truck_notes ADD COLUMN driver_id uuid REFERENCES drivers(id);

-- Migrate existing notes: copy truck's current driver to all notes for that truck
-- Only update where the truck has a driver assigned
UPDATE truck_notes tn
SET driver_id = (
  SELECT driver1_id 
  FROM trucks t 
  WHERE t.id = tn.truck_id AND t.driver1_id IS NOT NULL
)
WHERE tn.truck_id IS NOT NULL;

-- Delete any orphaned notes (notes without a valid truck or where truck has no driver)
DELETE FROM truck_notes 
WHERE driver_id IS NULL;

-- Now make driver_id required
ALTER TABLE truck_notes ALTER COLUMN driver_id SET NOT NULL;

-- Update truck_note_history table
ALTER TABLE truck_note_history ADD COLUMN driver_id uuid REFERENCES drivers(id);

-- Migrate history: copy truck's current driver
UPDATE truck_note_history tnh
SET driver_id = (
  SELECT driver1_id 
  FROM trucks t 
  WHERE t.id = tnh.truck_id AND t.driver1_id IS NOT NULL
)
WHERE tnh.truck_id IS NOT NULL;

-- Delete orphaned history entries
DELETE FROM truck_note_history 
WHERE driver_id IS NULL;

-- Make driver_id required in history table
ALTER TABLE truck_note_history ALTER COLUMN driver_id SET NOT NULL;

-- Create indexes for efficient driver-based lookups
CREATE INDEX idx_truck_notes_driver_id ON truck_notes(driver_id);
CREATE INDEX idx_truck_note_history_driver_id ON truck_note_history(driver_id);