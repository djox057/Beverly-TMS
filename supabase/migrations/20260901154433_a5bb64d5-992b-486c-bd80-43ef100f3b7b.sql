CREATE TABLE IF NOT EXISTS public.truck_mileage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value numeric,
  new_value numeric,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.truck_mileage_history TO authenticated;
GRANT ALL ON public.truck_mileage_history TO service_role;

ALTER TABLE public.truck_mileage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view truck mileage history"
ON public.truck_mileage_history
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_truck_mileage_history_truck ON public.truck_mileage_history(truck_id, field, changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_truck_mileage_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_oil_change_miles IS DISTINCT FROM OLD.last_oil_change_miles THEN
    INSERT INTO public.truck_mileage_history (truck_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'last_oil_change_miles', OLD.last_oil_change_miles, NEW.last_oil_change_miles, auth.uid());
  END IF;

  IF NEW.miles IS DISTINCT FROM OLD.miles THEN
    INSERT INTO public.truck_mileage_history (truck_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'miles', OLD.miles, NEW.miles, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_truck_mileage_history ON public.trucks;
CREATE TRIGGER trg_log_truck_mileage_history
AFTER UPDATE OF miles, last_oil_change_miles ON public.trucks
FOR EACH ROW
EXECUTE FUNCTION public.log_truck_mileage_history();