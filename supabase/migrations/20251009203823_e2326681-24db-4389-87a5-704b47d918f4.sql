-- Add storage policies for safety role to upload files

-- Safety can upload truck files
CREATE POLICY "Safety can upload truck files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'truck-files' 
  AND has_role(auth.uid(), 'safety'::app_role)
);

-- Safety can upload driver files
CREATE POLICY "Safety can upload driver files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'driver-files' 
  AND has_role(auth.uid(), 'safety'::app_role)
);

-- Safety can upload trailer files
CREATE POLICY "Safety can upload trailer files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trailer-files' 
  AND has_role(auth.uid(), 'safety'::app_role)
);

-- Safety can delete truck files
CREATE POLICY "Safety can delete truck files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'truck-files' 
  AND has_role(auth.uid(), 'safety'::app_role)
);

-- Safety can delete driver files
CREATE POLICY "Safety can delete driver files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'driver-files' 
  AND has_role(auth.uid(), 'safety'::app_role)
);

-- Safety can delete trailer files
CREATE POLICY "Safety can delete trailer files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'trailer-files' 
  AND has_role(auth.uid(), 'safety'::app_role)
);