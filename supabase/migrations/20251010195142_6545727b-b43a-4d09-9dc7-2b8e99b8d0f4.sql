-- Restore all missing RLS policies (part 2)

-- ============================================
-- DRIVER_SENSITIVE_PII TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete driver sensitive PII" 
ON public.driver_sensitive_pii FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can create driver sensitive PII" 
ON public.driver_sensitive_pii FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can update driver sensitive PII" 
ON public.driver_sensitive_pii FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can view driver sensitive PII" 
ON public.driver_sensitive_pii FOR SELECT 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can view driver sensitive PII" 
ON public.driver_sensitive_pii FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create driver sensitive PII" 
ON public.driver_sensitive_pii FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update driver sensitive PII" 
ON public.driver_sensitive_pii FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view driver sensitive PII" 
ON public.driver_sensitive_pii FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- DRIVERS TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete drivers" 
ON public.drivers FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view drivers" 
ON public.drivers FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Drivers can view their own profile" 
ON public.drivers FOR SELECT 
USING (auth.uid() IN (SELECT profiles.user_id FROM profiles WHERE profiles.email = drivers.email AND has_role(profiles.user_id, 'driver'::app_role)));

CREATE POLICY "Managers, admins and accounting can create drivers" 
ON public.drivers FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can update drivers" 
ON public.drivers FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can create drivers" 
ON public.drivers FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can delete drivers" 
ON public.drivers FOR DELETE 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can update drivers" 
ON public.drivers FOR UPDATE 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can view drivers" 
ON public.drivers FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create drivers" 
ON public.drivers FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete drivers" 
ON public.drivers FOR DELETE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update drivers" 
ON public.drivers FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view drivers" 
ON public.drivers FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- LOST_DAY_NOTES TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete lost day notes" 
ON public.lost_day_notes FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can create lost day n" 
ON public.lost_day_notes FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can update lost day n" 
ON public.lost_day_notes FOR UPDATE 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view lost day not" 
ON public.lost_day_notes FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can view lost day notes" 
ON public.lost_day_notes FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create lost day notes" 
ON public.lost_day_notes FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update lost day notes" 
ON public.lost_day_notes FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view lost day notes" 
ON public.lost_day_notes FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- ORDER_FILES TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete order_files" 
ON public.order_files FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can create order_file" 
ON public.order_files FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view order_files" 
ON public.order_files FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Drivers can view files for their orders" 
ON public.order_files FOR SELECT 
USING (order_id IN (SELECT o.id FROM orders o WHERE o.driver1_id IN (SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)) OR o.driver2_id IN (SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role))));

CREATE POLICY "Managers, admins and accounting can update order_files" 
ON public.order_files FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can view order files" 
ON public.order_files FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create order_files" 
ON public.order_files FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update order_files" 
ON public.order_files FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view order_files" 
ON public.order_files FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));