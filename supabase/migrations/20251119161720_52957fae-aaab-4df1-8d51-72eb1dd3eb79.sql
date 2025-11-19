-- Update all orders back to pending status
UPDATE orders
SET status = 'pending'
WHERE id IN (
  SELECT DISTINCT order_id 
  FROM order_files 
  WHERE file_category = 'POD'
);

-- Drop the trigger first
DROP TRIGGER IF EXISTS trigger_update_order_status_on_pod ON order_files;

-- Drop the function
DROP FUNCTION IF EXISTS update_order_status_on_pod();