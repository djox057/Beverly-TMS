
SELECT cron.schedule(
  'compute-heatmap-weekly',
  '0 9 * * 0',
  $$
  SELECT net.http_post(
    url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/compute-heatmap',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer 30dc904f9b53fddb10acf6999373d02b7babab76fd9b0a939bf421a417ed685f"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
