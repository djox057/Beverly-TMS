-- Add office column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN office text;

-- Add a comment to describe the column
COMMENT ON COLUMN public.profiles.office IS 'Office location for the user (Čačak, KRAGUJEVAC, BEOGRAD, Recovery drivers)';