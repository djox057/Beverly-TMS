
CREATE OR REPLACE FUNCTION public.try_advisory_lock_truck_distances()
RETURNS boolean
LANGUAGE sql
AS $$ SELECT pg_try_advisory_lock(73489221); $$;

CREATE OR REPLACE FUNCTION public.advisory_unlock_truck_distances()
RETURNS boolean
LANGUAGE sql
AS $$ SELECT pg_advisory_unlock(73489221); $$;
