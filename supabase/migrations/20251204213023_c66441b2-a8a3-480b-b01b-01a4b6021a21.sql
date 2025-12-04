-- Add random drug test date field to drivers table
ALTER TABLE public.drivers
ADD COLUMN random_drug_test_date DATE;