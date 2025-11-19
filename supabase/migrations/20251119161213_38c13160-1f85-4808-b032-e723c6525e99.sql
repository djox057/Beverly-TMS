-- Create a function to update order status when POD is uploaded
CREATE OR REPLACE FUNCTION update_order_status_on_pod()
RETURNS TRIGGER AS $$
BEGIN
  -- If a POD file is being inserted, update the order status to 'delivered'
  IF NEW.file_category = 'POD' THEN
    UPDATE orders
    SET status = 'delivered'
    WHERE id = NEW.order_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically update order status when POD is uploaded
DROP TRIGGER IF EXISTS trigger_update_order_status_on_pod ON order_files;
CREATE TRIGGER trigger_update_order_status_on_pod
  AFTER INSERT ON order_files
  FOR EACH ROW
  EXECUTE FUNCTION update_order_status_on_pod();