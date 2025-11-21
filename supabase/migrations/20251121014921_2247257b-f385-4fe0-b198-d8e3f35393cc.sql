-- RLS Policy Performance Optimization - Batch 2
-- Continuing to wrap all auth.uid() and has_role() calls in (SELECT ...) subqueries

-- =============================================================================
-- DRIVER_FILES TABLE POLICIES (continued)
-- =============================================================================

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view "
ON public.driver_files FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can create driver_files" ON public.driver_files;
CREATE POLICY "Maintenance can create driver_files"
ON public.driver_files FOR INSERT
WITH CHECK ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can delete driver_files" ON public.driver_files;
CREATE POLICY "Maintenance can delete driver_files"
ON public.driver_files FOR DELETE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update driver_files" ON public.driver_files;
CREATE POLICY "Maintenance can update driver_files"
ON public.driver_files FOR UPDATE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view driver files" ON public.driver_files;
CREATE POLICY "Maintenance can view driver files"
ON public.driver_files FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- DRIVER_PERFORMANCE TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view driver performance" ON public.driver_performance;
CREATE POLICY "Chicago Management can view driver performance"
ON public.driver_performance FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_performance;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view "
ON public.driver_performance FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view driver performance" ON public.driver_performance;
CREATE POLICY "Maintenance can view driver performance"
ON public.driver_performance FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- DRIVER_SENSITIVE_PII TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Chicago Management can view driver sensitive PII"
ON public.driver_sensitive_pii FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Maintenance can view driver sensitive PII"
ON public.driver_sensitive_pii FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- DRIVER_TERMINATION_NOTES TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view driver termination notes" ON public.driver_termination_notes;
CREATE POLICY "Chicago Management can view driver termination notes"
ON public.driver_termination_notes FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher roles can create termination notes" ON public.driver_termination_notes;
CREATE POLICY "Dispatch and higher roles can create termination notes"
ON public.driver_termination_notes FOR INSERT
WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher roles can view termination notes" ON public.driver_termination_notes;
CREATE POLICY "Dispatch and higher roles can view termination notes"
ON public.driver_termination_notes FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'safety'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view termination notes" ON public.driver_termination_notes;
CREATE POLICY "Maintenance can view termination notes"
ON public.driver_termination_notes FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- DRIVER_YARD_ACTIONS TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Dispatch and higher can create driver yard actions" ON public.driver_yard_actions;
CREATE POLICY "Dispatch and higher can create driver yard actions"
ON public.driver_yard_actions FOR INSERT
WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher can view driver yard actions" ON public.driver_yard_actions;
CREATE POLICY "Dispatch and higher can view driver yard actions"
ON public.driver_yard_actions FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

DROP POLICY IF EXISTS "Managers and admins can delete driver yard actions" ON public.driver_yard_actions;
CREATE POLICY "Managers and admins can delete driver yard actions"
ON public.driver_yard_actions FOR DELETE
USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Managers and admins can update driver yard actions" ON public.driver_yard_actions;
CREATE POLICY "Managers and admins can update driver yard actions"
ON public.driver_yard_actions FOR UPDATE
USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

-- =============================================================================
-- DRIVERS TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view drivers" ON public.drivers;
CREATE POLICY "Chicago Management can view drivers"
ON public.drivers FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.drivers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view "
ON public.drivers FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can create drivers" ON public.drivers;
CREATE POLICY "Maintenance can create drivers"
ON public.drivers FOR INSERT
WITH CHECK ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can delete drivers" ON public.drivers;
CREATE POLICY "Maintenance can delete drivers"
ON public.drivers FOR DELETE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update drivers" ON public.drivers;
CREATE POLICY "Maintenance can update drivers"
ON public.drivers FOR UPDATE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view drivers" ON public.drivers;
CREATE POLICY "Maintenance can view drivers"
ON public.drivers FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));