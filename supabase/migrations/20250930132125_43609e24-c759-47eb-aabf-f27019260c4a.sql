-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule HOS sync to run every 5 minutes
SELECT cron.schedule(
  'hos-sync-every-5-minutes',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
        url:='https://wkebqjojjdpyqpxqkbvx.supabase.co/functions/v1/hos-sync',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrZWJxam9qamRweXFweHFrYnZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI5NzE3MDEsImV4cCI6MjA0ODU0NzcwMX0.cI48G9s4wDHeBBZo9D8EkEJxIdNafqh-MxXJkxMUE7g"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);