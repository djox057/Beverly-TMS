-- Add INSERT policies for safety role on file metadata tables

-- Safety can create truck_files records
CREATE POLICY "Safety can create truck_files"
ON public.truck_files
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'safety'::app_role));

-- Safety can create driver_files records
CREATE POLICY "Safety can create driver_files"
ON public.driver_files
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'safety'::app_role));

-- Safety can create trailer_files records
CREATE POLICY "Safety can create trailer_files"
ON public.trailer_files
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'safety'::app_role));