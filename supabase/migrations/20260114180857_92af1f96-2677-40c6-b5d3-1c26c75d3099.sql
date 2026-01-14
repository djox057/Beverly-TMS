-- Add paid column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE;