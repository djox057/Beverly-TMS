-- Change afterhours_schedule FK from CASCADE to NO ACTION to preserve data on user deletion
ALTER TABLE public.afterhours_schedule DROP CONSTRAINT afterhours_schedule_user_id_fkey;
ALTER TABLE public.afterhours_schedule ADD CONSTRAINT afterhours_schedule_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Make user_id nullable so SET NULL works
ALTER TABLE public.afterhours_schedule ALTER COLUMN user_id DROP NOT NULL;