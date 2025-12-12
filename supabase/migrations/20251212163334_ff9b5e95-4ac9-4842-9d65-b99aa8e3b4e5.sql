-- Backfill existing yard arrivals with truck numbers from current driver-truck relationships
UPDATE public.driver_yard_actions dya
SET truck_number = t.truck_number
FROM public.trucks t
WHERE t.driver1_id = dya.driver_id
  AND dya.truck_number IS NULL;