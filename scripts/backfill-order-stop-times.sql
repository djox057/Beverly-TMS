-- Run once during a maintenance window after deploying the corrected writers.
-- The locks keep the comparison stable while preserving genuine reschedule history.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.orders, public.pickup_drops IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.orders DISABLE TRIGGER capture_original_delivery_datetime_trigger;
-- Set only the changed column. Pickup updates also refresh the driver's last-order flag.
WITH pickup AS (
  SELECT order_id, min(datetime) AS appointment
  FROM public.pickup_drops WHERE type = 'pickup' AND datetime IS NOT NULL GROUP BY order_id
)
UPDATE public.orders o SET pickup_datetime = s.appointment
FROM pickup s WHERE o.id = s.order_id AND o.pickup_datetime IS DISTINCT FROM s.appointment;

WITH delivery AS (
  SELECT order_id, max(datetime) AS appointment
  FROM public.pickup_drops WHERE type IN ('delivery','drop') AND datetime IS NOT NULL GROUP BY order_id
)
UPDATE public.orders o SET delivery_datetime = s.appointment
FROM delivery s WHERE o.id = s.order_id AND o.delivery_datetime IS DISTINCT FROM s.appointment;
ALTER TABLE public.orders ENABLE TRIGGER capture_original_delivery_datetime_trigger;
COMMIT;
