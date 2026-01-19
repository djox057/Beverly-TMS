-- Add status column to driver_problems table
ALTER TABLE public.driver_problems 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';

-- Add comment for documentation
COMMENT ON COLUMN public.driver_problems.status IS 'Status of the problem: open, in_progress, resolved, etc.';