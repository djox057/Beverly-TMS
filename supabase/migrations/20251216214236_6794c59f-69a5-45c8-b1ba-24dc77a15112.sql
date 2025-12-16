-- Add repair_date field to repairs table
ALTER TABLE public.repairs 
ADD COLUMN repair_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Add comment for clarity
COMMENT ON COLUMN public.repairs.repair_date IS 'The date when the repair occurred (stored in UTC, displayed in Chicago time)';