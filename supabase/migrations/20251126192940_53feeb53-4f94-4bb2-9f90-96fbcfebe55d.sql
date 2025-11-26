-- Auto-lock old orders with POD files (one-time operation)
-- Lock all orders where delivery_datetime is on or before 2025-11-24 and has at least one POD file

UPDATE orders
SET locked = true
WHERE delivery_datetime <= '2025-11-24 23:59:59'::timestamp with time zone
AND locked = false
AND EXISTS (
  SELECT 1 
  FROM order_files 
  WHERE order_files.order_id = orders.id 
  AND order_files.file_category = 'pod'
);