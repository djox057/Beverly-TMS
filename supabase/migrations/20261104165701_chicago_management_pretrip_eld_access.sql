-- Extend only PTI policies; leave permissions on other pages unchanged.
ALTER POLICY "pretrip photos insert" ON public.pretrip_photos
  WITH CHECK ((has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'dispatch'::app_role]) AND (uploaded_by = auth.uid())));

ALTER POLICY "pretrip photos delete" ON public.pretrip_photos
  USING ((has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role]) OR (uploaded_by = auth.uid())));

ALTER POLICY "pretrip storage delete" ON storage.objects
  USING (((bucket_id = 'pretrip-photos'::text) AND has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'dispatch'::app_role])));

ALTER POLICY "pretrip problems read" ON public.pretrip_problems
  USING (has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'dispatch'::app_role]));

ALTER POLICY "pretrip problems insert" ON public.pretrip_problems
  WITH CHECK (has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'dispatch'::app_role]));

ALTER POLICY "pretrip problems update" ON public.pretrip_problems
  USING (has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'dispatch'::app_role]))
  WITH CHECK (has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'dispatch'::app_role]));

ALTER POLICY "pretrip checks read" ON public.pretrip_checks
  USING (has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'dispatch'::app_role]));

ALTER POLICY "pretrip sync read" ON public.pretrip_form_sync
  USING (has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'dispatch'::app_role]));

ALTER POLICY "pretrip sync admin control" ON public.pretrip_form_sync
  USING (has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'manager'::app_role]))
  WITH CHECK (has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'manager'::app_role]));

ALTER POLICY "pretrip form read" ON public.pretrip_form_submissions
  USING (has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'dispatch'::app_role, 'safety'::app_role]));

ALTER POLICY "pretrip photos read" ON public.pretrip_photos
  USING (has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'dispatch'::app_role, 'safety'::app_role]));

ALTER POLICY "pretrip storage read" ON storage.objects
  USING (((bucket_id = 'pretrip-photos'::text) AND has_any_role(ARRAY['admin'::app_role, 'chicago_management'::app_role, 'maintenance'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'dispatch'::app_role, 'safety'::app_role])));


-- ELD RPCs and RLS use this helper for all admin management capabilities.
create or replace function eld_private.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.has_role(auth.uid(),'admin') or
    public.has_role(auth.uid(),'chicago_management') or
    public.has_role(auth.uid(),'manager') or
    (public.has_role(auth.uid(),'maintenance') and exists (
      select 1 from public.profiles where user_id=auth.uid() and is_eld_manager
    ))
  );
$$;


CREATE OR REPLACE FUNCTION public.set_pretrip_week_checked(
 _truck_id uuid, _inspection_date date, _checked boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE week_start date;
BEGIN
 IF auth.uid() IS NULL OR NOT (
   public.has_role(auth.uid(), 'admin') OR
   public.has_role(auth.uid(), 'chicago_management') OR
   public.has_role(auth.uid(), 'maintenance') OR
   public.has_role(auth.uid(), 'manager')
 ) THEN RAISE EXCEPTION 'not allowed'; END IF;
 IF _truck_id IS NULL OR _inspection_date IS NULL OR _checked IS NULL THEN
   RAISE EXCEPTION 'truck, inspection date and checked state are required';
 END IF;
 week_start := date_trunc('week', _inspection_date::timestamp)::date;
 PERFORM pg_advisory_xact_lock(hashtextextended(_truck_id::text || week_start::text, 0));
 IF _checked THEN
   INSERT INTO public.pretrip_checks (truck_id, inspection_date, checked_by, checked_at)
   VALUES (_truck_id, week_start, auth.uid(), now())
   ON CONFLICT (truck_id, inspection_date) DO UPDATE
     SET checked_by = EXCLUDED.checked_by, checked_at = EXCLUDED.checked_at;
 ELSE
   DELETE FROM public.pretrip_checks WHERE truck_id = _truck_id
     AND inspection_date >= week_start AND inspection_date < week_start + 7;
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_pretrip_week_checked(uuid,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_pretrip_week_checked(uuid,date,boolean) TO authenticated;
