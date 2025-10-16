-- Allow afterhours to upload files to order-files bucket
CREATE POLICY "Afterhours can upload order files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'afterhours'::app_role)
);

-- Allow afterhours to view order files
CREATE POLICY "Afterhours can view order files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'afterhours'::app_role)
);

-- Allow afterhours to update order files
CREATE POLICY "Afterhours can update order files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'afterhours'::app_role)
)
WITH CHECK (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'afterhours'::app_role)
);

-- Allow afterhours to delete order files
CREATE POLICY "Afterhours can delete order files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'afterhours'::app_role)
);