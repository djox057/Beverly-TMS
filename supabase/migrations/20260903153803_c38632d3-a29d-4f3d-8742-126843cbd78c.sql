DROP POLICY IF EXISTS "Roles can create truck_files" ON public.truck_files;
CREATE POLICY "Roles can create truck_files" ON public.truck_files FOR INSERT
WITH CHECK (has_any_role(ARRAY['dispatch'::app_role,'manager'::app_role,'admin'::app_role,'accounting'::app_role,'supervisor'::app_role,'safety'::app_role,'maintenance'::app_role]));

DROP POLICY IF EXISTS "Roles can create trailer_files" ON public.trailer_files;
CREATE POLICY "Roles can create trailer_files" ON public.trailer_files FOR INSERT
WITH CHECK (has_any_role(ARRAY['dispatch'::app_role,'manager'::app_role,'admin'::app_role,'accounting'::app_role,'supervisor'::app_role,'safety'::app_role,'maintenance'::app_role]));

DROP POLICY IF EXISTS "Dispatch can upload truck files" ON storage.objects;
CREATE POLICY "Dispatch can upload truck files" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'truck-files' AND has_role(auth.uid(), 'dispatch'::app_role));

DROP POLICY IF EXISTS "Dispatch can upload trailer files" ON storage.objects;
CREATE POLICY "Dispatch can upload trailer files" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'trailer-files' AND has_role(auth.uid(), 'dispatch'::app_role));