-- File/folder table SELECT policies already allow maintenance. Signed file URLs
-- also require Storage SELECT access; cover all three private file buckets.
CREATE POLICY "Maintenance can view truck trailer and driver files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('truck-files', 'trailer-files', 'driver-files')
  AND (SELECT public.has_role(auth.uid(), 'maintenance'::public.app_role))
);
