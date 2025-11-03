-- Add note_type column to lost_day_notes table for categorizing notes (e.g., 'home_time', 'game_over')
ALTER TABLE lost_day_notes 
ADD COLUMN IF NOT EXISTS note_type text;

-- Create index for faster filtering by note_type
CREATE INDEX IF NOT EXISTS idx_lost_day_notes_note_type 
ON lost_day_notes(note_type);

-- Create index for combined truck_id, date, and note_type for faster home time lookups
CREATE INDEX IF NOT EXISTS idx_lost_day_notes_truck_date_type 
ON lost_day_notes(truck_id, date, note_type);