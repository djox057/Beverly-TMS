DELETE FROM public.afterhours_shift_assignments a
WHERE a.scheduled_date = DATE '2026-09-17' AND a.shift = 'night'
  AND EXISTS (
    SELECT 1 FROM public.afterhours_shift_assignments b
    WHERE b.scheduled_date = DATE '2026-09-16' AND b.shift = 'night'
      AND b.afterhours_user_id = a.afterhours_user_id AND b.driver_id = a.driver_id
  );

UPDATE public.afterhours_shift_assignments a
SET scheduled_date = DATE '2026-09-16'
WHERE a.scheduled_date = DATE '2026-09-17' AND a.shift = 'night';

DELETE FROM public.afterhours_shift_schedule s
WHERE s.scheduled_date = DATE '2026-09-17' AND s.shift = 'night'
  AND EXISTS (
    SELECT 1 FROM public.afterhours_shift_schedule t
    WHERE t.scheduled_date = DATE '2026-09-16' AND t.shift = 'night' AND t.user_id = s.user_id
  );

UPDATE public.afterhours_shift_schedule s
SET scheduled_date = DATE '2026-09-16'
WHERE s.scheduled_date = DATE '2026-09-17' AND s.shift = 'night';