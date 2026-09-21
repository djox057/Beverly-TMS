DROP POLICY IF EXISTS "Roles can delete orders" ON public.orders;

CREATE OR REPLACE FUNCTION public.prevent_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Internal placeholder rows used by driver "game over" handling are not real loads.
  IF OLD.load_number = 'GAME-OVER' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Loads cannot be deleted; cancel the load instead';
END;
$$;

DROP TRIGGER IF EXISTS prevent_order_delete_trg ON public.orders;
CREATE TRIGGER prevent_order_delete_trg
BEFORE DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_order_delete();