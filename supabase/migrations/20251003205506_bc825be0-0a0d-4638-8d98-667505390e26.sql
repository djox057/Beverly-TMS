-- First, update any existing office values to match the enum values
UPDATE public.profiles 
SET office = CASE 
  WHEN office ILIKE '%cacak%' THEN 'Čačak'
  WHEN office ILIKE '%kragujevac%' THEN 'KRAGUJEVAC'
  WHEN office ILIKE '%beograd%' THEN 'BEOGRAD'
  WHEN office ILIKE '%recovery%' THEN 'Recovery drivers'
  ELSE NULL
END
WHERE office IS NOT NULL;

-- Create enum for office values
CREATE TYPE public.office_location AS ENUM ('Čačak', 'KRAGUJEVAC', 'BEOGRAD', 'Recovery drivers');

-- Alter the profiles table to use the enum type
ALTER TABLE public.profiles 
ALTER COLUMN office TYPE office_location 
USING office::office_location;