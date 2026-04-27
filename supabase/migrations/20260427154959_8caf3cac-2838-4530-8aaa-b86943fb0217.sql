-- 1) Update the dispatcher restriction trigger to allow our system-driven sync
CREATE OR REPLACE FUNCTION public.restrict_dispatcher_transfer_list_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_roles app_role[];
  bypass text;
BEGIN
  BEGIN
    bypass := current_setting('app.bypass_transfer_list_restrict', true);
  EXCEPTION WHEN OTHERS THEN
    bypass := NULL;
  END;

  IF bypass = 'on' THEN
    RETURN NEW;
  END IF;

  user_roles := public.auth_user_roles();

  IF 'dispatch'::app_role = ANY(user_roles)
     AND NOT user_roles && ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]
  THEN
    NEW.driver_id := OLD.driver_id;
    NEW.truck_id := OLD.truck_id;
    NEW.going_to_company := OLD.going_to_company;
    NEW.drug_test_date := OLD.drug_test_date;
    NEW.drug_test_zip := OLD.drug_test_zip;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Sync function: when a truck's driver1/driver2 changes, update transfer_list for affected drivers (UNFINISHED ONLY)
CREATE OR REPLACE FUNCTION public.sync_transfer_list_truck_on_driver_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected_drivers uuid[];
  d uuid;
  new_truck_for_driver uuid;
BEGIN
  affected_drivers := ARRAY[]::uuid[];

  IF TG_OP = 'INSERT' THEN
    IF NEW.driver1_id IS NOT NULL THEN
      affected_drivers := array_append(affected_drivers, NEW.driver1_id);
    END IF;
    IF NEW.driver2_id IS NOT NULL THEN
      affected_drivers := array_append(affected_drivers, NEW.driver2_id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.driver1_id IS DISTINCT FROM OLD.driver1_id THEN
      IF OLD.driver1_id IS NOT NULL THEN
        affected_drivers := array_append(affected_drivers, OLD.driver1_id);
      END IF;
      IF NEW.driver1_id IS NOT NULL THEN
        affected_drivers := array_append(affected_drivers, NEW.driver1_id);
      END IF;
    END IF;
    IF NEW.driver2_id IS DISTINCT FROM OLD.driver2_id THEN
      IF OLD.driver2_id IS NOT NULL THEN
        affected_drivers := array_append(affected_drivers, OLD.driver2_id);
      END IF;
      IF NEW.driver2_id IS NOT NULL THEN
        affected_drivers := array_append(affected_drivers, NEW.driver2_id);
      END IF;
    END IF;
  END IF;

  IF array_length(affected_drivers, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.bypass_transfer_list_restrict', 'on', true);

  FOREACH d IN ARRAY affected_drivers LOOP
    SELECT t.id INTO new_truck_for_driver
    FROM public.trucks t
    WHERE t.driver1_id = d OR t.driver2_id = d
    ORDER BY (CASE WHEN t.driver1_id = d THEN 0 ELSE 1 END)
    LIMIT 1;

    UPDATE public.transfer_list tl
    SET truck_id = new_truck_for_driver
    WHERE tl.driver_id = d
      AND tl.finished = false
      AND tl.truck_id IS DISTINCT FROM new_truck_for_driver;
  END LOOP;

  PERFORM set_config('app.bypass_transfer_list_restrict', 'off', true);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_transfer_list_truck ON public.trucks;
CREATE TRIGGER trg_sync_transfer_list_truck
AFTER INSERT OR UPDATE OF driver1_id, driver2_id ON public.trucks
FOR EACH ROW
EXECUTE FUNCTION public.sync_transfer_list_truck_on_driver_assignment();

-- 3) One-time backfill: align all UNFINISHED transfer_list rows with the driver's currently assigned truck
DO $$
BEGIN
  PERFORM set_config('app.bypass_transfer_list_restrict', 'on', true);

  UPDATE public.transfer_list tl
  SET truck_id = sub.current_truck_id
  FROM (
    SELECT tl2.id AS row_id,
           (
             SELECT t.id FROM public.trucks t
             WHERE t.driver1_id = tl2.driver_id OR t.driver2_id = tl2.driver_id
             ORDER BY (CASE WHEN t.driver1_id = tl2.driver_id THEN 0 ELSE 1 END)
             LIMIT 1
           ) AS current_truck_id
    FROM public.transfer_list tl2
    WHERE tl2.driver_id IS NOT NULL
      AND tl2.finished = false
  ) sub
  WHERE tl.id = sub.row_id
    AND tl.truck_id IS DISTINCT FROM sub.current_truck_id;

  PERFORM set_config('app.bypass_transfer_list_restrict', 'off', true);
END $$;