-- Optimize RLS policies for better performance by wrapping auth functions in SELECT
-- This prevents re-evaluation for each row

-- ============================================================
-- BROKERS TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete brokers" ON public.brokers;
CREATE POLICY "Admins and accounting can delete brokers" 
ON public.brokers FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can create brokers" ON public.brokers;
CREATE POLICY "Dispatch, managers, admins and accounting can create brokers" 
ON public.brokers FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view brokers" ON public.brokers;
CREATE POLICY "Dispatch, managers, admins and accounting can view brokers" 
ON public.brokers FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update brokers" ON public.brokers;
CREATE POLICY "Managers, admins and accounting can update brokers" 
ON public.brokers FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can view brokers" ON public.brokers;
CREATE POLICY "Safety can view brokers" 
ON public.brokers FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create brokers" ON public.brokers;
CREATE POLICY "Supervisors can create brokers" 
ON public.brokers FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update brokers" ON public.brokers;
CREATE POLICY "Supervisors can update brokers" 
ON public.brokers FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view brokers" ON public.brokers;
CREATE POLICY "Supervisors can view brokers" 
ON public.brokers FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

-- ============================================================
-- COMPANIES TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete companies" ON public.companies;
CREATE POLICY "Admins and accounting can delete companies" 
ON public.companies FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Authenticated users with roles can view companies" ON public.companies;
CREATE POLICY "Authenticated users with roles can view companies" 
ON public.companies FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role)
);

DROP POLICY IF EXISTS "Dispatch and higher roles can create companies" ON public.companies;
CREATE POLICY "Dispatch and higher roles can create companies" 
ON public.companies FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role)
);

DROP POLICY IF EXISTS "Drivers can view their company" ON public.companies;
CREATE POLICY "Drivers can view their company" 
ON public.companies FOR SELECT
USING (id IN (
  SELECT trucks.company_id FROM trucks
  WHERE trucks.driver1_id IN (
    SELECT d.id FROM drivers d
    JOIN profiles p ON p.email = d.email
    WHERE p.user_id = (SELECT auth.uid()) AND has_role(p.user_id, 'driver'::app_role)
  )
));

DROP POLICY IF EXISTS "Managers, admins and accounting can update companies" ON public.companies;
CREATE POLICY "Managers, admins and accounting can update companies" 
ON public.companies FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can view companies" ON public.companies;
CREATE POLICY "Safety can view companies" 
ON public.companies FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can update companies" ON public.companies;
CREATE POLICY "Supervisors can update companies" 
ON public.companies FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view companies" ON public.companies;
CREATE POLICY "Supervisors can view companies" 
ON public.companies FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

-- ============================================================
-- DISPATCHER STATUS TABLE
-- ============================================================

DROP POLICY IF EXISTS "Managers and admins can delete dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Managers and admins can delete dispatcher status" 
ON public.dispatcher_status FOR DELETE
USING (has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers and admins can insert dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Managers and admins can insert dispatcher status" 
ON public.dispatcher_status FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers and admins can update dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Managers and admins can update dispatcher status" 
ON public.dispatcher_status FOR UPDATE
USING (has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role))
WITH CHECK (has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers and admins can view dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Managers and admins can view dispatcher status" 
ON public.dispatcher_status FOR SELECT
USING (has_role((SELECT auth.uid()), 'manager'::app_role) OR has_role((SELECT auth.uid()), 'admin'::app_role));

-- ============================================================
-- DRIVER FILES TABLE
-- ============================================================

DROP POLICY IF EXISTS "Admins and accounting can delete driver_files" ON public.driver_files;
CREATE POLICY "Admins and accounting can delete driver_files" 
ON public.driver_files FOR DELETE
USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'accounting'::app_role));

DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view driver_files" ON public.driver_files;
CREATE POLICY "Dispatch, managers, admins and accounting can view driver_files" 
ON public.driver_files FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can create driver_files" ON public.driver_files;
CREATE POLICY "Managers, admins and accounting can create driver_files" 
ON public.driver_files FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Managers, admins and accounting can update driver_files" ON public.driver_files;
CREATE POLICY "Managers, admins and accounting can update driver_files" 
ON public.driver_files FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Safety can create driver_files" ON public.driver_files;
CREATE POLICY "Safety can create driver_files" 
ON public.driver_files FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can delete driver_files" ON public.driver_files;
CREATE POLICY "Safety can delete driver_files" 
ON public.driver_files FOR DELETE
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Safety can view driver files" ON public.driver_files;
CREATE POLICY "Safety can view driver files" 
ON public.driver_files FOR SELECT
USING (has_role((SELECT auth.uid()), 'safety'::app_role));

DROP POLICY IF EXISTS "Supervisors can create driver_files" ON public.driver_files;
CREATE POLICY "Supervisors can create driver_files" 
ON public.driver_files FOR INSERT
WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update driver_files" ON public.driver_files;
CREATE POLICY "Supervisors can update driver_files" 
ON public.driver_files FOR UPDATE
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view driver_files" ON public.driver_files;
CREATE POLICY "Supervisors can view driver_files" 
ON public.driver_files FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));