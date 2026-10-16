ALTER TABLE public.orders ADD COLUMN p_status text NOT NULL DEFAULT 'Open' CHECK (length(btrim(p_status)) > 0);
-- A prebook starts unassigned, but remains in Prebook after it is covered.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS prebook_has_no_assignment;
CREATE OR REPLACE FUNCTION public.guard_prebook_edits()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE elevated boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  elevated := public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin');
  IF NOT elevated AND (NEW.prebook_note IS DISTINCT FROM OLD.prebook_note OR NEW.p_status IS DISTINCT FROM OLD.p_status) THEN
    RAISE EXCEPTION 'Only managers and admins can edit prebook notes and status' USING ERRCODE = '42501';
  END IF;
  IF NOT elevated AND OLD.prebook AND public.has_role(auth.uid(), 'dispatch') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Dispatchers have read-only access to prebook loads' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.set_prebook_covered()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.prebook AND NEW.truck_id IS NOT NULL AND NEW.driver1_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.p_status := 'Covered';
    ELSIF NEW.driver1_id IS DISTINCT FROM OLD.driver1_id OR NEW.truck_id IS DISTINCT FROM OLD.truck_id OR NOT OLD.prebook THEN
      NEW.p_status := 'Covered';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER set_prebook_covered BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_prebook_covered();
REVOKE ALL ON FUNCTION public.set_prebook_covered() FROM PUBLIC, anon;
