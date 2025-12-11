-- Add company driver fields to drivers table
ALTER TABLE public.drivers 
ADD COLUMN is_company_driver boolean DEFAULT false,
ADD COLUMN cents_per_mile integer;