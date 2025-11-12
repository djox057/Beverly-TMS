-- Fix assignment history change type detection
-- Drop existing constraint if it exists
ALTER TABLE public.assignment_history 
DROP CONSTRAINT IF EXISTS assignment_history_change_type_check;

-- Add constraint with all valid change types
ALTER TABLE public.assignment_history 
ADD CONSTRAINT assignment_history_change_type_check 
CHECK (change_type IN (
  'truck_assignment',
  'trailer_assignment', 
  'driver_assignment',
  'assignment_change',
  'trailer_update',
  'driver_update',
  'truck_update'
));

-- Update the log_truck_assignment_change function
CREATE OR REPLACE FUNCTION public.log_truck_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_change_type TEXT;
  trailer_changed BOOLEAN;
  driver1_changed BOOLEAN;
  driver2_changed BOOLEAN;
BEGIN
  -- Determine what changed
  trailer_changed := (OLD.trailer_id IS DISTINCT FROM NEW.trailer_id);
  driver1_changed := (OLD.driver1_id IS DISTINCT FROM NEW.driver1_id);
  driver2_changed := (OLD.driver2_id IS DISTINCT FROM NEW.driver2_id);
  
  -- Only log if relevant fields changed
  IF trailer_changed OR driver1_changed OR driver2_changed THEN
    -- Determine the specific change type
    IF trailer_changed AND NOT (driver1_changed OR driver2_changed) THEN
      v_change_type := 'trailer_assignment';
    ELSIF (driver1_changed OR driver2_changed) AND NOT trailer_changed THEN
      v_change_type := 'driver_assignment';
    ELSIF trailer_changed AND (driver1_changed OR driver2_changed) THEN
      v_change_type := 'assignment_change';
    ELSE
      v_change_type := 'truck_assignment';
    END IF;
    
    INSERT INTO public.assignment_history (
      truck_id,
      trailer_id,
      driver1_id,
      driver2_id,
      changed_by,
      change_type
    ) VALUES (
      NEW.id,
      NEW.trailer_id,
      NEW.driver1_id,
      NEW.driver2_id,
      auth.uid(),
      v_change_type
    );
  END IF;
  
  RETURN NEW;
END;
$function$;