-- Add IPASS and expiration date columns to trucks table
ALTER TABLE public.trucks 
ADD COLUMN ipass TEXT,
ADD COLUMN dot_inspection_date DATE,
ADD COLUMN plate_expiration_date DATE,
ADD COLUMN insurance_expiration_date DATE;