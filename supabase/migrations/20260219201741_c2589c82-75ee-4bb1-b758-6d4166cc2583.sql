
-- Fix order original_* fields to point to Pablo Ortiz (the true original driver)
UPDATE orders SET
  original_driver1_id = '89bd9526-ea03-47a6-ba8b-48eacfb6a60d',  -- Pablo Ortiz
  original_truck_id = '509fe962-0619-454c-8bfa-7ca1b56e62a1',    -- Truck 5870
  original_trailer_id = '7ca27264-5ac9-4316-9289-22af8ed43ed2',  -- Trailer 016760
  original_miles = 1524,
  original_driver_price = 2900
WHERE id = '0021b6b3-02f2-4155-92a7-9d084824d227';

-- Update transfer seq 0 (Reginal Jones) - add pickup location info  
UPDATE order_transfers SET
  transfer_city = 'Lynwood',
  transfer_state = 'IL',
  transfer_datetime = '2026-02-19 03:36:00+00'
WHERE id = '5ca0f755-0e90-41e3-953e-67272b70aeeb';

-- Update transfer seq 1 (Robert Bolton) - add pickup location
UPDATE order_transfers SET
  transfer_city = 'Lynwood',
  transfer_state = 'IL'
WHERE id = '327610b0-5b48-41af-9b90-6d9401ded433';
