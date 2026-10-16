CREATE OR REPLACE FUNCTION public.finish_prebook_on_pod()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.file_category='POD' THEN
    UPDATE public.orders SET prebook=false WHERE id=NEW.order_id AND prebook;
  ELSIF NEW.file_category='BOL' THEN
    -- Emit an order update for the existing realtime subscription, without changing its status.
    UPDATE public.orders SET updated_at=updated_at WHERE id=NEW.order_id AND prebook;
  END IF;
  RETURN NEW;
END;
$$;
