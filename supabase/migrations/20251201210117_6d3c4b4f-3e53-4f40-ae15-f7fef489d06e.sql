-- Update mileage to dh_miles for all canceled orders
UPDATE public.orders 
SET mileage = COALESCE(dh_miles, 0)
WHERE canceled = true;