-- Run against a populated TMS database. All behavioral test writes roll back.
BEGIN;
DO $$
DECLARE
  cm uuid;
  administrator uuid;
  truck uuid;
  check_id uuid;
  week_date date := public.pretrip_due_date();
  work_date date := (now() at time zone 'America/Chicago')::date;
  admin_counts jsonb;
  cm_counts jsonb;
  day jsonb;
BEGIN
  SELECT user_id INTO STRICT cm FROM public.user_roles r
    WHERE role = 'chicago_management'
    AND NOT EXISTS (SELECT 1 FROM public.user_roles other WHERE other.user_id=r.user_id AND other.role<>'chicago_management') LIMIT 1;
  SELECT user_id INTO STRICT administrator FROM public.user_roles WHERE role='admin' LIMIT 1;
  SELECT id INTO STRICT truck FROM public.trucks WHERE is_active LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', administrator::text, true);
  SET LOCAL ROLE authenticated;
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.pretrip_form_submissions),
    (SELECT count(*) FROM public.pretrip_photos),
    (SELECT count(*) FROM public.pretrip_checks),
    (SELECT count(*) FROM public.pretrip_problems),
    (SELECT count(*) FROM storage.objects WHERE bucket_id='pretrip-photos'),
    (SELECT count(*) FROM public.dispatcher_daily_driver_counts)
  ) INTO admin_counts;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', cm::text, true);
  SET LOCAL ROLE authenticated;
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.pretrip_form_submissions),
    (SELECT count(*) FROM public.pretrip_photos),
    (SELECT count(*) FROM public.pretrip_checks),
    (SELECT count(*) FROM public.pretrip_problems),
    (SELECT count(*) FROM storage.objects WHERE bucket_id='pretrip-photos'),
    (SELECT count(*) FROM public.dispatcher_daily_driver_counts)
  ) INTO cm_counts;
  ASSERT cm_counts = admin_counts, 'Chicago Management must see the same PTI records as admin';
  PERFORM public.set_pretrip_week_checked(truck,week_date,true);
  ASSERT EXISTS (SELECT 1 FROM public.pretrip_checks WHERE truck_id=truck AND inspection_date=week_date AND checked_by=cm), 'PTI check must save';
  PERFORM public.set_pretrip_week_checked(truck,week_date,false);
  INSERT INTO public.pretrip_problems(truck_id,inspection_date,problems,updated_by)
    VALUES(truck,week_date,'Permission test',cm)
    ON CONFLICT(truck_id,inspection_date) DO UPDATE SET problems=excluded.problems,updated_by=excluded.updated_by;
  day := public.eld_get_day(work_date);
  ASSERT (day->>'can_manage')::boolean, 'Chicago Management needs ELD admin capabilities without a tag';
  check_id := (day->'checks'->0->>'id')::uuid;
  IF check_id IS NOT NULL THEN
    PERFORM public.eld_save_check(check_id,'comment','"Permission test"'::jsonb);
  END IF;
  RESET ROLE;
END $$;
ROLLBACK;
