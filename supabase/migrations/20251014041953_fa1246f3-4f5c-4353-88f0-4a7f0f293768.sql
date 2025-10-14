-- Add UPDATE policy for trailers for safety role
CREATE POLICY "Safety can update trailers"
ON public.trailers
FOR UPDATE
USING (has_role(auth.uid(), 'safety'::app_role));

-- Add storage policies for safety role to upload files to trailer-files bucket
CREATE POLICY "Safety can upload trailer files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trailer-files' AND
  has_role(auth.uid(), 'safety'::app_role)
);

CREATE POLICY "Safety can update trailer files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'trailer-files' AND
  has_role(auth.uid(), 'safety'::app_role)
);

-- Add storage policies for safety role to upload files to truck-files bucket
CREATE POLICY "Safety can upload truck files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'truck-files' AND
  has_role(auth.uid(), 'safety'::app_role)
);

CREATE POLICY "Safety can update truck files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'truck-files' AND
  has_role(auth.uid(), 'safety'::app_role)
);

-- Add storage policies for safety role to upload files to driver-files bucket
CREATE POLICY "Safety can upload driver files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'driver-files' AND
  has_role(auth.uid(), 'safety'::app_role)
);

CREATE POLICY "Safety can update driver files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'driver-files' AND
  has_role(auth.uid(), 'safety'::app_role)
);