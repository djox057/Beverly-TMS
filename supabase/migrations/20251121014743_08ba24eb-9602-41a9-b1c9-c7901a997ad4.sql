-- RLS Policy Performance Optimization - Complete Fix
-- Wrapping all auth.uid() and has_role() calls in (SELECT ...) subqueries
-- This provides 10x-100x performance improvement by preventing per-row re-evaluation

-- =============================================================================
-- BROKERS TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view brokers" ON public.brokers;
CREATE POLICY "Chicago Management can view brokers"
ON public.brokers FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.brokers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can creat"
ON public.brokers FOR INSERT
WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.brokers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view "
ON public.brokers FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view brokers" ON public.brokers;
CREATE POLICY "Maintenance can view brokers"
ON public.brokers FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- COMPANIES TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Authenticated users with roles can view companies" ON public.companies;
CREATE POLICY "Authenticated users with roles can view companies"
ON public.companies FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Chicago Management can view companies" ON public.companies;
CREATE POLICY "Chicago Management can view companies"
ON public.companies FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch, afterhours and higher roles can create companies" ON public.companies;
CREATE POLICY "Dispatch, afterhours and higher roles can create companies"
ON public.companies FOR INSERT
WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view companies" ON public.companies;
CREATE POLICY "Maintenance can view companies"
ON public.companies FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- DISPATCHER_STATUS TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Afterhours can view dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Afterhours can view dispatcher status"
ON public.dispatcher_status FOR SELECT
USING ((SELECT has_role(auth.uid(), 'afterhours'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Chicago Management can view dispatcher status"
ON public.dispatcher_status FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch can view dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Dispatch can view dispatcher status"
ON public.dispatcher_status FOR SELECT
USING ((SELECT has_role(auth.uid(), 'dispatch'::app_role)));

-- =============================================================================
-- DRIVER_DRUG_TESTS TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view driver drug tests" ON public.driver_drug_tests;
CREATE POLICY "Chicago Management can view driver drug tests"
ON public.driver_drug_tests FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Maintenance can delete drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can delete drug tests"
ON public.driver_drug_tests FOR DELETE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can insert drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can insert drug tests"
ON public.driver_drug_tests FOR INSERT
WITH CHECK ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can update drug tests"
ON public.driver_drug_tests FOR UPDATE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can view drug tests"
ON public.driver_drug_tests FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Safety, managers and admins can delete drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can delete drug tests"
ON public.driver_drug_tests FOR DELETE
USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Safety, managers and admins can insert drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can insert drug tests"
ON public.driver_drug_tests FOR INSERT
WITH CHECK (
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Safety, managers and admins can update drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can update drug tests"
ON public.driver_drug_tests FOR UPDATE
USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Safety, managers and admins can view drug tests" ON public.driver_drug_tests;
CREATE POLICY "Safety, managers and admins can view drug tests"
ON public.driver_drug_tests FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

-- =============================================================================
-- DRIVER_FILES TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view driver files" ON public.driver_files;
CREATE POLICY "Chicago Management can view driver files"
ON public.driver_files FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));