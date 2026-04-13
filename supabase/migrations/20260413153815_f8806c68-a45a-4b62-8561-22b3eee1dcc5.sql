-- Add two new columns
ALTER TABLE public.roadside_inspections
  ADD COLUMN maintenance_check_yard date,
  ADD COLUMN maintenance_check_road date;

-- Migrate existing data to yard column
UPDATE public.roadside_inspections
SET maintenance_check_yard = maintenance_check
WHERE maintenance_check IS NOT NULL;

-- Drop old column
ALTER TABLE public.roadside_inspections DROP COLUMN maintenance_check;

-- Add validation trigger for mutual exclusivity
CREATE OR REPLACE FUNCTION public.validate_maintenance_check_exclusivity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.maintenance_check_yard IS NOT NULL AND NEW.maintenance_check_road IS NOT NULL THEN
    RAISE EXCEPTION 'Only one of maintenance_check_yard or maintenance_check_road can be filled';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_maintenance_check_exclusivity
  BEFORE INSERT OR UPDATE ON public.roadside_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_maintenance_check_exclusivity();