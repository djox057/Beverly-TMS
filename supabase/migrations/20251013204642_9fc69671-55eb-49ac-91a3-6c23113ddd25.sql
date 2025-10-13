-- Delete orders that have no pickup_drops
DELETE FROM orders
WHERE id NOT IN (
  SELECT DISTINCT order_id 
  FROM pickup_drops
);

-- Create a function to validate orders have pickup_drops
CREATE OR REPLACE FUNCTION validate_order_has_pickup_drops()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If deleting pickup_drops, check if it's the last one for the order
  IF TG_OP = 'DELETE' THEN
    -- Check if there are any remaining pickup_drops for this order
    IF NOT EXISTS (
      SELECT 1 FROM pickup_drops 
      WHERE order_id = OLD.order_id 
      AND id != OLD.id
    ) THEN
      -- Delete the order if no pickup_drops remain
      DELETE FROM orders WHERE id = OLD.order_id;
      RAISE NOTICE 'Order % deleted because it has no pickup/drops', OLD.order_id;
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$;

-- Create trigger to automatically delete orders when last pickup_drop is removed
DROP TRIGGER IF EXISTS trigger_validate_order_pickup_drops ON pickup_drops;
CREATE TRIGGER trigger_validate_order_pickup_drops
AFTER DELETE ON pickup_drops
FOR EACH ROW
EXECUTE FUNCTION validate_order_has_pickup_drops();

-- Add comment explaining the trigger
COMMENT ON FUNCTION validate_order_has_pickup_drops() IS 
'Automatically deletes orders when their last pickup/delivery location is removed';

COMMENT ON TRIGGER trigger_validate_order_pickup_drops ON pickup_drops IS 
'Ensures orders are automatically deleted when they have no pickup/delivery locations';