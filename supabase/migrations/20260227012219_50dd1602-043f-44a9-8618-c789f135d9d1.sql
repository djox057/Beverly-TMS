-- Unlock all orders with delivery_datetime on 2026-02-27 or later
UPDATE public.orders
SET locked = false, updated_at = now()
WHERE delivery_datetime >= '2026-02-27T00:00:00+00:00'
  AND locked = true;