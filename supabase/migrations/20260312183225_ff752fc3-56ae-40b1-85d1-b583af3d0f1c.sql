SELECT cron.unschedule('hos-sync-every-minute');

SELECT cron.schedule(
  'hos-sync-every-5-min',
  '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
  $$
  SELECT net.http_post(
    url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/hos-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}'::jsonb,
    body:='{"time": "now"}'::jsonb
  ) AS request_id;
  $$
);