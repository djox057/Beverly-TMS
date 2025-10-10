-- Restore all missing RLS policies (part 1)

-- ============================================
-- BROKERS TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete brokers" 
ON public.brokers FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can create brokers" 
ON public.brokers FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view brokers" 
ON public.brokers FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can update brokers" 
ON public.brokers FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can view brokers" 
ON public.brokers FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create brokers" 
ON public.brokers FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update brokers" 
ON public.brokers FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view brokers" 
ON public.brokers FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- COMPANIES TABLE POLICIES (skip "Authenticated users can create companies" - already exists)
-- ============================================
CREATE POLICY "Admins and accounting can delete companies" 
ON public.companies FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view companies" 
ON public.companies FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Drivers can view their company" 
ON public.companies FOR SELECT 
USING (id IN (SELECT trucks.company_id FROM trucks WHERE trucks.driver1_id IN (SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role))));

CREATE POLICY "Managers, admins and accounting can update companies" 
ON public.companies FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can view companies" 
ON public.companies FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can update companies" 
ON public.companies FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view companies" 
ON public.companies FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- DRIVER_FILES TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete driver_files" 
ON public.driver_files FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view driver_files" 
ON public.driver_files FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can create driver_files" 
ON public.driver_files FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can update driver_files" 
ON public.driver_files FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can create driver_files" 
ON public.driver_files FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can delete driver_files" 
ON public.driver_files FOR DELETE 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Safety can view driver files" 
ON public.driver_files FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create driver_files" 
ON public.driver_files FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update driver_files" 
ON public.driver_files FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view driver_files" 
ON public.driver_files FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- DRIVER_PERFORMANCE TABLE POLICIES
-- ============================================
CREATE POLICY "Admins and accounting can delete driver performance" 
ON public.driver_performance FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Dispatch, managers, admins and accounting can view driver perfo" 
ON public.driver_performance FOR SELECT 
USING (has_role(auth.uid(), 'dispatch'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can create driver performance" 
ON public.driver_performance FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Managers, admins and accounting can update driver performance" 
ON public.driver_performance FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can view driver performance" 
ON public.driver_performance FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can create driver performance" 
ON public.driver_performance FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update driver performance" 
ON public.driver_performance FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can view driver performance" 
ON public.driver_performance FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- ============================================
-- DRIVER_PII_AUDIT_LOG TABLE POLICIES (skip "System can insert PII audit logs" - already exists)
-- ============================================
CREATE POLICY "Admins and accounting can view PII audit logs" 
ON public.driver_pii_audit_log FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Safety can view PII audit logs" 
ON public.driver_pii_audit_log FOR SELECT 
USING (has_role(auth.uid(), 'safety'::app_role));