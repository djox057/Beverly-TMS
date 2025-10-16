-- Continue optimizing RLS policies - Part 2: More tables

-- ============================================================
-- DRIVER PERFORMANCE TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete driver performance" ON public.driver_performance;
CREATE POLICY "Admins and accounting can delete driver performance" 
ON public.driver_performance FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view driver perfo" ON public.driver_performance;
CREATE POLICY "Dispatch, managers, admins and accounting can view driver perfo" 
ON public.driver_performance FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can create driver performance" ON public.driver_performance;
CREATE POLICY "Managers, admins and accounting can create driver performance" 
ON public.driver_performance FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update driver performance" ON public.driver_performance;
CREATE POLICY "Managers, admins and accounting can update driver performance" 
ON public.driver_performance FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can view driver performance" ON public.driver_performance;
CREATE POLICY "Safety can view driver performance" 
ON public.driver_performance FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create driver performance" ON public.driver_performance;
CREATE POLICY "Supervisors can create driver performance" 
ON public.driver_performance FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update driver performance" ON public.driver_performance;
CREATE POLICY "Supervisors can update driver performance" 
ON public.driver_performance FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view driver performance" ON public.driver_performance;
CREATE POLICY "Supervisors can view driver performance" 
ON public.driver_performance FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

-- ============================================================
-- DRIVER PII AUDIT LOG TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can view PII audit logs" ON public.driver_pii_audit_log;
CREATE POLICY "Admins and accounting can view PII audit logs" 
ON public.driver_pii_audit_log FOR SELECT
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Safety can view PII audit logs" ON public.driver_pii_audit_log;
CREATE POLICY "Safety can view PII audit logs" 
ON public.driver_pii_audit_log FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

-- ============================================================
-- DRIVER SENSITIVE PII TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Admins and accounting can delete driver sensitive PII" 
ON public.driver_sensitive_pii FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Managers, admins and accounting can create driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Managers, admins and accounting can create driver sensitive PII" 
ON public.driver_sensitive_pii FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Managers, admins and accounting can update driver sensitive PII" 
ON public.driver_sensitive_pii FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can view driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Managers, admins and accounting can view driver sensitive PII" 
ON public.driver_sensitive_pii FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can view driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Safety can view driver sensitive PII" 
ON public.driver_sensitive_pii FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Supervisors can create driver sensitive PII" 
ON public.driver_sensitive_pii FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Supervisors can update driver sensitive PII" 
ON public.driver_sensitive_pii FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Supervisors can view driver sensitive PII" 
ON public.driver_sensitive_pii FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

-- ============================================================
-- DRIVERS TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete drivers" ON public.drivers;
CREATE POLICY "Admins and accounting can delete drivers" 
ON public.drivers FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view drivers" ON public.drivers;
CREATE POLICY "Dispatch, managers, admins and accounting can view drivers" 
ON public.drivers FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Drivers can view their own profile" ON public.drivers;
CREATE POLICY "Drivers can view their own profile" 
ON public.drivers FOR SELECT
USING ((SELECT auth.uid()) IN (
  SELECT profiles.user_id FROM profiles
  WHERE profiles.email = drivers.email AND has_role(profiles.user_id, 'driver'::app_role)
));

DROP POLICY IF EXISTS "Managers, admins and accounting can create drivers" ON public.drivers;
CREATE POLICY "Managers, admins and accounting can create drivers" 
ON public.drivers FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update drivers" ON public.drivers;
CREATE POLICY "Managers, admins and accounting can update drivers" 
ON public.drivers FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can create drivers" ON public.drivers;
CREATE POLICY "Safety can create drivers" 
ON public.drivers FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can delete drivers" ON public.drivers;
CREATE POLICY "Safety can delete drivers" 
ON public.drivers FOR DELETE
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can update drivers" ON public.drivers;
CREATE POLICY "Safety can update drivers" 
ON public.drivers FOR UPDATE
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can view drivers" ON public.drivers;
CREATE POLICY "Safety can view drivers" 
ON public.drivers FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create drivers" ON public.drivers;
CREATE POLICY "Supervisors can create drivers" 
ON public.drivers FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can delete drivers" ON public.drivers;
CREATE POLICY "Supervisors can delete drivers" 
ON public.drivers FOR DELETE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update drivers" ON public.drivers;
CREATE POLICY "Supervisors can update drivers" 
ON public.drivers FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view drivers" ON public.drivers;
CREATE POLICY "Supervisors can view drivers" 
ON public.drivers FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));