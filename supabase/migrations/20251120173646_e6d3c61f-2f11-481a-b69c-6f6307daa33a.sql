-- Drop the unique constraint that prevents duplicate pickup/delivery locations
DROP INDEX IF EXISTS idx_pickup_drops_unique_location;

-- Add comment explaining the change
COMMENT ON TABLE pickup_drops IS 'Pickup and delivery locations for orders. Multiple stops can now have the same address (e.g., multiple pickups from the same warehouse).';