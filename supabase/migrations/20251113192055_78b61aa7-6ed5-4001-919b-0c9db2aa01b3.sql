-- Drop the trigger first, then the function
DROP TRIGGER IF EXISTS log_trailer_changes ON public.trailers;
DROP FUNCTION IF EXISTS public.log_trailer_assignment_change();

-- The assignment tracking should be handled by the truck trigger which already exists
-- This migration removes the erroneous trailer trigger that was referencing non-existent fields