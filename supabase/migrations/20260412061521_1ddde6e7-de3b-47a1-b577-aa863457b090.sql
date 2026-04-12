
-- Unschedule existing afterhours cron jobs
SELECT cron.unschedule('afterhours-start');
SELECT cron.unschedule('afterhours-end');
SELECT cron.unschedule('send-afterhours-sms-daily');

-- Re-create with SUPABASE_SERVICE_ROLE_KEY from vault instead of CRON_SECRET
SELECT cron.schedule(
  'afterhours-start',
  '0 12 * * 0,6',
  $$
  SELECT net.http_post(
    url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/process-afterhours-schedule?action=start',
    headers:=jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=30000
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'afterhours-end',
  '0 23 * * 0,6',
  $$
  SELECT net.http_post(
    url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/process-afterhours-schedule?action=end',
    headers:=jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=30000
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'send-afterhours-sms-daily',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/send-afterhours-sms',
    headers:=jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=120000
  ) AS request_id;
  $$
);
