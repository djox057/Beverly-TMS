-- Remove the old fleet_assignment text field and add dispatcher_id foreign key
ALTER TABLE public.trucks DROP COLUMN IF EXISTS fleet_assignment;

-- Add dispatcher_id column that references profiles table
ALTER TABLE public.trucks ADD COLUMN dispatcher_id UUID REFERENCES public.profiles(id);

-- Create index for better performance on dispatcher queries
CREATE INDEX IF NOT EXISTS idx_trucks_dispatcher_id ON public.trucks(dispatcher_id);