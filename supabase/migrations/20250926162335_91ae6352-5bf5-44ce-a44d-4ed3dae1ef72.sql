-- Clean up invalid dispatcher assignments
-- Set dispatcher_id to NULL for trucks that have invalid dispatcher references
UPDATE trucks 
SET dispatcher_id = NULL 
WHERE dispatcher_id IS NOT NULL 
  AND dispatcher_id NOT IN (
    SELECT user_id FROM profiles WHERE role = 'dispatch'
  );