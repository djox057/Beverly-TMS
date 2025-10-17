-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule existing job if it exists (ignore error if it doesn't exist)
DO $$
BEGIN
  PERFORM cron.unschedule('update-truck-distances-every-5-minutes');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule the update-truck-distances function to run every 5 minutes
SELECT cron.schedule(
  'update-truck-distances-every-5-minutes',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/update-truck-distances',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODYzNTIxNiwiZXhwIjoyMDc0MjExMjE2fQ.1KX0YlYbLVf7Vd2VVfYtLPT8iFjH5Xsqd7vMTJPuLAo"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);