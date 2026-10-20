-- Uses the existing CRON_SECRET in Vault; the Edge Function validates it itself.
SELECT cron.schedule('send-low-drive-reminders','4-59/5 * * * *', $job$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/send-low-drive-reminders',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
