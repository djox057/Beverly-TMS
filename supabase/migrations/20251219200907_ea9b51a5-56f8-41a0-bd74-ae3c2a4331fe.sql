-- Fix transactions before 12/8 that should be marked as paid
UPDATE public.fuel_transactions 
SET paid = true 
WHERE transaction_date < '2025-12-08' AND paid = false;