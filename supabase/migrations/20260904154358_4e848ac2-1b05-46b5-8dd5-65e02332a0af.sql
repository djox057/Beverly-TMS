DROP POLICY IF EXISTS "Roles can create driver_files" ON public.driver_files;
CREATE POLICY "Roles can create driver_files" ON public.driver_files
FOR INSERT WITH CHECK (has_any_role(ARRAY['dispatch','manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

CREATE POLICY "Dispatch can upload driver files" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'driver-files' AND has_role(auth.uid(), 'dispatch'::app_role));