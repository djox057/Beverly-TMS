SELECT cron.unschedule('hos-sync-every-5-min');

SELECT cron.schedule(
  'hos-sync-every-5-min',
  '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/hos-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET')
    ),
    body := '{"time":"now"}'::jsonb
  ) AS request_id;
  $$
);