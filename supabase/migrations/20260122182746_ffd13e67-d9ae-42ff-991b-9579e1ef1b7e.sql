
-- Update drivers to inactive who:
-- 1. Are not connected to any truck
-- 2. Had no load in the last 3 weeks  
-- 3. Have no future loads

WITH drivers_with_trucks AS (
  SELECT DISTINCT driver1_id as driver_id FROM trucks WHERE driver1_id IS NOT NULL
  UNION
  SELECT DISTINCT driver2_id as driver_id FROM trucks WHERE driver2_id IS NOT NULL
),
drivers_with_recent_loads AS (
  SELECT DISTINCT driver1_id as driver_id FROM orders 
  WHERE driver1_id IS NOT NULL 
  AND delivery_datetime::date >= CURRENT_DATE - INTERVAL '21 days'
  UNION
  SELECT DISTINCT driver2_id as driver_id FROM orders 
  WHERE driver2_id IS NOT NULL 
  AND delivery_datetime::date >= CURRENT_DATE - INTERVAL '21 days'
),
drivers_with_future_loads AS (
  SELECT DISTINCT driver1_id as driver_id FROM orders 
  WHERE driver1_id IS NOT NULL 
  AND pickup_datetime::date >= CURRENT_DATE
  UNION
  SELECT DISTINCT driver2_id as driver_id FROM orders 
  WHERE driver2_id IS NOT NULL 
  AND pickup_datetime::date >= CURRENT_DATE
)
UPDATE drivers 
SET is_active = false
WHERE is_active = true
  AND id NOT IN (SELECT driver_id FROM drivers_with_trucks WHERE driver_id IS NOT NULL)
  AND id NOT IN (SELECT driver_id FROM drivers_with_recent_loads WHERE driver_id IS NOT NULL)
  AND id NOT IN (SELECT driver_id FROM drivers_with_future_loads WHERE driver_id IS NOT NULL);
