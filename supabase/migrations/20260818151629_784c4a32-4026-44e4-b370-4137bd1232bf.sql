-- Flag the latest (non-canceled) order per driver so proximity scans read ~hundreds of rows instead of thousands
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_last_order boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_is_last_order
  ON public.orders (is_last_order)
  WHERE is_last_order = true;

CREATE OR REPLACE FUNCTION public.refresh_driver_last_order(_driver uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _latest uuid;
BEGIN
  IF _driver IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO _latest
  FROM public.orders
  WHERE driver1_id = _driver
    AND canceled = false
  ORDER BY pickup_datetime DESC NULLS LAST, created_at DESC
  LIMIT 1;

  UPDATE public.orders o
  SET is_last_order = (o.id = _latest)
  WHERE o.driver1_id = _driver
    AND o.is_last_order <> (o.id = _latest);
END;
$$;

CREATE OR REPLACE FUNCTION public.orders_sync_last_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_driver_last_order(OLD.driver1_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_driver_last_order(NEW.driver1_id);
  IF TG_OP = 'UPDATE' AND OLD.driver1_id IS DISTINCT FROM NEW.driver1_id THEN
    PERFORM public.refresh_driver_last_order(OLD.driver1_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_sync_last_order ON public.orders;
CREATE TRIGGER trg_orders_sync_last_order
AFTER INSERT OR DELETE OR UPDATE OF driver1_id, canceled, pickup_datetime ON public.orders
FOR EACH ROW
WHEN (pg_trigger_depth() < 2)
EXECUTE FUNCTION public.orders_sync_last_order();

-- Backfill
WITH latest AS (
  SELECT DISTINCT ON (driver1_id) id
  FROM public.orders
  WHERE driver1_id IS NOT NULL AND canceled = false
  ORDER BY driver1_id, pickup_datetime DESC NULLS LAST, created_at DESC
)
UPDATE public.orders o
SET is_last_order = (o.id IN (SELECT id FROM latest))
WHERE o.is_last_order <> (o.id IN (SELECT id FROM latest));