
ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS last_oc_invoice text;

CREATE OR REPLACE FUNCTION public.set_trucks_miles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.miles IS DISTINCT FROM OLD.miles THEN
    -- If the caller supplied a new miles_updated_at explicitly, keep it.
    -- Otherwise stamp with now().
    IF NEW.miles_updated_at IS NOT DISTINCT FROM OLD.miles_updated_at THEN
      NEW.miles_updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
