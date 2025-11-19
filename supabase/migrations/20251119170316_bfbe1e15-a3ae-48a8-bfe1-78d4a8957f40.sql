-- Add agreement_start_date column to drivers table
ALTER TABLE public.drivers 
ADD COLUMN agreement_start_date DATE;