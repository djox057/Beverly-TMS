
-- Phase 3, Step 1: Targeted partial indexes for timeout relief

-- Covers get-all-locked-orders Edge Function (sequential scan on 12k+ rows)
CREATE INDEX IF NOT EXISTS idx_orders_locked_true_created 
  ON public.orders (created_at DESC) WHERE locked = true;

-- Covers useLumperMissingRevisedRC hook (lumper > 0 with no index)
CREATE INDEX IF NOT EXISTS idx_orders_lumper_created 
  ON public.orders (created_at) WHERE lumper > 0;

-- Covers Reports page locked-orders-by-driver fetches
CREATE INDEX IF NOT EXISTS idx_orders_locked_driver1_pickup 
  ON public.orders (driver1_id, pickup_datetime DESC) WHERE locked = true;

-- Phase 3, Step 4: Deduplicate truck_notes and add unique constraint

-- Delete all duplicate truck_notes, keeping only the most recently updated per driver
DELETE FROM public.truck_notes
WHERE id NOT IN (
  SELECT DISTINCT ON (driver_id) id
  FROM public.truck_notes
  ORDER BY driver_id, updated_at DESC NULLS LAST
);

-- Add unique constraint on driver_id to prevent future duplicates
ALTER TABLE public.truck_notes 
  ADD CONSTRAINT truck_notes_driver_id_unique UNIQUE (driver_id);
