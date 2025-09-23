-- Add internal load number and broker load number to orders table
ALTER TABLE public.orders 
ADD COLUMN internal_load_number integer,
ADD COLUMN broker_load_number text;

-- Update the existing load_number column to be more descriptive (this will be the broker load number)
-- We'll keep load_number for backward compatibility but use broker_load_number going forward