-- Update all orders that have POD files to delivered status
UPDATE orders
SET status = 'delivered'
WHERE id IN (
  SELECT DISTINCT order_id 
  FROM order_files 
  WHERE file_category = 'POD'
)
AND status != 'delivered';