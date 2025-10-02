-- Remove make and year columns from trucks table
ALTER TABLE public.trucks
  DROP COLUMN IF EXISTS make,
  DROP COLUMN IF EXISTS year;