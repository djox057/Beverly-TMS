-- Add unique constraint on user_id and scheduled_date to enable proper upsert
ALTER TABLE public.afterhours_schedule 
ADD CONSTRAINT afterhours_schedule_user_date_unique UNIQUE (user_id, scheduled_date);