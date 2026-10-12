-- Keep the existing source names and allow trucks with no source assigned.
-- No truck values or access policies are changed.
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.trucks
  ADD CONSTRAINT trucks_source_allowed_values
  CHECK (source IS NULL OR source IN ('BF TRUCK', 'M&K', 'Ryder', 'TEL'));
