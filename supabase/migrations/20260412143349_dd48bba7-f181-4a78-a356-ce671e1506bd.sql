
-- Simulate afterhours-start cron: switch dispatch → afterhours for users scheduled on 2026-04-12
UPDATE user_roles ur
SET role = 'afterhours'
FROM afterhours_schedule s
WHERE s.scheduled_date = '2026-04-12'
  AND s.user_id = ur.user_id
  AND ur.role = 'dispatch';
