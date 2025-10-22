-- Fix orders with incorrect year (2023 instead of 2025)
-- This fixes data entry errors where dates were entered with wrong year

-- Update orders table
UPDATE orders 
SET 
  pickup_datetime = pickup_datetime + INTERVAL '2 years',
  pickup_end_datetime = pickup_end_datetime + INTERVAL '2 years',
  delivery_datetime = delivery_datetime + INTERVAL '2 years',
  delivery_end_datetime = delivery_end_datetime + INTERVAL '2 years',
  updated_at = NOW()
WHERE (pickup_datetime < '2024-01-01' OR delivery_datetime < '2024-01-01')
  AND status IN ('pending', 'in_transit')
  AND canceled = false;

-- Update pickup_drops table for affected orders
UPDATE pickup_drops
SET datetime = datetime + INTERVAL '2 years'
WHERE datetime < '2024-01-01'
  AND order_id IN (
    SELECT id FROM orders 
    WHERE status IN ('pending', 'in_transit')
    AND canceled = false
  );