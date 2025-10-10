-- Restore all missing RLS policies (part 4 - trucks, trailers, files, storage)

-- ============================================
-- TRAILER_FILES TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete trailer_files" 
ON public.trailer_files FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view trailer_file" 
ON public.trailer_files FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Drivers can view their trailer files" 
ON public.trailer_files FOR SELECT 
USING (trailer_id IN (SELECT trucks.trailer_id FROM trucks WHERE trucks.driver1_id IN (SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role))));

CREATE POLICY "Managers, admins and accounting can create trailer_files" 
ON public.trailer_files FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can update trailer_files" 
ON public.trailer_files FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can create trailer_files" 
ON public.trailer_files FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can delete trailer_files" 
ON public.trailer_files FOR DELETE 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can view trailer files" 
ON public.trailer_files FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create trailer_files" 
ON public.trailer_files FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update trailer_files" 
ON public.trailer_files FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view trailer_files" 
ON public.trailer_files FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- TRAILERS TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete trailers" 
ON public.trailers FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view trailers" 
ON public.trailers FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Drivers can view trailers on their trucks" 
ON public.trailers FOR SELECT 
USING (id IN (SELECT trucks.trailer_id FROM trucks WHERE trucks.driver1_id IN (SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role))));

CREATE POLICY "Managers, admins and accounting can create trailers" 
ON public.trailers FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can update trailers" 
ON public.trailers FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can view trailers" 
ON public.trailers FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create trailers" 
ON public.trailers FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update trailers" 
ON public.trailers FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view trailers" 
ON public.trailers FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- TRUCK_FILES TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete truck_files" 
ON public.truck_files FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view truck_files" 
ON public.truck_files FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Drivers can view their truck files" 
ON public.truck_files FOR SELECT 
USING (truck_id IN (SELECT trucks.id FROM trucks WHERE trucks.driver1_id IN (SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role))));

CREATE POLICY "Managers, admins and accounting can create truck_files" 
ON public.truck_files FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can update truck_files" 
ON public.truck_files FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can create truck_files" 
ON public.truck_files FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can delete truck_files" 
ON public.truck_files FOR DELETE 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can view truck files" 
ON public.truck_files FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create truck_files" 
ON public.truck_files FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update truck_files" 
ON public.truck_files FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view truck_files" 
ON public.truck_files FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- TRUCKS TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete trucks" 
ON public.trucks FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view trucks" 
ON public.trucks FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Drivers can view their assigned trucks" 
ON public.trucks FOR SELECT 
USING (driver1_id IN (SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)));

CREATE POLICY "Managers, admins and accounting can create trucks" 
ON public.trucks FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can update trucks" 
ON public.trucks FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can create trucks" 
ON public.trucks FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can delete trucks" 
ON public.trucks FOR DELETE 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can update trucks" 
ON public.trucks FOR UPDATE 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can view trucks" 
ON public.trucks FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create trucks" 
ON public.trucks FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update trucks" 
ON public.trucks FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view trucks" 
ON public.trucks FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- TRUCK_LOCATIONS TABLE POLICIES (add viewing policies)
-- ============================================
CREATE POLICY "Dispatch, managers, admins and accounting can view truck locati" 
ON public.truck_locations FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can view truck locations" 
ON public.truck_locations FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can view truck locations" 
ON public.truck_locations FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- TRUCK_NOTES TABLE POLICIES
-- ============================================
CREATE POLICY "Dispatch, managers, admins and accounting can create truck note" 
ON public.truck_notes FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view truck notes" 
ON public.truck_notes FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can delete truck notes" 
ON public.truck_notes FOR DELETE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can update truck notes" 
ON public.truck_notes FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can view truck notes" 
ON public.truck_notes FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create truck notes" 
ON public.truck_notes FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update truck notes" 
ON public.truck_notes FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view truck notes" 
ON public.truck_notes FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- USER_ROLES TABLE POLICIES (add manager/supervisor viewing)
-- ============================================
CREATE POLICY "Admins and accounting can view all user roles" 
ON public.user_roles FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers can view user roles" 
ON public.user_roles FOR SELECT 
USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Supervisors can view user roles" 
ON public.user_roles FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- STORAGE POLICIES
-- ============================================
CREATE POLICY "Dispatch, managers and admins can view order files" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'order-files' AND (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));

CREATE POLICY "Dispatch, managers and admins can upload order files" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'order-files' AND (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));

CREATE POLICY "Admins can delete order files" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'order-files' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));

CREATE POLICY "Accounting can view order files" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'order-files' AND has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Accounting can sign order file URLs" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'order-files' AND has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers and admins can view driver files" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'driver-files' AND (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));

CREATE POLICY "Managers and admins can upload driver files" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'driver-files' AND (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));

CREATE POLICY "Admins can delete driver files" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'driver-files' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));

CREATE POLICY "Dispatch, managers and admins can view truck files" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'truck-files' AND (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));

CREATE POLICY "Managers and admins can upload truck files" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'truck-files' AND (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));

CREATE POLICY "Admins can delete truck files" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'truck-files' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));

CREATE POLICY "Dispatch, managers and admins can view trailer files" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'trailer-files' AND (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));

CREATE POLICY "Managers and admins can upload trailer files" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'trailer-files' AND (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));

CREATE POLICY "Admins can delete trailer files" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'trailer-files' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role)));