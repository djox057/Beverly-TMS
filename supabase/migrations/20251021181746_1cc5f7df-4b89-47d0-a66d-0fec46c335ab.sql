-- Drop the existing foreign key constraint on edited_by
ALTER TABLE public.truck_note_history
DROP CONSTRAINT IF EXISTS truck_note_history_edited_by_fkey;

-- Add new foreign key constraint referencing profiles table
ALTER TABLE public.truck_note_history
ADD CONSTRAINT truck_note_history_edited_by_fkey
FOREIGN KEY (edited_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;