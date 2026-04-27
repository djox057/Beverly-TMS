-- Schedule send-afterhours-sms to run Sat & Sun at 08:00 Chicago time.
-- 13:00 UTC = 08:00 CDT (summer), 14:00 UTC = 08:00 CST (winter).
-- The edge function self-checks Chicago hour == 8, so only the active DST window does work.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-afterhours-sms-cdt') THEN
    PERFORM cron.unschedule('send-afterhours-sms-cdt');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-afterhours-sms-cst') THEN
    PERFORM cron.unschedule('send-afterhours-sms-cst');
  END IF;
END $$;

-- CDT: 13:00 UTC Sat & Sun = 08:00 CDT
SELECT cron.schedule(
  'send-afterhours-sms-cdt',
  '0 13 * * 6,0',
  $cron$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/send-afterhours-sms',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM", "x-cron-secret": "30dc904f9b53fddb10acf6999373d02b7babab76fd9b0a939bf421a417ed685f"}'::jsonb,
    body := jsonb_build_object('source', 'cron-cdt', 'time', now())
  );
  $cron$
);

-- CST: 14:00 UTC Sat & Sun = 08:00 CST
SELECT cron.schedule(
  'send-afterhours-sms-cst',
  '0 14 * * 6,0',
  $cron$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/send-afterhours-sms',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM", "x-cron-secret": "30dc904f9b53fddb10acf6999373d02b7babab76fd9b0a939bf421a417ed685f"}'::jsonb,
    body := jsonb_build_object('source', 'cron-cst', 'time', now())
  );
  $cron$
);