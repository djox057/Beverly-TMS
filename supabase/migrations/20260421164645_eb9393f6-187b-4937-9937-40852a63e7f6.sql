DROP POLICY IF EXISTS "Admin/safety/maintenance can upload temp plate files" ON storage.objects;
DROP POLICY IF EXISTS "Admin/safety/maintenance can delete temp plate files" ON storage.objects;

CREATE POLICY "Allowed roles can upload temp plate files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'temporary-plate-files'
    AND public.has_any_role(ARRAY['admin'::app_role, 'safety'::app_role, 'maintenance'::app_role, 'dispatch'::app_role, 'supervisor'::app_role])
  );

CREATE POLICY "Allowed roles can delete temp plate files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'temporary-plate-files'
    AND public.has_any_role(ARRAY['admin'::app_role, 'safety'::app_role, 'maintenance'::app_role, 'dispatch'::app_role, 'supervisor'::app_role])
  );