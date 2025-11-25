
-- Fix load #2435 where load_number was incorrectly set to broker_load_number
-- This updates only the specific load with internal_load_number 2435
UPDATE orders 
SET load_number = '2435'
WHERE internal_load_number = 2435 
  AND load_number = '1187969'
  AND broker_load_number = '1187969';
