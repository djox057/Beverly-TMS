-- Add latitude and longitude columns to pickup_drops table for storing geocoded coordinates
ALTER TABLE public.pickup_drops 
ADD COLUMN latitude NUMERIC,
ADD COLUMN longitude NUMERIC;

-- Add index for faster lookups when querying coordinates
CREATE INDEX idx_pickup_drops_coordinates ON public.pickup_drops (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.pickup_drops.latitude IS 'Geocoded latitude coordinate of the address';
COMMENT ON COLUMN public.pickup_drops.longitude IS 'Geocoded longitude coordinate of the address';