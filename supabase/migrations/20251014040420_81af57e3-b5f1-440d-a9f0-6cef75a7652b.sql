-- Fix supervisor role unable to upload order files
-- The storage policy for order-files bucket was missing supervisor role

DROP POLICY IF EXISTS "Dispatch, managers and admins can upload order files" ON storage.objects;

CREATE POLICY "Dispatch, managers, admins, accounting and supervisors can upload order files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'order-files' 
  AND (
    has_role(auth.uid(), 'dispatch'::app_role) 
    OR has_role(auth.uid(), 'manager'::app_role) 
    OR has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'accounting'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
  )
);