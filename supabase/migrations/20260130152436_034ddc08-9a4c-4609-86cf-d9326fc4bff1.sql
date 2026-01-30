-- Add storage policy for supervisors to view order files
CREATE POLICY "Supervisors can view order files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'supervisor'::app_role)
);