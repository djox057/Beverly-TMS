-- Add columns to track going to pickup/delivery button clicks
ALTER TABLE orders 
ADD COLUMN going_to_pickup_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN going_to_delivery_at TIMESTAMP WITH TIME ZONE;

-- Add comment for clarity
COMMENT ON COLUMN orders.going_to_pickup_at IS 'Timestamp when driver clicked Going to Pickup button';
COMMENT ON COLUMN orders.going_to_delivery_at IS 'Timestamp when driver clicked Going to Delivery button';