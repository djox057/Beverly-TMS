-- Drop the existing check constraint
ALTER TABLE driver_yard_actions DROP CONSTRAINT IF EXISTS driver_yard_actions_action_type_check;

-- Add new check constraint with 'recovery' type
ALTER TABLE driver_yard_actions ADD CONSTRAINT driver_yard_actions_action_type_check 
CHECK (action_type IN ('maintenance', 'return_truck', 'safety', 'recovery'));

-- Move all existing return_truck entries to recovery
UPDATE driver_yard_actions 
SET action_type = 'recovery' 
WHERE action_type = 'return_truck';