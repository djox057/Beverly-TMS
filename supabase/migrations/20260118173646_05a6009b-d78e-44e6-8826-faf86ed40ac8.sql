-- Add truck_number and dispatcher_name columns to driver_problems
ALTER TABLE public.driver_problems 
ADD COLUMN truck_number TEXT,
ADD COLUMN dispatcher_name TEXT;