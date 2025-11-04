-- Add storage policies for accounting role to upload order files

-- Allow accounting to insert objects in order-files bucket
DROP POLICY IF EXISTS "Accounting can upload order files" ON storage.objects;
CREATE POLICY "Accounting can upload order files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'accounting'::app_role)
);

-- Allow accounting to update objects in order-files bucket
DROP POLICY IF EXISTS "Accounting can update order files" ON storage.objects;
CREATE POLICY "Accounting can update order files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'accounting'::app_role)
);

-- Allow accounting to select/view objects in order-files bucket
DROP POLICY IF EXISTS "Accounting can view order files" ON storage.objects;
CREATE POLICY "Accounting can view order files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'accounting'::app_role)
);

-- Allow accounting to delete objects in order-files bucket
DROP POLICY IF EXISTS "Accounting can delete order files" ON storage.objects;
CREATE POLICY "Accounting can delete order files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'accounting'::app_role)
);