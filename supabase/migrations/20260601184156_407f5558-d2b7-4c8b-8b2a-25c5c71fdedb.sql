DELETE FROM public.afterhours_schedule
WHERE scheduled_date IN ('2026-05-23','2026-05-24')
  AND user_id IN (
    SELECT user_id FROM public.profiles WHERE office = 'Čačak'
  );