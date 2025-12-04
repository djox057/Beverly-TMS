-- BATCH 1: Small tables (assignment_history, brokers, canceled_orders_backup, companies, company_files)

-- ASSIGNMENT_HISTORY TABLE
DROP POLICY IF EXISTS "Authenticated users can view assignment history" ON public.assignment_history;
CREATE POLICY "Authenticated users can view assignment history" ON public.assignment_history
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

DROP POLICY IF EXISTS "Chicago Management can view assignment history" ON public.assignment_history;
CREATE POLICY "Chicago Management can view assignment history" ON public.assignment_history
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

-- BROKERS TABLE
DROP POLICY IF EXISTS "Chicago Management can view brokers" ON public.brokers;
CREATE POLICY "Chicago Management can view brokers" ON public.brokers
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.brokers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can creat" ON public.brokers
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.brokers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.brokers
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can view brokers" ON public.brokers;
CREATE POLICY "Maintenance can view brokers" ON public.brokers
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- CANCELED_ORDERS_BACKUP TABLE
DROP POLICY IF EXISTS "Chicago Management can view canceled orders backup" ON public.canceled_orders_backup;
CREATE POLICY "Chicago Management can view canceled orders backup" ON public.canceled_orders_backup
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch and higher can create canceled order backups" ON public.canceled_orders_backup;
CREATE POLICY "Dispatch and higher can create canceled order backups" ON public.canceled_orders_backup
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

DROP POLICY IF EXISTS "Dispatch and higher can view canceled order backups" ON public.canceled_orders_backup;
CREATE POLICY "Dispatch and higher can view canceled order backups" ON public.canceled_orders_backup
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can delete canceled order backu" ON public.canceled_orders_backup;
CREATE POLICY "Managers, admins and accounting can delete canceled order backu" ON public.canceled_orders_backup
FOR DELETE USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- COMPANIES TABLE
DROP POLICY IF EXISTS "Authenticated users with roles can view companies" ON public.companies;
CREATE POLICY "Authenticated users with roles can view companies" ON public.companies
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role)
);

DROP POLICY IF EXISTS "Chicago Management can view companies" ON public.companies;
CREATE POLICY "Chicago Management can view companies" ON public.companies
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch, afterhours and higher roles can create companies" ON public.companies;
CREATE POLICY "Dispatch, afterhours and higher roles can create companies" ON public.companies
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can view companies" ON public.companies;
CREATE POLICY "Maintenance can view companies" ON public.companies
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- COMPANY_FILES TABLE
DROP POLICY IF EXISTS "All authenticated users can view company files" ON public.company_files;
CREATE POLICY "All authenticated users can view company files" ON public.company_files
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

DROP POLICY IF EXISTS "Chicago Management can view company files" ON public.company_files;
CREATE POLICY "Chicago Management can view company files" ON public.company_files
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Managers, admins and accounting can create company files" ON public.company_files;
CREATE POLICY "Managers, admins and accounting can create company files" ON public.company_files
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can delete company files" ON public.company_files;
CREATE POLICY "Managers, admins and accounting can delete company files" ON public.company_files
FOR DELETE USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update company files" ON public.company_files;
CREATE POLICY "Managers, admins and accounting can update company files" ON public.company_files
FOR UPDATE USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);