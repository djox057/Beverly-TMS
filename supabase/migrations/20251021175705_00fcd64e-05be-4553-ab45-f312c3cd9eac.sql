-- Add storage policies for safety role to view files

-- Safety can view driver files in storage
CREATE POLICY "Safety can view driver files in storage"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'driver-files' AND
  has_role(auth.uid(), 'safety'::app_role)
);

-- Safety can view truck files in storage
CREATE POLICY "Safety can view truck files in storage"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'truck-files' AND
  has_role(auth.uid(), 'safety'::app_role)
);

-- Safety can view trailer files in storage
CREATE POLICY "Safety can view trailer files in storage"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'trailer-files' AND
  has_role(auth.uid(), 'safety'::app_role)
);

-- Safety can view order files in storage
CREATE POLICY "Safety can view order files in storage"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'order-files' AND
  has_role(auth.uid(), 'safety'::app_role)
);