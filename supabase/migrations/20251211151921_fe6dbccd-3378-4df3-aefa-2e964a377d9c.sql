-- Add safety role delete permission for trailers
CREATE POLICY "Safety can delete trailers"
ON public.trailers
FOR DELETE
TO authenticated
USING (has_role((SELECT auth.uid()), 'safety'::app_role));