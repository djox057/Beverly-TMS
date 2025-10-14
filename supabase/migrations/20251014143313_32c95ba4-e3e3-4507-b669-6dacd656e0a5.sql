-- Allow dispatch role to delete order files
CREATE POLICY "Dispatch can delete order_files"
ON public.order_files
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'dispatch'::app_role));

-- Allow dispatch role to update order files
CREATE POLICY "Dispatch can update order_files"
ON public.order_files
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'dispatch'::app_role))
WITH CHECK (has_role(auth.uid(), 'dispatch'::app_role));

-- Allow dispatch to delete files from storage bucket
CREATE POLICY "Dispatch can delete order files from storage"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'order-files' 
  AND has_role(auth.uid(), 'dispatch'::app_role)
);