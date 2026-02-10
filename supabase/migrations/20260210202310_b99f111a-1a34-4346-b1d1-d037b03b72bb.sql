
-- Backfill dispatcher_name for orphaned records (deleted users)
-- Matija Belopavlovic-Matthew
UPDATE public.dispatcher_off_duty_days 
SET dispatcher_name = 'Matija Belopavlovic-Matthew' 
WHERE dispatcher_id = '05d173c6-bba9-4bf5-a95c-3b7dac4e6c6f' 
AND dispatcher_name IS NULL;
