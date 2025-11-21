-- Optimize RLS policies - Batch 4: canceled_orders_backup, truck_locations, user_roles, driver_pii_audit_log, company_files, driver_sensitive_pii, order_files, orders, pickup_drops, driver_termination_notes, recovery_history, brokers, companies
-- Lines 65-85 from performance audit

-- canceled_orders_backup
DROP POLICY IF EXISTS "Dispatch and higher can view canceled order backups" ON public.canceled_orders_backup;
CREATE POLICY "Dispatch and higher can view canceled order backups" ON public.canceled_orders_backup
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher can create canceled order backups" ON public.canceled_orders_backup;
CREATE POLICY "Dispatch and higher can create canceled order backups" ON public.canceled_orders_backup
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Managers, admins and accounting can delete canceled order backu" ON public.canceled_orders_backup;
CREATE POLICY "Managers, admins and accounting can delete canceled order backu" ON public.canceled_orders_backup
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

-- truck_locations
DROP POLICY IF EXISTS "Supervisors can view truck locations" ON public.truck_locations;
CREATE POLICY "Supervisors can view truck locations" ON public.truck_locations
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

-- user_roles
DROP POLICY IF EXISTS "Supervisors can view user roles" ON public.user_roles;
CREATE POLICY "Supervisors can view user roles" ON public.user_roles
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

-- driver_pii_audit_log
DROP POLICY IF EXISTS "Maintenance can view PII audit logs" ON public.driver_pii_audit_log;
CREATE POLICY "Maintenance can view PII audit logs" ON public.driver_pii_audit_log
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- company_files
DROP POLICY IF EXISTS "Drivers can view their company files" ON public.company_files;
CREATE POLICY "Drivers can view their company files" ON public.company_files
FOR SELECT USING (
  company_id IN (
    SELECT t.company_id FROM trucks t
    WHERE t.driver1_id IN (
      SELECT d.id FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = (SELECT auth.uid()) AND (SELECT has_role(p.user_id, 'driver'::app_role))
    )
  )
);

DROP POLICY IF EXISTS "Managers, admins and accounting can create company files" ON public.company_files;
CREATE POLICY "Managers, admins and accounting can create company files" ON public.company_files
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update company files" ON public.company_files;
CREATE POLICY "Managers, admins and accounting can update company files" ON public.company_files
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

DROP POLICY IF EXISTS "Managers, admins and accounting can delete company files" ON public.company_files;
CREATE POLICY "Managers, admins and accounting can delete company files" ON public.company_files
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

DROP POLICY IF EXISTS "All authenticated users can view company files" ON public.company_files;
CREATE POLICY "All authenticated users can view company files" ON public.company_files
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

-- driver_sensitive_pii
DROP POLICY IF EXISTS "Maintenance can view driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Maintenance can view driver sensitive PII" ON public.driver_sensitive_pii
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- order_files - drivers
DROP POLICY IF EXISTS "Drivers can view files for their orders v2" ON public.order_files;
CREATE POLICY "Drivers can view files for their orders v2" ON public.order_files
FOR SELECT USING (
  order_id IN (
    SELECT o.id FROM orders o
    WHERE o.driver1_id IN (
      SELECT d.id FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = (SELECT auth.uid()) AND (SELECT has_role(p.user_id, 'driver'::app_role))
    )
  )
);

-- orders - drivers
DROP POLICY IF EXISTS "Drivers can view their own orders v2" ON public.orders;
CREATE POLICY "Drivers can view their own orders v2" ON public.orders
FOR SELECT USING (
  driver1_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = (SELECT auth.uid()) AND (SELECT has_role(p.user_id, 'driver'::app_role))
  )
);

-- pickup_drops - drivers
DROP POLICY IF EXISTS "Drivers can view pickup drops for their orders v2" ON public.pickup_drops;
CREATE POLICY "Drivers can view pickup drops for their orders v2" ON public.pickup_drops
FOR SELECT USING (
  order_id IN (
    SELECT o.id FROM orders o
    WHERE o.driver1_id IN (
      SELECT d.id FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = (SELECT auth.uid()) AND (SELECT has_role(p.user_id, 'driver'::app_role))
    )
  )
);

-- driver_termination_notes
DROP POLICY IF EXISTS "Maintenance can view termination notes" ON public.driver_termination_notes;
CREATE POLICY "Maintenance can view termination notes" ON public.driver_termination_notes
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- recovery_history
DROP POLICY IF EXISTS "Dispatch and higher can view recovery history" ON public.recovery_history;
CREATE POLICY "Dispatch and higher can view recovery history" ON public.recovery_history
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Managers and supervisors can create recovery history" ON public.recovery_history;
CREATE POLICY "Managers and supervisors can create recovery history" ON public.recovery_history
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Managers and supervisors can update recovery history" ON public.recovery_history;
CREATE POLICY "Managers and supervisors can update recovery history" ON public.recovery_history
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

-- brokers
DROP POLICY IF EXISTS "Maintenance can view brokers" ON public.brokers;
CREATE POLICY "Maintenance can view brokers" ON public.brokers
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- companies
DROP POLICY IF EXISTS "Maintenance can view companies" ON public.companies;
CREATE POLICY "Maintenance can view companies" ON public.companies
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);