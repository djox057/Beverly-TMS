-- Add truck_number column to driver_yard_actions table to persist truck info
ALTER TABLE public.driver_yard_actions 
ADD COLUMN truck_number text;

-- Add comment for clarity
COMMENT ON COLUMN public.driver_yard_actions.truck_number IS 'Stores the truck number at the time of yard action creation, persists even if driver-truck relationship changes';