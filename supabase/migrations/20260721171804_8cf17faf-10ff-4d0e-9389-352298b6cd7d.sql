
-- Keep truck.company_id / dispatcher_id when driver is disconnected.
-- Only overwrite when a driver is assigned; do NOT null out on disconnect.

CREATE OR REPLACE FUNCTION public.sync_truck_company_dispatcher_from_driver1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.driver1_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.driver1_id IS DISTINCT FROM OLD.driver1_id) THEN
    SELECT d.company_id, d.dispatcher_id
      INTO NEW.company_id, NEW.dispatcher_id
    FROM public.drivers d
    WHERE d.id = NEW.driver1_id;
  END IF;
  RETURN NEW;
END;
$$;
