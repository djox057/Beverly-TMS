-- Add expiration date columns to trailers table
ALTER TABLE public.trailers 
ADD COLUMN dot_inspection_date DATE,
ADD COLUMN plate_expiration_date DATE,
ADD COLUMN insurance_expiration_date DATE;