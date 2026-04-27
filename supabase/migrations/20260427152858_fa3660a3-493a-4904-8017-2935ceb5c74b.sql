-- Schedule restore-dispatchers-on-duty to run every Friday at 23:59 America/Chicago.
-- We schedule two UTC entries (one for CST = winter, one for CDT = summer); the
-- edge function self-checks the actual Chicago weekday/hour so only the
-- appropriate one performs work.

-- Remove any prior schedules with the same names (idempotent re-run)
DO $$
DECLARE
  j TEXT;
BEGIN
  FOREACH j IN ARRAY ARRAY['restore-dispatchers-on-duty-cst', 'restore-dispatchers-on-duty-cdt']
  LOOP
    PERFORM cron.unschedule(j) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j);
  END LOOP;
END $$;

-- CST (winter, UTC-6): Fri 23:59 CST = Sat 05:59 UTC
SELECT cron.schedule(
  'restore-dispatchers-on-duty-cst',
  '59 5 * * 6',
  $$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/restore-dispatchers-on-duty',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}'::jsonb,
    body := jsonb_build_object('source', 'cron-cst', 'time', now())
  );
  $$
);

-- CDT (summer, UTC-5): Fri 23:59 CDT = Sat 04:59 UTC
SELECT cron.schedule(
  'restore-dispatchers-on-duty-cdt',
  '59 4 * * 6',
  $$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/restore-dispatchers-on-duty',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}'::jsonb,
    body := jsonb_build_object('source', 'cron-cdt', 'time', now())
  );
  $$
);