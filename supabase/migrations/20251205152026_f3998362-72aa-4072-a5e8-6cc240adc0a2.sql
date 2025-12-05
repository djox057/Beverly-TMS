-- Update all canceled orders to set mileage = dh_miles
UPDATE public.orders
SET mileage = COALESCE(dh_miles, 0)
WHERE canceled = true;