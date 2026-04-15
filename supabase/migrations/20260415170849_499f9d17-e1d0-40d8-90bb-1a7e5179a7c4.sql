
-- Auto-delete transfer_list rows when driver is set to inactive (done)
CREATE OR REPLACE FUNCTION public.remove_done_driver_from_transfer_list()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_active = false AND (OLD.is_active IS DISTINCT FROM false) THEN
    DELETE FROM public.transfer_list WHERE driver_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remove_done_driver_from_transfer_list ON public.drivers;
CREATE TRIGGER trg_remove_done_driver_from_transfer_list
  AFTER UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_done_driver_from_transfer_list();
