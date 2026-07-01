
CREATE POLICY "Authenticated can read truck odometer files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'truck-odometer-files');

CREATE POLICY "Authenticated can upload truck odometer files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'truck-odometer-files');

CREATE POLICY "Authenticated can update truck odometer files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'truck-odometer-files');

CREATE POLICY "Authenticated can delete truck odometer files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'truck-odometer-files');
