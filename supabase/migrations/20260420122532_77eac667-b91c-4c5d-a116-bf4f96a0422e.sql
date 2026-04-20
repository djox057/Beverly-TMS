SELECT cron.unschedule('afterhours-start');
SELECT cron.unschedule('afterhours-end');
SELECT cron.unschedule('afterhours-end-dst');
SELECT cron.unschedule('send-afterhours-sms-daily');

DROP TABLE IF EXISTS public.afterhours_sms_send_log CASCADE;
DROP TABLE IF EXISTS public.afterhours_cron_log CASCADE;