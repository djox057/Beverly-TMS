-- Add column to track 2-week block activation
ALTER TABLE drivers
ADD COLUMN two_week_block_date date;

COMMENT ON COLUMN drivers.two_week_block_date IS 'Date when the 2-week block was activated for this driver';