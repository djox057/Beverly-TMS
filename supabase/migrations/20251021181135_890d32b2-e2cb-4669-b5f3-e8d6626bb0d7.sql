-- Create table for truck note edit history
CREATE TABLE IF NOT EXISTS public.truck_note_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id UUID NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  note TEXT,
  edited_by UUID REFERENCES auth.users(id),
  edited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add RLS policies for truck_note_history
ALTER TABLE public.truck_note_history ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view truck note history
CREATE POLICY "All authenticated users can view truck note history"
ON public.truck_note_history
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- All authenticated users can insert truck note history
CREATE POLICY "All authenticated users can insert truck note history"
ON public.truck_note_history
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for faster lookups
CREATE INDEX idx_truck_note_history_truck_id ON public.truck_note_history(truck_id);
CREATE INDEX idx_truck_note_history_edited_at ON public.truck_note_history(edited_at DESC);

-- Create function to automatically save note history and limit to 7 entries
CREATE OR REPLACE FUNCTION save_truck_note_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert the new history entry
  INSERT INTO public.truck_note_history (truck_id, note, edited_by)
  VALUES (NEW.truck_id, NEW.note, NEW.updated_by);
  
  -- Delete old entries if more than 7 exist for this truck
  DELETE FROM public.truck_note_history
  WHERE id IN (
    SELECT id 
    FROM public.truck_note_history 
    WHERE truck_id = NEW.truck_id 
    ORDER BY edited_at DESC 
    OFFSET 7
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to save history on truck_notes updates
DROP TRIGGER IF EXISTS truck_notes_history_trigger ON public.truck_notes;
CREATE TRIGGER truck_notes_history_trigger
AFTER INSERT OR UPDATE ON public.truck_notes
FOR EACH ROW
EXECUTE FUNCTION save_truck_note_history();