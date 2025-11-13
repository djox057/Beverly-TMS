-- Schedule the cron job to run daily at 3 PM Chicago time (20:00 UTC during standard time, 19:00 UTC during daylight saving)
-- Using 20:00 UTC as it covers most of the year (Chicago is UTC-6 in winter, UTC-5 in summer)
SELECT cron.schedule(
  'record-dispatcher-driver-counts-daily',
  '0 20 * * *',
  $$
  SELECT
    net.http_post(
        url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/record-dispatcher-driver-counts',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);