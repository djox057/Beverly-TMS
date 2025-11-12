-- Update the save_truck_note_history function to use driver_id instead of truck_id
CREATE OR REPLACE FUNCTION public.save_truck_note_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert the new history entry using driver_id
  INSERT INTO public.truck_note_history (driver_id, note, edited_by)
  VALUES (NEW.driver_id, NEW.note, NEW.updated_by);
  
  -- Delete old entries if more than 7 exist for this driver
  DELETE FROM public.truck_note_history
  WHERE id IN (
    SELECT id 
    FROM public.truck_note_history 
    WHERE driver_id = NEW.driver_id 
    ORDER BY edited_at DESC 
    OFFSET 7
  );
  
  RETURN NEW;
END;
$function$;