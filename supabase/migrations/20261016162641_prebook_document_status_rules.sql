ALTER TABLE public.orders ALTER COLUMN p_status SET DEFAULT 'Available';
UPDATE public.orders SET p_status = CASE WHEN canceled THEN 'Canceled' WHEN lower(p_status)='covered' THEN 'Covered' ELSE 'Available' END;
ALTER TABLE public.orders ADD CONSTRAINT orders_p_status_options CHECK (p_status IN ('Available','Covered','Canceled'));
CREATE OR REPLACE FUNCTION public.set_prebook_covered()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.canceled IS DISTINCT FROM OLD.canceled THEN
      NEW.p_status := CASE WHEN NEW.canceled THEN 'Canceled' ELSE 'Available' END;
    ELSIF NEW.p_status IS DISTINCT FROM OLD.p_status THEN
      NEW.canceled := NEW.p_status='Canceled';
    END IF;
  ELSIF NEW.p_status='Canceled' THEN
    NEW.canceled := true;
  END IF;
  IF NEW.canceled THEN
    NEW.p_status := 'Canceled';
  ELSIF NEW.prebook AND NEW.truck_id IS NOT NULL AND NEW.driver1_id IS NOT NULL THEN
    IF TG_OP='INSERT' THEN NEW.p_status := 'Covered';
    ELSIF NEW.driver1_id IS DISTINCT FROM OLD.driver1_id OR NEW.truck_id IS DISTINCT FROM OLD.truck_id OR NOT OLD.prebook THEN NEW.p_status := 'Covered';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.guard_prebook_edits()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE elevated boolean; pod_completion boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  elevated := public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin');
  pod_completion := OLD.prebook AND NOT NEW.prebook
    AND (to_jsonb(NEW) - ARRAY['prebook','updated_at']) = (to_jsonb(OLD) - ARRAY['prebook','updated_at'])
    AND EXISTS(SELECT 1 FROM public.order_files WHERE order_id=OLD.id AND file_category='POD');
  IF NOT elevated AND (NEW.prebook_note IS DISTINCT FROM OLD.prebook_note OR NEW.p_status IS DISTINCT FROM OLD.p_status) THEN
    RAISE EXCEPTION 'Only managers and admins can edit prebook notes and status' USING ERRCODE='42501';
  END IF;
  IF NOT elevated AND OLD.prebook AND public.has_role(auth.uid(),'dispatch') AND NEW IS DISTINCT FROM OLD AND NOT pod_completion THEN
    RAISE EXCEPTION 'Dispatchers have read-only access to prebook loads' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.finish_prebook_on_pod()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.file_category='POD' THEN
    UPDATE public.orders SET prebook=false WHERE id=NEW.order_id AND prebook;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER finish_prebook_on_pod AFTER INSERT OR UPDATE OF file_category,order_id ON public.order_files
FOR EACH ROW EXECUTE FUNCTION public.finish_prebook_on_pod();
REVOKE ALL ON FUNCTION public.finish_prebook_on_pod() FROM PUBLIC,anon;
UPDATE public.orders o SET prebook=false WHERE prebook AND EXISTS(SELECT 1 FROM public.order_files f WHERE f.order_id=o.id AND f.file_category='POD');
