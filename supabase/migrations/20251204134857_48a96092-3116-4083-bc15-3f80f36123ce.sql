-- BATCH 3: driver_performance, driver_pii_*, driver_sensitive_pii, driver_termination_notes, driver_yard_actions, drivers

-- DRIVER_PERFORMANCE TABLE
DROP POLICY IF EXISTS "Chicago Management can view driver performance" ON public.driver_performance;
CREATE POLICY "Chicago Management can view driver performance" ON public.driver_performance
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_performance;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_performance
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can view driver performance" ON public.driver_performance;
CREATE POLICY "Maintenance can view driver performance" ON public.driver_performance
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- DRIVER_PII_AUDIT_LOG TABLE
DROP POLICY IF EXISTS "Chicago Management can view PII audit logs" ON public.driver_pii_audit_log;
CREATE POLICY "Chicago Management can view PII audit logs" ON public.driver_pii_audit_log
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Maintenance can view PII audit logs" ON public.driver_pii_audit_log;
CREATE POLICY "Maintenance can view PII audit logs" ON public.driver_pii_audit_log
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- DRIVER_SENSITIVE_PII TABLE
DROP POLICY IF EXISTS "Chicago Management can view driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Chicago Management can view driver sensitive PII" ON public.driver_sensitive_pii
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Maintenance can view driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Maintenance can view driver sensitive PII" ON public.driver_sensitive_pii
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- DRIVER_TERMINATION_NOTES TABLE
DROP POLICY IF EXISTS "Chicago Management can view driver termination notes" ON public.driver_termination_notes;
CREATE POLICY "Chicago Management can view driver termination notes" ON public.driver_termination_notes
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch and higher roles can create termination notes" ON public.driver_termination_notes;
CREATE POLICY "Dispatch and higher roles can create termination notes" ON public.driver_termination_notes
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch and higher roles can view termination notes" ON public.driver_termination_notes;
CREATE POLICY "Dispatch and higher roles can view termination notes" ON public.driver_termination_notes
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can view termination notes" ON public.driver_termination_notes;
CREATE POLICY "Maintenance can view termination notes" ON public.driver_termination_notes
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Managers, admins and accounting can delete termination notes" ON public.driver_termination_notes;
CREATE POLICY "Managers, admins and accounting can delete termination notes" ON public.driver_termination_notes
FOR DELETE USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- DRIVER_YARD_ACTIONS TABLE
DROP POLICY IF EXISTS "Managers and admins can delete driver yard actions" ON public.driver_yard_actions;
CREATE POLICY "Managers and admins can delete driver yard actions" ON public.driver_yard_actions
FOR DELETE USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- DRIVERS TABLE
DROP POLICY IF EXISTS "Authenticated users can view driver companies" ON public.drivers;
CREATE POLICY "Authenticated users can view driver companies" ON public.drivers
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role) OR 
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);

DROP POLICY IF EXISTS "Chicago Management can view drivers" ON public.drivers;
CREATE POLICY "Chicago Management can view drivers" ON public.drivers
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.drivers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.drivers
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can create drivers" ON public.drivers;
CREATE POLICY "Maintenance can create drivers" ON public.drivers
FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can delete drivers" ON public.drivers;
CREATE POLICY "Maintenance can delete drivers" ON public.drivers
FOR DELETE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can update drivers" ON public.drivers;
CREATE POLICY "Maintenance can update drivers" ON public.drivers
FOR UPDATE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can view drivers" ON public.drivers;
CREATE POLICY "Maintenance can view drivers" ON public.drivers
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));