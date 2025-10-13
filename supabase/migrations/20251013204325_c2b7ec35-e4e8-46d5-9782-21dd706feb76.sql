-- First, identify and delete duplicate pickup_drops rows
-- Keep only the row with the smallest ID for each duplicate group
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY order_id, type, address, city, state, zip_code, datetime 
      ORDER BY id ASC
    ) as rn
  FROM pickup_drops
)
DELETE FROM pickup_drops
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Add a unique constraint to prevent future duplicates
-- This ensures within each order, the combination of type, address, city, state, zip_code, and datetime is unique
CREATE UNIQUE INDEX idx_pickup_drops_unique_location 
ON pickup_drops (order_id, type, COALESCE(address, ''), COALESCE(city, ''), COALESCE(state, ''), COALESCE(zip_code, ''), datetime);

-- Add a comment explaining the constraint
COMMENT ON INDEX idx_pickup_drops_unique_location IS 
'Prevents duplicate pickup/delivery locations within the same order. Uses COALESCE to handle NULL values.';