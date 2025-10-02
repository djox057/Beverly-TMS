-- Remove unnecessary columns from brokers table
ALTER TABLE public.brokers 
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS zip_code;

-- Make mc_number and address required (NOT NULL)
-- First update any existing NULL values
UPDATE public.brokers SET mc_number = 'PENDING' WHERE mc_number IS NULL;
UPDATE public.brokers SET address = 'PENDING' WHERE address IS NULL;

-- Now add NOT NULL constraints
ALTER TABLE public.brokers 
  ALTER COLUMN mc_number SET NOT NULL,
  ALTER COLUMN address SET NOT NULL;

-- Add unique constraint on mc_number
ALTER TABLE public.brokers 
  ADD CONSTRAINT brokers_mc_number_unique UNIQUE (mc_number);