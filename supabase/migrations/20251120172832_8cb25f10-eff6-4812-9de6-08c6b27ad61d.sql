-- Drop the trigger that deletes orders when last pickup_drop is removed
DROP TRIGGER IF EXISTS trigger_validate_order_pickup_drops ON pickup_drops;

-- Drop the function that validates and deletes orders
DROP FUNCTION IF EXISTS validate_order_has_pickup_drops();

-- Add comment explaining the change
COMMENT ON TABLE pickup_drops IS 'Pickup and delivery locations for orders. Deleting pickup_drops will no longer automatically delete the parent order.';