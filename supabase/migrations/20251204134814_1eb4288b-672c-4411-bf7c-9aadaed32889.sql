-- BATCH 2: dispatcher_*, driver_drug_tests, driver_email_log, driver_files

-- DISPATCHER_DAILY_DRIVER_COUNTS TABLE
DROP POLICY IF EXISTS "Chicago Management can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts;
CREATE POLICY "Chicago Management can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch and higher can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts;
CREATE POLICY "Dispatch and higher can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

-- DISPATCHER_NOTES TABLE
DROP POLICY IF EXISTS "Managers, admins and chicago_management can delete dispatcher n" ON public.dispatcher_notes;
CREATE POLICY "Managers, admins and chicago_management can delete dispatcher n" ON public.dispatcher_notes
FOR DELETE USING (
  (has_role((SELECT auth.uid()), 'manager'::app_role) OR 
   has_role((SELECT auth.uid()), 'admin'::app_role) OR 
   has_role((SELECT auth.uid()), 'chicago_management'::app_role)) 
  AND (date = CURRENT_DATE)
);

DROP POLICY IF EXISTS "Managers, admins and chicago_management can insert dispatcher n" ON public.dispatcher_notes;
CREATE POLICY "Managers, admins and chicago_management can insert dispatcher n" ON public.dispatcher_notes
FOR INSERT WITH CHECK (
  (has_role((SELECT auth.uid()), 'manager'::app_role) OR 
   has_role((SELECT auth.uid()), 'admin'::app_role) OR 
   has_role((SELECT auth.uid()), 'chicago_management'::app_role)) 
  AND (date = CURRENT_DATE)
);

DROP POLICY IF EXISTS "Managers, admins and chicago_management can update dispatcher n" ON public.dispatcher_notes;
CREATE POLICY "Managers, admins and chicago_management can update dispatcher n" ON public.dispatcher_notes
FOR UPDATE USING (
  (has_role((SELECT auth.uid()), 'manager'::app_role) OR 
   has_role((SELECT auth.uid()), 'admin'::app_role) OR 
   has_role((SELECT auth.uid()), 'chicago_management'::app_role)) 
  AND (date = CURRENT_DATE)
);

DROP POLICY IF EXISTS "Managers, admins and chicago_management can view dispatcher not" ON public.dispatcher_notes;
CREATE POLICY "Managers, admins and chicago_management can view dispatcher not" ON public.dispatcher_notes
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'chicago_management'::app_role)
);

-- DISPATCHER_STATUS TABLE
DROP POLICY IF EXISTS "Afterhours can view dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Afterhours can view dispatcher status" ON public.dispatcher_status
FOR SELECT USING (has_role((SELECT auth.uid()), 'afterhours'::app_role));

DROP POLICY IF EXISTS "Chicago Management can view dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Chicago Management can view dispatcher status" ON public.dispatcher_status
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch can view dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Dispatch can view dispatcher status" ON public.dispatcher_status
FOR SELECT USING (has_role((SELECT auth.uid()), 'dispatch'::app_role));

-- DRIVER_DRUG_TESTS TABLE
DROP POLICY IF EXISTS "Chicago Management can view driver drug tests" ON public.driver_drug_tests;
CREATE POLICY "Chicago Management can view driver drug tests" ON public.driver_drug_tests
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Maintenance can delete drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can delete drug tests" ON public.driver_drug_tests
FOR DELETE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can insert drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can insert drug tests" ON public.driver_drug_tests
FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can update drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can update drug tests" ON public.driver_drug_tests
FOR UPDATE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can view drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can view drug tests" ON public.driver_drug_tests
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Safety, managers and admins can delete drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can delete drug tests" ON public.driver_drug_tests
FOR DELETE USING (
  has_role((SELECT auth.uid()), 'safety'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Safety, managers and admins can insert drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can insert drug tests" ON public.driver_drug_tests
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'safety'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Safety, managers and admins can update drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can update drug tests" ON public.driver_drug_tests
FOR UPDATE USING (
  has_role((SELECT auth.uid()), 'safety'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Safety, managers and admins can view drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can view drug tests" ON public.driver_drug_tests
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'safety'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- DRIVER_EMAIL_LOG TABLE
DROP POLICY IF EXISTS "Dispatch and higher can insert driver email log" ON public.driver_email_log;
CREATE POLICY "Dispatch and higher can insert driver email log" ON public.driver_email_log
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'chicago_management'::app_role)
);

DROP POLICY IF EXISTS "Dispatch and higher can view driver email log" ON public.driver_email_log;
CREATE POLICY "Dispatch and higher can view driver email log" ON public.driver_email_log
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'chicago_management'::app_role)
);

-- DRIVER_FILES TABLE
DROP POLICY IF EXISTS "Chicago Management can view driver files" ON public.driver_files;
CREATE POLICY "Chicago Management can view driver files" ON public.driver_files
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_files
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can create driver_files" ON public.driver_files;
CREATE POLICY "Maintenance can create driver_files" ON public.driver_files
FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can delete driver_files" ON public.driver_files;
CREATE POLICY "Maintenance can delete driver_files" ON public.driver_files
FOR DELETE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can update driver_files" ON public.driver_files;
CREATE POLICY "Maintenance can update driver_files" ON public.driver_files
FOR UPDATE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can view driver files" ON public.driver_files;
CREATE POLICY "Maintenance can view driver files" ON public.driver_files
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Safety can update driver_files" ON public.driver_files;
CREATE POLICY "Safety can update driver_files" ON public.driver_files
FOR UPDATE USING (has_role((SELECT auth.uid()), 'safety'::app_role));