-- Create storage bucket for company-wide archived order data
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'archived-orders',
  'archived-orders',
  false,
  52428800, -- 50MB limit per file
  ARRAY['text/csv', 'application/json']
);

-- Allow authenticated users to read the archived orders
CREATE POLICY "Authenticated users can read archived orders"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'archived-orders');

-- Only admins and managers can upload/update archived orders
CREATE POLICY "Admins and managers can upload archived orders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'archived-orders' 
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'manager')
  )
);

CREATE POLICY "Admins and managers can update archived orders"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'archived-orders'
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'manager')
  )
);

CREATE POLICY "Admins and managers can delete archived orders"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'archived-orders'
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'manager')
  )
);