CREATE OR REPLACE FUNCTION public.save_truck_note_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  last_note TEXT;
  trimmed_note TEXT;
BEGIN
  trimmed_note := TRIM(BOTH FROM COALESCE(NEW.note, ''));

  -- Skip automatic scheduled clears (empty note, no editor)
  IF trimmed_note = '' AND NEW.updated_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT TRIM(BOTH FROM COALESCE(note, ''))
  INTO last_note
  FROM public.truck_note_history
  WHERE driver_id = NEW.driver_id
  ORDER BY edited_at DESC
  LIMIT 1;

  IF last_note IS DISTINCT FROM trimmed_note THEN
    INSERT INTO public.truck_note_history (driver_id, note, edited_by)
    VALUES (NEW.driver_id, trimmed_note, NEW.updated_by);

    DELETE FROM public.truck_note_history
    WHERE id IN (
      SELECT id FROM public.truck_note_history
      WHERE driver_id = NEW.driver_id
      ORDER BY edited_at DESC
      OFFSET 7
    );
  END IF;

  RETURN NEW;
END;
$function$;

DELETE FROM public.truck_note_history
WHERE edited_by IS NULL AND TRIM(BOTH FROM COALESCE(note, '')) = '';