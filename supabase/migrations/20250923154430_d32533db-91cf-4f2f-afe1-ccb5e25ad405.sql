-- Update the bucket to be public since there's no authentication
UPDATE storage.buckets SET public = true WHERE id = 'order-files';

-- Drop the existing policies that require authentication
DROP POLICY IF EXISTS "Allow authenticated uploads to order-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to view order files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete order files" ON storage.objects;

-- Create new policies that allow all operations without authentication
CREATE POLICY "Allow all uploads to order-files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'order-files');

CREATE POLICY "Allow all users to view order files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'order-files');

CREATE POLICY "Allow all users to delete order files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'order-files');