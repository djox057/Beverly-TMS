-- Add other_charges and other_charges_driver columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS other_charges numeric,
ADD COLUMN IF NOT EXISTS other_charges_driver numeric;

-- Add original columns for tracking changes
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS original_other_charges numeric,
ADD COLUMN IF NOT EXISTS original_other_charges_driver numeric;