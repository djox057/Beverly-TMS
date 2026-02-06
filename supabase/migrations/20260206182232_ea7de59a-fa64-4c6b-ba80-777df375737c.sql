
-- ============================================================
-- BATCH 3A: RLS Policy Consolidation - Higher traffic tables
-- ============================================================

-- ==================== DISPATCHER_STATUS (8 → 3) ====================
DROP POLICY IF EXISTS "Afterhours can view dispatcher status" ON public.dispatcher_status;
DROP POLICY IF EXISTS "Chicago Management can view dispatcher status" ON public.dispatcher_status;
DROP POLICY IF EXISTS "Dispatch can view dispatcher status" ON public.dispatcher_status;
DROP POLICY IF EXISTS "Managers and admins can view dispatcher status" ON public.dispatcher_status;
DROP POLICY IF EXISTS "Safety can view dispatcher status" ON public.dispatcher_status;
DROP POLICY IF EXISTS "Managers and admins can update dispatcher status" ON public.dispatcher_status;
DROP POLICY IF EXISTS "Managers and admins can delete dispatcher status" ON public.dispatcher_status;

CREATE POLICY "Roles can view dispatcher_status" ON public.dispatcher_status FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','safety','chicago_management']::app_role[]));
CREATE POLICY "Managers admins can update dispatcher_status" ON public.dispatcher_status FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin']::app_role[]));
CREATE POLICY "Managers admins can delete dispatcher_status" ON public.dispatcher_status FOR DELETE
  USING (has_any_role(ARRAY['manager','admin']::app_role[]));

-- ==================== DRIVER_PERFORMANCE (10 → 4) ====================
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_performance;
DROP POLICY IF EXISTS "Chicago Management can view driver performance" ON public.driver_performance;
DROP POLICY IF EXISTS "Maintenance can view driver performance" ON public.driver_performance;
DROP POLICY IF EXISTS "Safety can view driver performance" ON public.driver_performance;
DROP POLICY IF EXISTS "Supervisors can view driver performance" ON public.driver_performance;
DROP POLICY IF EXISTS "Managers, admins and accounting can update driver performance" ON public.driver_performance;
DROP POLICY IF EXISTS "Supervisors can update driver performance" ON public.driver_performance;
DROP POLICY IF EXISTS "Admins and accounting can delete driver performance" ON public.driver_performance;

CREATE POLICY "Roles can view driver_performance" ON public.driver_performance FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));
CREATE POLICY "Roles can update driver_performance" ON public.driver_performance FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting','supervisor']::app_role[]));
CREATE POLICY "Roles can delete driver_performance" ON public.driver_performance FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting']::app_role[]));

-- ==================== DRIVER_SENSITIVE_PII (10 → 4) ====================
DROP POLICY IF EXISTS "Managers, admins and accounting can view driver sensitive PII" ON public.driver_sensitive_pii;
DROP POLICY IF EXISTS "Chicago Management can view driver sensitive PII" ON public.driver_sensitive_pii;
DROP POLICY IF EXISTS "Maintenance can view driver sensitive PII" ON public.driver_sensitive_pii;
DROP POLICY IF EXISTS "Safety can view driver sensitive PII" ON public.driver_sensitive_pii;
DROP POLICY IF EXISTS "Supervisors can view driver sensitive PII" ON public.driver_sensitive_pii;
DROP POLICY IF EXISTS "Managers, admins and accounting can update driver sensitive PII" ON public.driver_sensitive_pii;
DROP POLICY IF EXISTS "Supervisors can update driver sensitive PII" ON public.driver_sensitive_pii;
DROP POLICY IF EXISTS "Admins and accounting can delete driver sensitive PII" ON public.driver_sensitive_pii;

