-- Drop the existing constraint
ALTER TABLE public.driver_yard_actions DROP CONSTRAINT driver_yard_actions_action_type_check;

-- Add new constraint with safety option
ALTER TABLE public.driver_yard_actions ADD CONSTRAINT driver_yard_actions_action_type_check 
CHECK (action_type = ANY (ARRAY['maintenance'::text, 'return_truck'::text, 'safety'::text]));