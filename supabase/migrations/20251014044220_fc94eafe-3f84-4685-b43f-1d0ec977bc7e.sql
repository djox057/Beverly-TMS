-- Unschedule the existing cron job
SELECT cron.unschedule('update-truck-distances');

-- Create cron job to update truck distances every 5 minutes
SELECT cron.schedule(
  'update-truck-distances',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
        url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/update-truck-distances',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);