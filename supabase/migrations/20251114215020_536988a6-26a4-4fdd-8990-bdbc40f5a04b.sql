-- Add checked_out_at column to pickup_drops table
ALTER TABLE public.pickup_drops 
ADD COLUMN IF NOT EXISTS checked_out_at timestamp with time zone;

COMMENT ON COLUMN public.pickup_drops.checked_out_at IS 'Time when the driver checked out (BOL upload for pickup, POD upload for delivery)';