
-- Switch to transaction-level advisory lock (auto-releases when request completes)
CREATE OR REPLACE FUNCTION public.try_advisory_lock_truck_distances()
 RETURNS boolean
 LANGUAGE sql
AS $$ SELECT pg_try_advisory_xact_lock(73489221); $$;

-- Drop the manual unlock function since xact locks auto-release
DROP FUNCTION IF EXISTS public.advisory_unlock_truck_distances();
