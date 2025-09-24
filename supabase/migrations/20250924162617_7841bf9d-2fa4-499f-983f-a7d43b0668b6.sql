-- Add file_category column to order_files table
ALTER TABLE public.order_files 
ADD COLUMN file_category text CHECK (file_category IN ('RC', 'BOL', 'POD', 'ADDITIONAL')) DEFAULT 'ADDITIONAL';

-- Update existing files to have ADDITIONAL category by default
UPDATE public.order_files 
SET file_category = 'ADDITIONAL' 
WHERE file_category IS NULL;