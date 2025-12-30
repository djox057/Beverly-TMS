-- Create storage bucket for EFS receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('efs-receipts', 'efs-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload EFS receipts
CREATE POLICY "Authenticated users can upload EFS receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'efs-receipts');

-- Allow authenticated users to view EFS receipts
CREATE POLICY "Authenticated users can view EFS receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'efs-receipts');

-- Allow authenticated users to delete EFS receipts
CREATE POLICY "Authenticated users can delete EFS receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'efs-receipts');

-- Add receipt_path column to efs_other_requests table
ALTER TABLE public.efs_other_requests 
ADD COLUMN IF NOT EXISTS receipt_path TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS quantity NUMERIC;