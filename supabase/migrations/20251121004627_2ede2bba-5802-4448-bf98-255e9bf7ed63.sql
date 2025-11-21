-- Add arrival_datetime column to driver_yard_actions table
ALTER TABLE public.driver_yard_actions 
ADD COLUMN arrival_datetime timestamp with time zone;

-- Set a default value for existing rows
UPDATE public.driver_yard_actions 
SET arrival_datetime = created_at 
WHERE arrival_datetime IS NULL;