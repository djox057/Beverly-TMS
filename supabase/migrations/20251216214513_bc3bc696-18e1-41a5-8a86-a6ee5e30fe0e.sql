-- Make amount column NOT NULL (it already has a default of 0)
ALTER TABLE public.repairs 
ALTER COLUMN amount SET NOT NULL;