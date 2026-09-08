CREATE OR REPLACE FUNCTION public.protect_truck_oil_change_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Never let an existing oil-change date be wiped to empty. A real new date still saves.
  IF NEW.oil_change_date IS NULL AND OLD.oil_change_date IS NOT NULL THEN
    NEW.oil_change_date := OLD.oil_change_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_truck_oil_change_date ON public.trucks;
CREATE TRIGGER trg_protect_truck_oil_change_date
BEFORE UPDATE OF oil_change_date ON public.trucks
FOR EACH ROW
EXECUTE FUNCTION public.protect_truck_oil_change_date();