-- Drop old jobs (use DO block to ignore if absent)
DO $$
BEGIN
  PERFORM cron.unschedule('afterhours-start');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('afterhours-end');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('afterhours-end-dst');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('send-afterhours-sms-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- afterhours-start: target 07:00 Chicago (12 UTC during CDT, 13 UTC during CST). Fire at both.
SELECT cron.schedule(
  'afterhours-start',
  '0 12,13 * * 0,6',
  $$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/process-afterhours-schedule?action=start',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- afterhours-end: target 18:00 Chicago. CDT=23 UTC same day, CST=00 UTC next day.
-- Sat/Sun 23:00 UTC covers CDT.
SELECT cron.schedule(
  'afterhours-end',
  '0 23 * * 0,6',
  $$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/process-afterhours-schedule?action=end',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
-- Mon/Sun 00:00 UTC covers CST (Sat 18:00 CST = Sun 00:00 UTC; Sun 18:00 CST = Mon 00:00 UTC).
SELECT cron.schedule(
  'afterhours-end-dst',
  '0 0 * * 0,1',
  $$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/process-afterhours-schedule?action=end',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- send-afterhours-sms-daily: target 08:00 Chicago (13 UTC CDT, 14 UTC CST). Fire at both.
SELECT cron.schedule(
  'send-afterhours-sms-daily',
  '0 13,14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/send-afterhours-sms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);