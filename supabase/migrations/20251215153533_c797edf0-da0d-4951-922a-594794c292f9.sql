-- Fix incorrect delivery coordinates for Galesburg, MI
-- The current lat 46.002342 is wrong (near Canada), correct is ~42.29
UPDATE pickup_drops 
SET 
  latitude = 42.2886,
  longitude = -85.4178
WHERE id = '9048de27-b0b7-4703-b897-847e2bb76f48';