-- Fix the clear_game_over_on_driver_change trigger setup
-- The trigger exists but was never properly attached to the trucks table

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS clear_game_over_on_driver_change ON public.trucks;

-- Recreate the trigger on the trucks table
CREATE TRIGGER clear_game_over_on_driver_change
AFTER UPDATE ON public.trucks
FOR EACH ROW
WHEN (OLD.driver1_id IS DISTINCT FROM NEW.driver1_id)
EXECUTE FUNCTION public.clear_game_over_on_driver_change();

-- Add a comment explaining what this does
COMMENT ON TRIGGER clear_game_over_on_driver_change ON public.trucks IS 
'Automatically clears game over notes when a driver is removed from a truck';