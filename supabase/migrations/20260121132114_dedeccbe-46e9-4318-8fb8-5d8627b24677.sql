-- Add maintenance tracking date fields to trucks table
ALTER TABLE public.trucks 
ADD COLUMN oil_change_date DATE,
ADD COLUMN tires_swap_date DATE,
ADD COLUMN maintenance_check_date DATE;