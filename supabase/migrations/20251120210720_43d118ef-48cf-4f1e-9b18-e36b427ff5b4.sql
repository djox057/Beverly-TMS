-- Add going_yard column to drivers table
ALTER TABLE public.drivers 
ADD COLUMN going_yard boolean NOT NULL DEFAULT false;