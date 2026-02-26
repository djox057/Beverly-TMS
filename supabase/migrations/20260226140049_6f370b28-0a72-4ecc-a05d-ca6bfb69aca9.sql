-- Remove old cron job that calls the wrong function
SELECT cron.unschedule('get-truck-distances-batch-every-5-min');

-- Create new cron job calling update-truck-distances every 5 minutes
SELECT cron.schedule(
  'update-truck-distances-cron',
  '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
  $$
  SELECT net.http_post(
    url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/update-truck-distances',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);