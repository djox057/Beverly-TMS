-- Add unique constraint on driver_id and date for lost_day_notes
-- This allows upsert operations when setting driver status

-- First, remove any duplicate entries that might exist
DELETE FROM lost_day_notes a USING lost_day_notes b
WHERE a.id > b.id 
  AND a.driver_id = b.driver_id 
  AND a.date = b.date;

-- Add unique constraint
ALTER TABLE lost_day_notes 
ADD CONSTRAINT lost_day_notes_driver_date_unique 
UNIQUE (driver_id, date);