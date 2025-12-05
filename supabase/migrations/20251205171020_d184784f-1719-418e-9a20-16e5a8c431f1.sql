-- Lock orders with delivery_datetime of 2025-12-03 18:00:00 UTC and older
UPDATE public.orders
SET locked = true
WHERE delivery_datetime <= '2025-12-03T18:00:00+00:00'
  AND locked = false
  AND delivery_datetime IS NOT NULL;