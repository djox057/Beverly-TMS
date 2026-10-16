ALTER TABLE public.orders ADD COLUMN prebook_original_booked_by text;
-- Prebook assignment previously preserved booked_by, so existing values are the bookers.
UPDATE public.orders SET prebook_original_booked_by=booked_by WHERE prebook;
CREATE FUNCTION public.preserve_prebook_booker()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.prebook THEN NEW.prebook_original_booked_by := NEW.booked_by; END IF;
  ELSIF NEW.prebook THEN
    NEW.prebook_original_booked_by := COALESCE(OLD.prebook_original_booked_by, OLD.booked_by);
    IF OLD.prebook AND NEW.truck_id IS NULL AND NEW.trailer_id IS NULL
       AND NEW.driver1_id IS NULL AND NEW.driver2_id IS NULL
       AND (OLD.truck_id IS NOT NULL OR OLD.trailer_id IS NOT NULL OR OLD.driver1_id IS NOT NULL OR OLD.driver2_id IS NOT NULL)
       AND NEW.p_status='Available' THEN
      NEW.booked_by := NEW.prebook_original_booked_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_prebook_booker BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.preserve_prebook_booker();
REVOKE ALL ON FUNCTION public.preserve_prebook_booker() FROM PUBLIC, anon;
