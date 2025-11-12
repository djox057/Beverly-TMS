-- Add UPDATE trigger for truck_note_history
DROP TRIGGER IF EXISTS truck_notes_history_trigger_update ON public.truck_notes;

CREATE TRIGGER truck_notes_history_trigger_update
  AFTER UPDATE ON public.truck_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.save_truck_note_history();