
-- Backfill: Update orders with POD files to "delivered" status
UPDATE orders 
SET status = 'delivered', updated_at = now()
WHERE status = 'in_transit' 
AND id IN (
  SELECT DISTINCT order_id 
  FROM order_files 
  WHERE file_category = 'pod'
);
