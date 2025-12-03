UPDATE orders 
SET locked = true, updated_at = now()
WHERE delivery_end_datetime <= '2025-12-01 23:59:59' 
AND locked = false;