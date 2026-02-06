
-- Add missing indexes for critical query paths

-- Reports main query: WHERE locked = false AND delivery_datetime >= X
CREATE INDEX idx_orders_locked_delivery ON orders (locked, delivery_datetime DESC)
  WHERE NOT locked;

-- Yard Loads count: WHERE driver1_id IS NULL AND truck_id IS NULL
CREATE INDEX idx_orders_yard_loads ON orders (driver1_id, truck_id)
  WHERE driver1_id IS NULL AND truck_id IS NULL;

-- Order transfers lookup by driver
CREATE INDEX IF NOT EXISTS idx_order_transfers_driver1 ON order_transfers (driver1_id);
CREATE INDEX IF NOT EXISTS idx_order_transfers_driver2 ON order_transfers (driver2_id);

-- Drop unused indexes (all have idx_scan = 0)
DROP INDEX IF EXISTS idx_orders_original_delivery_datetime;
DROP INDEX IF EXISTS idx_orders_invoiced_at;
DROP INDEX IF EXISTS idx_orders_company_id;
DROP INDEX IF EXISTS idx_pickup_drops_coordinates;
DROP INDEX IF EXISTS idx_pickup_drops_datetime;
DROP INDEX IF EXISTS idx_pickup_drops_type;
DROP INDEX IF EXISTS idx_order_files_category;
