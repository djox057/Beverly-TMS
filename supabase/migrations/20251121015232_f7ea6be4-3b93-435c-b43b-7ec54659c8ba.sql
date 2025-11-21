-- RLS Policy Performance Optimization - Final Batch 5
-- Completing all remaining auth.uid() and has_role() optimizations

-- =============================================================================
-- TRUCK_FILES TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view truck files" ON public.truck_files;
CREATE POLICY "Chicago Management can view truck files"
ON public.truck_files FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can view truck files" ON public.truck_files;
CREATE POLICY "Dispatch and higher can view truck files"
ON public.truck_files FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can create truck files" ON public.truck_files;
CREATE POLICY "Maintenance can create truck files"
ON public.truck_files FOR INSERT
WITH CHECK ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can delete truck files" ON public.truck_files;
CREATE POLICY "Maintenance can delete truck files"
ON public.truck_files FOR DELETE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update truck files" ON public.truck_files;
CREATE POLICY "Maintenance can update truck files"
ON public.truck_files FOR UPDATE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view truck files" ON public.truck_files;
CREATE POLICY "Maintenance can view truck files"
ON public.truck_files FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- TRUCK_LOCATIONS TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view truck locations" ON public.truck_locations;
CREATE POLICY "Chicago Management can view truck locations"
ON public.truck_locations FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can view truck locations" ON public.truck_locations;
CREATE POLICY "Dispatch and higher can view truck locations"
ON public.truck_locations FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view truck locations" ON public.truck_locations;
CREATE POLICY "Maintenance can view truck locations"
ON public.truck_locations FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- TRUCK_NOTE_HISTORY TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view truck note history" ON public.truck_note_history;
CREATE POLICY "Chicago Management can view truck note history"
ON public.truck_note_history FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can view truck note history" ON public.truck_note_history;
CREATE POLICY "Dispatch and higher can view truck note history"
ON public.truck_note_history FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view truck note history" ON public.truck_note_history;
CREATE POLICY "Maintenance can view truck note history"
ON public.truck_note_history FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- TRUCK_NOTES TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view truck notes" ON public.truck_notes;
CREATE POLICY "Chicago Management can view truck notes"
ON public.truck_notes FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can create truck notes" ON public.truck_notes;
CREATE POLICY "Dispatch and higher can create truck notes"
ON public.truck_notes FOR INSERT
WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher can view truck notes" ON public.truck_notes;
CREATE POLICY "Dispatch and higher can view truck notes"
ON public.truck_notes FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view truck notes" ON public.truck_notes;
CREATE POLICY "Maintenance can view truck notes"
ON public.truck_notes FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Managers and admins can update truck notes" ON public.truck_notes;
CREATE POLICY "Managers and admins can update truck notes"
ON public.truck_notes FOR UPDATE
USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

-- =============================================================================
-- TRUCKS TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view trucks" ON public.trucks;
CREATE POLICY "Chicago Management can view trucks"
ON public.trucks FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can view trucks" ON public.trucks;
CREATE POLICY "Dispatch and higher can view trucks"
ON public.trucks FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can create trucks" ON public.trucks;
CREATE POLICY "Maintenance can create trucks"
ON public.trucks FOR INSERT
WITH CHECK ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can delete trucks" ON public.trucks;
CREATE POLICY "Maintenance can delete trucks"
ON public.trucks FOR DELETE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update trucks" ON public.trucks;
CREATE POLICY "Maintenance can update trucks"
ON public.trucks FOR UPDATE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view trucks" ON public.trucks;
CREATE POLICY "Maintenance can view trucks"
ON public.trucks FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- COMPANY_FILES TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "All authenticated users can view company files" ON public.company_files;
CREATE POLICY "All authenticated users can view company files"
ON public.company_files FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Chicago Management can view company files" ON public.company_files;
CREATE POLICY "Chicago Management can view company files"
ON public.company_files FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

-- =============================================================================
-- ASSIGNMENT_HISTORY TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Authenticated users can view assignment history" ON public.assignment_history;
CREATE POLICY "Authenticated users can view assignment history"
ON public.assignment_history FOR SELECT
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

DROP POLICY IF EXISTS "Chicago Management can view assignment history" ON public.assignment_history;
CREATE POLICY "Chicago Management can view assignment history"
ON public.assignment_history FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

-- =============================================================================
-- CANCELED_ORDERS_BACKUP TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view canceled orders backup" ON public.canceled_orders_backup;
CREATE POLICY "Chicago Management can view canceled orders backup"
ON public.canceled_orders_backup FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can view canceled order backups" ON public.canceled_orders_backup;
CREATE POLICY "Dispatch and higher can view canceled order backups"
ON public.canceled_orders_backup FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

-- =============================================================================
-- DISPATCHER_DAILY_DRIVER_COUNTS TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts;
CREATE POLICY "Chicago Management can view dispatcher daily counts"
ON public.dispatcher_daily_driver_counts FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts;
CREATE POLICY "Dispatch and higher can view dispatcher daily counts"
ON public.dispatcher_daily_driver_counts FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

-- =============================================================================
-- DRIVER_PII_AUDIT_LOG TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view PII audit logs" ON public.driver_pii_audit_log;
CREATE POLICY "Chicago Management can view PII audit logs"
ON public.driver_pii_audit_log FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view PII audit logs" ON public.driver_pii_audit_log;
CREATE POLICY "Maintenance can view PII audit logs"
ON public.driver_pii_audit_log FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));