-- Fix the security warning by setting search_path on the function
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';