CREATE POLICY "Roles can view driver_sensitive_pii" ON public.driver_sensitive_pii FOR SELECT
  USING (has_any_role(ARRAY['manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));
CREATE POLICY "Roles can update driver_sensitive_pii" ON public.driver_sensitive_pii FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting','supervisor']::app_role[]));
CREATE POLICY "Roles can delete driver_sensitive_pii" ON public.driver_sensitive_pii FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting']::app_role[]));

-- ==================== DRIVER_DRUG_TESTS (9 → 4) ====================
DROP POLICY IF EXISTS "Safety, managers and admins can view drug tests" ON public.driver_drug_tests;
DROP POLICY IF EXISTS "Chicago Management can view driver drug tests" ON public.driver_drug_tests;
DROP POLICY IF EXISTS "Maintenance can view drug tests" ON public.driver_drug_tests;
DROP POLICY IF EXISTS "Safety, managers and admins can update drug tests" ON public.driver_drug_tests;
DROP POLICY IF EXISTS "Maintenance can update drug tests" ON public.driver_drug_tests;
DROP POLICY IF EXISTS "Safety, managers and admins can delete drug tests" ON public.driver_drug_tests;
DROP POLICY IF EXISTS "Maintenance can delete drug tests" ON public.driver_drug_tests;

CREATE POLICY "Roles can view driver_drug_tests" ON public.driver_drug_tests FOR SELECT
  USING (has_any_role(ARRAY['safety','manager','admin','maintenance','chicago_management']::app_role[]));
CREATE POLICY "Roles can update driver_drug_tests" ON public.driver_drug_tests FOR UPDATE
  USING (has_any_role(ARRAY['safety','manager','admin','maintenance']::app_role[]));
CREATE POLICY "Roles can delete driver_drug_tests" ON public.driver_drug_tests FOR DELETE
  USING (has_any_role(ARRAY['safety','manager','admin','maintenance']::app_role[]));

-- ==================== DRIVER_PII_AUDIT_LOG (4 → 1) ====================
DROP POLICY IF EXISTS "Admins and accounting can view PII audit logs" ON public.driver_pii_audit_log;
DROP POLICY IF EXISTS "Chicago Management can view PII audit logs" ON public.driver_pii_audit_log;
DROP POLICY IF EXISTS "Maintenance can view PII audit logs" ON public.driver_pii_audit_log;
DROP POLICY IF EXISTS "Safety can view PII audit logs" ON public.driver_pii_audit_log;

CREATE POLICY "Roles can view driver_pii_audit_log" ON public.driver_pii_audit_log FOR SELECT
  USING (has_any_role(ARRAY['admin','accounting','safety','maintenance','chicago_management']::app_role[]));

-- ==================== TRUCK_LOCATIONS (8 → 1) ====================
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_locations;
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view truck locati" ON public.truck_locations;
DROP POLICY IF EXISTS "Dispatch and higher roles can view truck locations" ON public.truck_locations;
DROP POLICY IF EXISTS "Chicago Management can view truck locations" ON public.truck_locations;
DROP POLICY IF EXISTS "Maintenance can view truck locations" ON public.truck_locations;
DROP POLICY IF EXISTS "Maintenance can view truck_locations" ON public.truck_locations;
DROP POLICY IF EXISTS "Safety can view truck locations" ON public.truck_locations;
DROP POLICY IF EXISTS "Supervisors can view truck locations" ON public.truck_locations;

CREATE POLICY "Roles can view truck_locations" ON public.truck_locations FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));

-- ==================== TRUCK_NOTE_HISTORY (4 → 1) ====================
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_note_history;
DROP POLICY IF EXISTS "Chicago Management can view truck note history" ON public.truck_note_history;
DROP POLICY IF EXISTS "Maintenance can view truck note history" ON public.truck_note_history;
DROP POLICY IF EXISTS "Maintenance can view truck_note_history" ON public.truck_note_history;

CREATE POLICY "Roles can view truck_note_history" ON public.truck_note_history FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','safety','maintenance','chicago_management']::app_role[]));

-- ==================== RECOVERY_HISTORY (6 → 3) ====================
DROP POLICY IF EXISTS "Dispatch and higher can view recovery history" ON public.recovery_history;
DROP POLICY IF EXISTS "Chicago Management can view recovery history" ON public.recovery_history;
DROP POLICY IF EXISTS "Maintenance can view recovery history" ON public.recovery_history;
DROP POLICY IF EXISTS "Dispatch and higher can update recovery history" ON public.recovery_history;
DROP POLICY IF EXISTS "Managers and supervisors can update recovery history" ON public.recovery_history;
DROP POLICY IF EXISTS "Managers, admins, accounting can delete recovery history" ON public.recovery_history;

CREATE POLICY "Roles can view recovery_history" ON public.recovery_history FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));
CREATE POLICY "Roles can update recovery_history" ON public.recovery_history FOR UPDATE
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor']::app_role[]));
CREATE POLICY "Roles can delete recovery_history" ON public.recovery_history FOR DELETE
  USING (has_any_role(ARRAY['manager','admin','accounting']::app_role[]));

-- ==================== ORDER_TRANSFERS (5 → 3) ====================
DROP POLICY IF EXISTS "Dispatch and higher can view order_transfers" ON public.order_transfers;
DROP POLICY IF EXISTS "Chicago Management can view order_transfers" ON public.order_transfers;
DROP POLICY IF EXISTS "Dispatch and higher can update order_transfers" ON public.order_transfers;
DROP POLICY IF EXISTS "Managers and admins can delete order_transfers" ON public.order_transfers;

CREATE POLICY "Roles can view order_transfers" ON public.order_transfers FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','chicago_management']::app_role[]));
CREATE POLICY "Roles can update order_transfers" ON public.order_transfers FOR UPDATE
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor']::app_role[]));
CREATE POLICY "Roles can delete order_transfers" ON public.order_transfers FOR DELETE
  USING (has_any_role(ARRAY['manager','admin']::app_role[]));
