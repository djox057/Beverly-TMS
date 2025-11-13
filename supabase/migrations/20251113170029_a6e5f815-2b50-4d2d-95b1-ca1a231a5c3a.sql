-- Add first_name and last_name columns to drivers table
ALTER TABLE public.drivers 
ADD COLUMN first_name TEXT,
ADD COLUMN last_name TEXT;

-- Migrate existing data by splitting name on first space
UPDATE public.drivers
SET 
  first_name = CASE 
    WHEN position(' ' in name) > 0 THEN split_part(name, ' ', 1)
    ELSE name
  END,
  last_name = CASE 
    WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
    ELSE ''
  END
WHERE first_name IS NULL;

-- Make name column nullable since we're transitioning
-- We'll keep it for backward compatibility but won't require it
ALTER TABLE public.drivers 
ALTER COLUMN name DROP NOT NULL;

-- Add a comment explaining the migration
COMMENT ON COLUMN public.drivers.first_name IS 'Driver first name - migrated from name field';
COMMENT ON COLUMN public.drivers.last_name IS 'Driver last name - migrated from name field';