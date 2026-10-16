CREATE OR REPLACE FUNCTION public.finish_prebook_on_pod()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  -- Keep Prebook identity for statistics; notify its existing order subscription.
  IF NEW.file_category IN ('BOL','POD') THEN
    UPDATE public.orders SET updated_at=updated_at WHERE id=NEW.order_id AND prebook;
  END IF;
  RETURN NEW;
END;
$$;
