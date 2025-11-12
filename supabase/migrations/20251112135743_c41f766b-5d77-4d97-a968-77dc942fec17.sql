-- Make truck_id nullable in truck_note_history since we're now using driver_id
ALTER TABLE public.truck_note_history 
  ALTER COLUMN truck_id DROP NOT NULL;