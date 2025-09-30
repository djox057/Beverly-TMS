-- Add arrived_at timestamp to pickup_drops table
ALTER TABLE public.pickup_drops
ADD COLUMN arrived_at TIMESTAMP WITH TIME ZONE;

-- Add comment for clarity
COMMENT ON COLUMN public.pickup_drops.arrived_at IS 'Timestamp when truck arrived at this pickup or delivery location';