-- Add medical_card_expiration_date column to drivers table
ALTER TABLE public.drivers 
ADD COLUMN medical_card_expiration_date date;