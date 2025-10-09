-- Add DELETE policies for safety role on file metadata tables

-- Safety can delete truck_files records
CREATE POLICY "Safety can delete truck_files"
ON public.truck_files
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'safety'::app_role));

-- Safety can delete driver_files records
CREATE POLICY "Safety can delete driver_files"
ON public.driver_files
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'safety'::app_role));

-- Safety can delete trailer_files records
CREATE POLICY "Safety can delete trailer_files"
ON public.trailer_files
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'safety'::app_role));