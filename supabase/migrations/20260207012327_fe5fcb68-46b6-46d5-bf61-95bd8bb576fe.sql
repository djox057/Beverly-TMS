CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_orders_broker_load_number_trgm
  ON orders USING gin (broker_load_number gin_trgm_ops);