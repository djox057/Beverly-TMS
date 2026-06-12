CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_orders_broker_load_number_trgm
  ON public.orders USING gin (broker_load_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_internal_load_number_text_trgm
  ON public.orders USING gin ((internal_load_number::text) gin_trgm_ops);