-- Add miles_away column to trucks table to store calculated distance
ALTER TABLE public.trucks 
ADD COLUMN miles_away integer;

-- Add comment to describe the column
COMMENT ON COLUMN public.trucks.miles_away IS 'Distance in miles from truck current location to next destination (pickup/delivery/terminal). Calculated from Samsara location data.';