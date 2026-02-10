
-- Add dispatcher_name to dispatcher_off_duty_days for supporting deleted users
ALTER TABLE public.dispatcher_off_duty_days ADD COLUMN IF NOT EXISTS dispatcher_name text DEFAULT NULL;

-- Backfill existing records: set name from profiles where possible
UPDATE public.dispatcher_off_duty_days d
SET dispatcher_name = p.full_name
FROM profiles p
WHERE d.dispatcher_id = p.user_id
AND d.dispatcher_name IS NULL;
