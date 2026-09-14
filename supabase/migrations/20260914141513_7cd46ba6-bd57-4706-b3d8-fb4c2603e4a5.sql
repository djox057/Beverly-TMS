DROP POLICY IF EXISTS "Authenticated users can delete EFS receipts" ON storage.objects;

CREATE POLICY "Admins and accounting can delete EFS receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'efs-receipts'
  AND (SELECT public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role]))
);