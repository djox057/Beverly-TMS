-- Allow accounting role to view order files
CREATE POLICY "Accounting can view order files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'accounting'::app_role)
);

-- Allow accounting role to download order files (sign URLs)
CREATE POLICY "Accounting can sign order file URLs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'order-files'
  AND has_role(auth.uid(), 'accounting'::app_role)
);