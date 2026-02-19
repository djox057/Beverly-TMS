-- Partial composite index for the filtered join
CREATE INDEX IF NOT EXISTS idx_orders_truck_locked
ON orders (truck_id, locked)
WHERE locked = false;

-- Advisory lock RPC for concurrency guard
CREATE OR REPLACE FUNCTION public.try_advisory_lock_truck_distances()
RETURNS boolean
LANGUAGE sql
AS $$ SELECT pg_try_advisory_xact_lock(73489221); $$;