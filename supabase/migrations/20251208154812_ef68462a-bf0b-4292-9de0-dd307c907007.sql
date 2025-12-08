-- Add is_team field to driver_yard_actions
ALTER TABLE public.driver_yard_actions 
ADD COLUMN is_team boolean NOT NULL DEFAULT false;