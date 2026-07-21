
-- 1. Backfill from current driver1
UPDATE public.trucks t
SET company_id    = d.company_id,
    dispatcher_id = d.dispatcher_id
FROM public.drivers d
WHERE t.driver1_id = d.id
  AND (t.company_id    IS DISTINCT FROM d.company_id
    OR t.dispatcher_id IS DISTINCT FROM d.dispatcher_id);

-- Clear orphans (no driver1)
UPDATE public.trucks
SET company_id = NULL, dispatcher_id = NULL
WHERE driver1_id IS NULL
  AND (company_id IS NOT NULL OR dispatcher_id IS NOT NULL);

-- 2. Trigger on trucks: on insert/update of driver1_id, mirror driver's company/dispatcher
CREATE OR REPLACE FUNCTION public.sync_truck_company_dispatcher_from_driver1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.driver1_id IS NULL THEN
    NEW.company_id := NULL;
    NEW.dispatcher_id := NULL;
  ELSE
    SELECT d.company_id, d.dispatcher_id
      INTO NEW.company_id, NEW.dispatcher_id
    FROM public.drivers d
    WHERE d.id = NEW.driver1_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_truck_company_dispatcher ON public.trucks;
CREATE TRIGGER trg_sync_truck_company_dispatcher
BEFORE INSERT OR UPDATE OF driver1_id ON public.trucks
FOR EACH ROW
EXECUTE FUNCTION public.sync_truck_company_dispatcher_from_driver1();

-- 3. Trigger on drivers: when driver's company_id or dispatcher_id changes, propagate to trucks
CREATE OR REPLACE FUNCTION public.propagate_driver_company_dispatcher_to_trucks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trucks
  SET company_id    = NEW.company_id,
      dispatcher_id = NEW.dispatcher_id
  WHERE driver1_id = NEW.id
    AND (company_id    IS DISTINCT FROM NEW.company_id
      OR dispatcher_id IS DISTINCT FROM NEW.dispatcher_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_driver_company_dispatcher ON public.drivers;
CREATE TRIGGER trg_propagate_driver_company_dispatcher
AFTER UPDATE OF company_id, dispatcher_id ON public.drivers
FOR EACH ROW
WHEN (OLD.company_id IS DISTINCT FROM NEW.company_id
   OR OLD.dispatcher_id IS DISTINCT FROM NEW.dispatcher_id)
EXECUTE FUNCTION public.propagate_driver_company_dispatcher_to_trucks();
