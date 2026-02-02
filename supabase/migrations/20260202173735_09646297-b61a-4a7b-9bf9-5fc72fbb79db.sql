-- Drop and recreate the check constraint to include dispatcher_assignment
ALTER TABLE public.assignment_history 
DROP CONSTRAINT IF EXISTS assignment_history_change_type_check;

ALTER TABLE public.assignment_history 
ADD CONSTRAINT assignment_history_change_type_check 
CHECK (change_type = ANY (ARRAY[
  'truck_assignment'::text, 
  'trailer_assignment'::text, 
  'driver_assignment'::text, 
  'assignment_change'::text, 
  'trailer_update'::text, 
  'driver_update'::text, 
  'truck_update'::text,
  'dispatcher_assignment'::text
]));

-- Create function to log dispatcher assignment changes
CREATE OR REPLACE FUNCTION public.log_driver_dispatcher_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if dispatcher_id actually changed
  IF (OLD.dispatcher_id IS DISTINCT FROM NEW.dispatcher_id) THEN
    INSERT INTO public.assignment_history (
      change_type,
      driver1_id,
      old_driver1_id,
      dispatcher_id,
      old_dispatcher_id,
      changed_at,
      changed_by
    ) VALUES (
      'dispatcher_assignment',
      NEW.id,
      NEW.id,
      NEW.dispatcher_id,
      OLD.dispatcher_id,
      now(),
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on drivers table
DROP TRIGGER IF EXISTS trigger_log_driver_dispatcher_changes ON public.drivers;
CREATE TRIGGER trigger_log_driver_dispatcher_changes
  AFTER UPDATE OF dispatcher_id ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.log_driver_dispatcher_changes();

-- Backfill initial dispatcher assignments for drivers that have a dispatcher assigned
INSERT INTO public.assignment_history (
  change_type,
  driver1_id,
  old_driver1_id,
  dispatcher_id,
  old_dispatcher_id,
  changed_at,
  changed_by
)
SELECT
  'dispatcher_assignment',
  d.id,
  d.id,
  d.dispatcher_id,
  NULL,
  d.created_at,
  NULL
FROM public.drivers d
WHERE d.dispatcher_id IS NOT NULL
  AND d.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.assignment_history ah 
    WHERE ah.driver1_id = d.id 
    AND ah.change_type = 'dispatcher_assignment'
  );