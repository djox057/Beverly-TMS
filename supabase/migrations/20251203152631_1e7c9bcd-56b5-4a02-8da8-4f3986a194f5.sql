-- Add is_checked column to driver_yard_actions
ALTER TABLE driver_yard_actions ADD COLUMN is_checked boolean DEFAULT false;

-- Add is_checked_for_termination column to drivers
ALTER TABLE drivers ADD COLUMN is_checked_for_termination boolean DEFAULT false;