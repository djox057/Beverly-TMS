
-- Drop existing SELECT policies for driver-files and truck-files buckets
DROP POLICY IF EXISTS "Dispatch, managers and admins can view driver files" ON storage.objects;
DROP POLICY IF EXISTS "Afterhours can view driver files" ON storage.objects;
DROP POLICY IF EXISTS "Dispatch, managers and admins can view truck files" ON storage.objects;
DROP POLICY IF EXISTS "Afterhours can view truck files" ON storage.objects;

-- Allow all authenticated users to view driver files
CREATE POLICY "Authenticated users can view driver files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'driver-files' AND auth.role() = 'authenticated'
);

-- Allow all authenticated users to view truck files
CREATE POLICY "Authenticated users can view truck files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'truck-files' AND auth.role() = 'authenticated'
);
