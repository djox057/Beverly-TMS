CREATE OR REPLACE FUNCTION public.guard_prebook_edits()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE elevated boolean;
BEGIN
  -- Trusted server jobs retain their existing access; signed-in users use app roles.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  elevated := public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin');
  IF NOT elevated AND NEW.prebook_note IS DISTINCT FROM OLD.prebook_note THEN
    RAISE EXCEPTION 'Only managers and admins can edit prebook notes' USING ERRCODE = '42501';
  END IF;
  IF NOT elevated AND OLD.prebook AND public.has_role(auth.uid(), 'dispatch') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Dispatchers have read-only access to prebook loads' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_prebook_edits BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_prebook_edits();
REVOKE ALL ON FUNCTION public.guard_prebook_edits() FROM PUBLIC, anon;
