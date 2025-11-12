-- TRUCKS TABLE
CREATE POLICY "Maintenance can create trucks" 
ON public.trucks 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can delete trucks" 
ON public.trucks 
FOR DELETE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update trucks" 
ON public.trucks 
FOR UPDATE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can view trucks" 
ON public.trucks 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- TRAILERS TABLE
CREATE POLICY "Maintenance can create trailers" 
ON public.trailers 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can delete trailers" 
ON public.trailers 
FOR DELETE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update trailers" 
ON public.trailers 
FOR UPDATE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can view trailers" 
ON public.trailers 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- TRUCK_NOTES TABLE
CREATE POLICY "Maintenance can create truck_notes" 
ON public.truck_notes 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can delete truck_notes" 
ON public.truck_notes 
FOR DELETE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update truck_notes" 
ON public.truck_notes 
FOR UPDATE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can view truck_notes" 
ON public.truck_notes 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- TRUCK_NOTE_HISTORY TABLE
CREATE POLICY "Maintenance can view truck_note_history" 
ON public.truck_note_history 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- TRAILER_FILES TABLE
CREATE POLICY "Maintenance can create trailer_files" 
ON public.trailer_files 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can delete trailer_files" 
ON public.trailer_files 
FOR DELETE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update trailer_files" 
ON public.trailer_files 
FOR UPDATE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can view trailer_files" 
ON public.trailer_files 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- TRUCK_FILES TABLE
CREATE POLICY "Maintenance can create truck_files" 
ON public.truck_files 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can delete truck_files" 
ON public.truck_files 
FOR DELETE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update truck_files" 
ON public.truck_files 
FOR UPDATE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can view truck_files" 
ON public.truck_files 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- TRUCK_LOCATIONS TABLE
CREATE POLICY "Maintenance can view truck_locations" 
ON public.truck_locations 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));