
ALTER TABLE public.drivers
  ADD COLUMN straps integer NOT NULL DEFAULT 2,
  ADD COLUMN load_bars integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.validate_driver_straps_load_bars()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.straps < 0 THEN
    RAISE EXCEPTION 'straps cannot be negative';
  END IF;
  IF NEW.load_bars < 0 THEN
    RAISE EXCEPTION 'load_bars cannot be negative';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_driver_straps_load_bars_trigger
  BEFORE INSERT OR UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_driver_straps_load_bars();
