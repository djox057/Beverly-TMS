-- Add end_datetime column to pickup_drops table to store appointment window end times
ALTER TABLE public.pickup_drops 
ADD COLUMN end_datetime timestamp with time zone NULL;

-- Add helpful comment
COMMENT ON COLUMN public.pickup_drops.end_datetime IS 'End time of appointment window (datetime field is the start time)';