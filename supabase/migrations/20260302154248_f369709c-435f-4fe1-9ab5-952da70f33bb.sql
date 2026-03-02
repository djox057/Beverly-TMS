-- Update cron schedule: reduce truck-distances from every 5min to every 10min
-- Offset to :03,:13,:23,:33,:43,:53 to minimize overlap with hos-sync (every 3min)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'update-truck-distances-cron'),
  schedule := '3,13,23,33,43,53 * * * *'
);