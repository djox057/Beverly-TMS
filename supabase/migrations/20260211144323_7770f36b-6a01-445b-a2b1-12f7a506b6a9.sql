
-- Unschedule all three jobs
SELECT cron.unschedule(16);
SELECT cron.unschedule(18);
SELECT cron.unschedule(21);

-- Reschedule Job 16: get-truck-distances-batch offset +2 min
SELECT cron.schedule(
  'get-truck-distances-batch-every-5-min',
  '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
  $$SELECT net.http_post(
    url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/get-truck-distances-batch',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer 30dc904f9b53fddb10acf6999373d02b7babab76fd9b0a939bf421a417ed685f"}'::jsonb,
    body:='{}'::jsonb
  );$$
);

-- Reschedule Job 18: hos-sync offset +1 min
SELECT cron.schedule(
  'hos-sync-every-minute',
  '1,4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58 * * * *',
  $$SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/hos-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;$$
);

-- Reschedule Job 21: sync-google-sheets offset +15 min
SELECT cron.schedule(
  'sync-google-sheets-every-30min',
  '15,45 * * * *',
  $$SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/sync-google-sheets',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;$$
);
