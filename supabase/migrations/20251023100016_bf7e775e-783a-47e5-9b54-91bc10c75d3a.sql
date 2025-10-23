-- Update any existing "Recovery drivers" office values to NULL
UPDATE public.profiles 
SET office = NULL
WHERE office = 'Recovery drivers';

-- Drop the old enum constraint and recreate without "Recovery drivers"
-- First, alter the column to text temporarily
ALTER TABLE public.profiles 
ALTER COLUMN office TYPE text;

-- Drop the old enum
DROP TYPE IF EXISTS public.office_location;

-- Create new enum without "Recovery drivers"
CREATE TYPE public.office_location AS ENUM ('Čačak', 'KRAGUJEVAC', 'BEOGRAD');

-- Alter the column back to the new enum type
ALTER TABLE public.profiles 
ALTER COLUMN office TYPE office_location 
USING office::office_location;