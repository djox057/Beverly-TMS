ALTER TABLE public.trucks ADD COLUMN start_miles integer CHECK (start_miles >= 0);
COMMENT ON COLUMN public.trucks.start_miles IS 'Optional starting odometer in miles; separate from current mileage and oil service readings.';
