-- Fix clear_game_over_on_driver_change function to use driver_id instead of truck_id
-- This function runs when a driver is changed on a truck and clears game over notes

CREATE OR REPLACE FUNCTION public.clear_game_over_on_driver_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- If driver has changed, delete game over notes for the OLD driver
  IF OLD.driver1_id IS DISTINCT FROM NEW.driver1_id THEN
    DELETE FROM lost_day_notes
    WHERE driver_id = OLD.driver1_id
    AND note ILIKE '%game over%';
  END IF;
  RETURN NEW;
END;
$function$;