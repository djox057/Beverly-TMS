DROP POLICY IF EXISTS "pretrip form read" ON public.pretrip_form_submissions;
CREATE POLICY "pretrip form read"
  ON public.pretrip_form_submissions
  FOR SELECT TO authenticated
  USING (has_any_role(ARRAY[
    'admin'::app_role,
    'maintenance'::app_role,
    'manager'::app_role,
    'supervisor'::app_role,
    'dispatch'::app_role,
    'safety'::app_role
  ]));

DROP POLICY IF EXISTS "pretrip photos read" ON public.pretrip_photos;
CREATE POLICY "pretrip photos read"
  ON public.pretrip_photos
  FOR SELECT TO authenticated
  USING (has_any_role(ARRAY[
    'admin'::app_role,
    'maintenance'::app_role,
    'manager'::app_role,
    'supervisor'::app_role,
    'dispatch'::app_role,
    'safety'::app_role
  ]));

DROP POLICY IF EXISTS "pretrip storage read" ON storage.objects;
CREATE POLICY "pretrip storage read"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pretrip-photos'
    AND has_any_role(ARRAY[
      'admin'::app_role,
      'maintenance'::app_role,
      'manager'::app_role,
      'supervisor'::app_role,
      'dispatch'::app_role,
      'safety'::app_role
    ])
  );
