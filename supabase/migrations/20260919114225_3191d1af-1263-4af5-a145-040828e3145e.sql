ALTER TABLE public.afterhours_schedule
  ADD COLUMN IF NOT EXISTS override_office text;

COMMENT ON COLUMN public.afterhours_schedule.override_office IS 'Admin-only cross-office override: office bucket this user covers for that date, even though their profile office differs.';