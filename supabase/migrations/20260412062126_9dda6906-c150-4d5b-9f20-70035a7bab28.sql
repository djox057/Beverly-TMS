
-- Fix Apr 11 users stuck on afterhours role - switch them back to dispatch
UPDATE user_roles ur
SET role = 'dispatch'
FROM afterhours_schedule s
WHERE s.scheduled_date = '2026-04-11'
  AND s.user_id = ur.user_id
  AND ur.role = 'afterhours';
