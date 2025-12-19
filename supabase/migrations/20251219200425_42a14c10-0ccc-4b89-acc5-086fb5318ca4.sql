-- Add paid column to fuel_transactions
ALTER TABLE public.fuel_transactions 
ADD COLUMN paid boolean NOT NULL DEFAULT false;

-- Set all transactions before 12/8/2025 00:00 to paid = true
UPDATE public.fuel_transactions 
SET paid = true 
WHERE transaction_date < '2025-12-08';