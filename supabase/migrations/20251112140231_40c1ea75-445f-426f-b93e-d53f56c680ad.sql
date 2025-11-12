-- Drop the INSERT trigger as we only want to track updates in history
DROP TRIGGER IF EXISTS truck_notes_history_trigger ON public.truck_notes;

-- Keep only the UPDATE trigger for note history
-- The truck_notes_history_trigger_update trigger should remain