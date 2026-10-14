CREATE OR REPLACE FUNCTION public.log_truck_mileage_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.last_oil_change_miles IS DISTINCT FROM OLD.last_oil_change_miles THEN
    INSERT INTO public.truck_mileage_history (truck_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'last_oil_change_miles', OLD.last_oil_change_miles, NEW.last_oil_change_miles, auth.uid());
  END IF;
  IF NEW.miles IS DISTINCT FROM OLD.miles THEN
    INSERT INTO public.truck_mileage_history (truck_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'miles', OLD.miles, NEW.miles, auth.uid());
  END IF;
  IF NEW.air_filter IS DISTINCT FROM OLD.air_filter THEN
    INSERT INTO public.truck_mileage_history (truck_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'air_filter', OLD.air_filter, NEW.air_filter, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_truck_mileage_history() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_log_truck_mileage_history ON public.trucks;
CREATE TRIGGER trg_log_truck_mileage_history
AFTER UPDATE OF miles, last_oil_change_miles, air_filter ON public.trucks
FOR EACH ROW EXECUTE FUNCTION public.log_truck_mileage_history();
