
-- Fix delivery location for load JL157336
-- Update the incorrect delivery city/state
UPDATE pickup_drops
SET 
  city = 'Middletown',
  state = 'PA',
  zip_code = '17057'
WHERE id = '1ec9b0e6-bf4a-4beb-9a54-6e474df350fc'
  AND type = 'delivery'
  AND address LIKE '1000 KREIDER DRIVE%';
