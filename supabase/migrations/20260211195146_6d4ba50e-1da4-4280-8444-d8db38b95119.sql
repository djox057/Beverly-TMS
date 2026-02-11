
-- Add dispatcher_name to afterhours_schedule for deleted user lookups (like dispatcher_off_duty_days has)
ALTER TABLE public.afterhours_schedule ADD COLUMN dispatcher_name text;

-- Backfill existing records with names from profiles
UPDATE public.afterhours_schedule AS a
SET dispatcher_name = p.full_name
FROM public.profiles AS p
WHERE a.user_id = p.user_id AND a.dispatcher_name IS NULL;
