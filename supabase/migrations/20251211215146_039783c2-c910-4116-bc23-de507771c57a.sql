-- First, remove the trailer from truck 241140
UPDATE trucks 
SET trailer_id = NULL 
WHERE truck_number = '241140';

-- Add unique constraint to prevent multiple trucks from having the same trailer
ALTER TABLE trucks 
ADD CONSTRAINT trucks_trailer_id_unique UNIQUE (trailer_id);