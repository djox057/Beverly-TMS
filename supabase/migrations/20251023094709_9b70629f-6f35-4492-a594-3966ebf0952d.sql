-- Remove the going_to columns from orders table
ALTER TABLE orders 
DROP COLUMN IF EXISTS going_to_pickup_at,
DROP COLUMN IF EXISTS going_to_delivery_at;

-- Add the going_to columns to pickup_drops table instead
ALTER TABLE pickup_drops
ADD COLUMN going_to_at TIMESTAMP WITH TIME ZONE;

-- Add comment for clarity
COMMENT ON COLUMN pickup_drops.going_to_at IS 'Timestamp when driver clicked Going to Pickup/Delivery button for this stop';