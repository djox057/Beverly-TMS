-- Add a column to track date change history in orders
ALTER TABLE orders
ADD COLUMN date_change_notes text;

COMMENT ON COLUMN orders.date_change_notes IS 'Tracks historical date changes for audit purposes';
