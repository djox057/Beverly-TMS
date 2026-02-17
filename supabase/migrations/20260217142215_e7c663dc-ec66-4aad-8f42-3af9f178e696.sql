-- Add dispatcher_name column to dispatcher_salary_payments for deleted user tracking
ALTER TABLE dispatcher_salary_payments ADD COLUMN IF NOT EXISTS dispatcher_name TEXT;

-- Backfill existing records with names from profiles
UPDATE dispatcher_salary_payments dsp
SET dispatcher_name = p.full_name
FROM profiles p
WHERE dsp.user_id = p.user_id
AND dsp.dispatcher_name IS NULL;