ALTER TABLE public.trucks
  ADD COLUMN baseline_start_date date,
  ADD COLUMN baseline_note text,
  ADD COLUMN oil_spec text,
  ADD COLUMN baseline_created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.trucks.baseline_start_date IS 'Start date for the per-truck service log baseline.';
COMMENT ON COLUMN public.trucks.baseline_note IS 'Baseline note for the per-truck service log.';
COMMENT ON COLUMN public.trucks.oil_spec IS 'Truck oil specification, independent of individual service entries.';
COMMENT ON COLUMN public.trucks.baseline_created_by IS 'Known creator of the service log baseline; unknown historical creators remain null.';
