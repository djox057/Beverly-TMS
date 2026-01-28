-- Add truck_count column (nullable initially for backfill)
ALTER TABLE dispatcher_daily_driver_counts 
ADD COLUMN truck_count integer;

-- Backfill: Copy driver_count to truck_count 
-- (current driver_count actually stores truck counts)
UPDATE dispatcher_daily_driver_counts 
SET truck_count = driver_count;

-- Make truck_count NOT NULL after backfill
ALTER TABLE dispatcher_daily_driver_counts 
ALTER COLUMN truck_count SET NOT NULL;

-- Add comment to clarify column meanings
COMMENT ON COLUMN dispatcher_daily_driver_counts.driver_count IS 'Number of active drivers assigned to this dispatcher on this date';
COMMENT ON COLUMN dispatcher_daily_driver_counts.truck_count IS 'Number of trucks assigned to drivers under this dispatcher on this date';