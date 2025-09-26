-- Clean up orphaned dispatcher assignments by setting them to NULL
-- where the dispatcher_id doesn't exist in profiles table
UPDATE trucks 
SET dispatcher_id = NULL 
WHERE dispatcher_id IS NOT NULL 
  AND dispatcher_id NOT IN (
    SELECT user_id FROM profiles WHERE role = 'dispatch'
  );