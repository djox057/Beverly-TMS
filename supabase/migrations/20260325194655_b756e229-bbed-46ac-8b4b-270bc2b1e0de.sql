-- Clean up orphaned afterhours_schedule rows with NULL user_id
DELETE FROM public.afterhours_schedule WHERE user_id IS NULL;

-- Clean up rows referencing users that no longer exist in profiles
DELETE FROM public.afterhours_schedule 
WHERE user_id IS NOT NULL 
  AND user_id NOT IN (SELECT user_id FROM public.profiles);