-- Drop the triggers that are causing duplicate history entries
-- All assignment history logging will now be handled by the application code

DROP TRIGGER IF EXISTS log_truck_changes ON public.trucks;
DROP TRIGGER IF EXISTS log_trailer_changes ON public.trailers;

-- Also drop the trigger functions since they're no longer needed
DROP FUNCTION IF EXISTS public.log_truck_assignment_change();
DROP FUNCTION IF EXISTS public.log_trailer_assignment_change();