-- Add company column to fuel_transactions table
ALTER TABLE public.fuel_transactions 
ADD COLUMN IF NOT EXISTS company TEXT;