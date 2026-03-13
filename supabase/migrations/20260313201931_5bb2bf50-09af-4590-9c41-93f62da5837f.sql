
-- Add scheduled_date column to afterhours_assignments
ALTER TABLE public.afterhours_assignments 
  ADD COLUMN scheduled_date date;

-- Drop the old unique constraint (afterhours_user_id, driver_id)
-- First find and drop it
ALTER TABLE public.afterhours_assignments 
  DROP CONSTRAINT IF EXISTS afterhours_assignments_afterhours_user_id_driver_id_key;

-- Add new unique constraint including scheduled_date
ALTER TABLE public.afterhours_assignments
  ADD CONSTRAINT afterhours_assignments_user_driver_date_key 
  UNIQUE (afterhours_user_id, driver_id, scheduled_date);
