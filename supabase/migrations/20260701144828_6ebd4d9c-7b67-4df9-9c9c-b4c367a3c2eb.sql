
ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS last_oil_change_miles integer,
  ADD COLUMN IF NOT EXISTS air_filter integer,
  ADD COLUMN IF NOT EXISTS miles_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_trucks_miles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.miles IS DISTINCT FROM OLD.miles THEN
    NEW.miles_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trucks_miles_updated_at ON public.trucks;
CREATE TRIGGER trg_trucks_miles_updated_at
BEFORE UPDATE ON public.trucks
FOR EACH ROW
EXECUTE FUNCTION public.set_trucks_miles_updated_at();
