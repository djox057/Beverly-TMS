-- An assigned prebook follows normal load permissions for its owner or
-- current driver dispatcher. Check OLD so an unrelated dispatcher cannot gain
-- access by assigning the load to themselves in the same UPDATE.
-- Keep the prebook flag and original booker for reporting/history.
CREATE OR REPLACE FUNCTION public.guard_prebook_edits()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE elevated boolean; pod_completion boolean; last_order_maintenance boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF OLD.prebook
      AND OLD.truck_id IS NOT NULL AND OLD.driver1_id IS NOT NULL
      AND public.has_role(auth.uid(), 'dispatch')
      AND (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()
          AND (OLD.booked_by = p.full_name OR OLD.booked_by = p.user_id::text))
        OR EXISTS (SELECT 1 FROM public.drivers d
          WHERE d.id IN (OLD.driver1_id, OLD.driver2_id)
            AND d.dispatcher_id = auth.uid())
      ) THEN
    -- RLS and the other normal-load triggers still apply.
    RETURN NEW;
  END IF;
  elevated := public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin');
  pod_completion := OLD.prebook AND NOT NEW.prebook
    AND (to_jsonb(NEW) - ARRAY['prebook','updated_at']) = (to_jsonb(OLD) - ARRAY['prebook','updated_at'])
    AND EXISTS(SELECT 1 FROM public.order_files WHERE order_id=OLD.id AND file_category='POD');
  last_order_maintenance := pg_trigger_depth() > 1
    AND NEW.is_last_order IS DISTINCT FROM OLD.is_last_order
    AND (to_jsonb(NEW) - ARRAY['is_last_order','updated_at']) = (to_jsonb(OLD) - ARRAY['is_last_order','updated_at']);
  IF NOT elevated AND (NEW.prebook_note IS DISTINCT FROM OLD.prebook_note OR NEW.p_status IS DISTINCT FROM OLD.p_status) THEN
    RAISE EXCEPTION 'Only managers and admins can edit prebook notes and status' USING ERRCODE='42501';
  END IF;
  IF NOT elevated AND OLD.prebook AND public.has_role(auth.uid(),'dispatch')
      AND NEW IS DISTINCT FROM OLD AND NOT pod_completion AND NOT last_order_maintenance THEN
    RAISE EXCEPTION 'Dispatchers have read-only access to prebook loads' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
