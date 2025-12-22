-- Drop the existing policy that doesn't include dispatch
DROP POLICY IF EXISTS "Managers and admins can view driver files" ON storage.objects;

-- Create new policy that includes dispatch role
CREATE POLICY "Dispatch, managers and admins can view driver files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'driver-files' 
  AND (
    has_role(auth.uid(), 'dispatch'::app_role) 
    OR has_role(auth.uid(), 'manager'::app_role) 
    OR has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'accounting'::app_role)
  )
);