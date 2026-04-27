-- Schedule auto-assign-weekend-drivers edge function to run Saturdays at 01:00 Chicago time
-- Two entries: 06:00 UTC (CDT, summer) and 07:00 UTC (CST, winter). The function
-- self-checks Chicago weekday=Sat & hour=1 so only the active DST window does work.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-assign-weekend-drivers-cdt') THEN
    PERFORM cron.unschedule('auto-assign-weekend-drivers-cdt');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-assign-weekend-drivers-cst') THEN
    PERFORM cron.unschedule('auto-assign-weekend-drivers-cst');
  END IF;
END $$;

-- CDT: 06:00 UTC Saturday = 01:00 CDT Saturday
SELECT cron.schedule(
  'auto-assign-weekend-drivers-cdt',
  '0 6 * * 6',
  $cron$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/auto-assign-weekend-drivers',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}'::jsonb,
    body := jsonb_build_object('source', 'cron-cdt', 'time', now())
  );
  $cron$
);

-- CST: 07:00 UTC Saturday = 01:00 CST Saturday
SELECT cron.schedule(
  'auto-assign-weekend-drivers-cst',
  '0 7 * * 6',
  $cron$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/auto-assign-weekend-drivers',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}'::jsonb,
    body := jsonb_build_object('source', 'cron-cst', 'time', now())
  );
  $cron$
);