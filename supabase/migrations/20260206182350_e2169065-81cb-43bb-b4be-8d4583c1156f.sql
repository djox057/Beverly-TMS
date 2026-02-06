
-- ============================================================
-- BATCH 3B: RLS Policy Consolidation - Remaining tables
-- ============================================================

-- ==================== FUEL_TRANSACTIONS (6 → 2) ====================
DROP POLICY IF EXISTS "Accounting can manage fuel transactions" ON public.fuel_transactions;
DROP POLICY IF EXISTS "Admins can manage fuel transactions" ON public.fuel_transactions;
DROP POLICY IF EXISTS "Maintenance can manage fuel transactions" ON public.fuel_transactions;
DROP POLICY IF EXISTS "Dispatch can view fuel transactions" ON public.fuel_transactions;
DROP POLICY IF EXISTS "Managers can view fuel transactions" ON public.fuel_transactions;
DROP POLICY IF EXISTS "Supervisors can view fuel transactions" ON public.fuel_transactions;

CREATE POLICY "Roles can view fuel_transactions" ON public.fuel_transactions FOR SELECT
  USING (has_any_role(ARRAY['dispatch','manager','admin','accounting','supervisor','maintenance']::app_role[]));
CREATE POLICY "Roles can manage fuel_transactions" ON public.fuel_transactions FOR ALL
  USING (has_any_role(ARRAY['admin','accounting','maintenance']::app_role[]))
  WITH CHECK (has_any_role(ARRAY['admin','accounting','maintenance']::app_role[]));

-- ==================== DRIVER_CASH_ADVANCES (4 → 3) ====================
DROP POLICY IF EXISTS "Admins managers accounting can view all cash advances" ON public.driver_cash_advances;
DROP POLICY IF EXISTS "Dispatch and other roles can view all cash advances" ON public.driver_cash_advances;
DROP POLICY IF EXISTS "Admins and accounting can delete cash advances" ON public.driver_cash_advances;
-- Keep: "Drivers can view their own cash advances" (special driver self-access)

CREATE POLICY "Roles can view driver_cash_advances" ON public.driver_cash_advances FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management','yard']::app_role[]));
CREATE POLICY "Roles can delete driver_cash_advances" ON public.driver_cash_advances FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting']::app_role[]));

-- ==================== COMPANY_FILES (5 → 4) ====================
DROP POLICY IF EXISTS "All authenticated users can view company files" ON public.company_files;
DROP POLICY IF EXISTS "Chicago Management can view company files" ON public.company_files;
DROP POLICY IF EXISTS "Managers, admins and accounting can update company files" ON public.company_files;
DROP POLICY IF EXISTS "Managers, admins and accounting can delete company files" ON public.company_files;
-- Keep: "Drivers can view their company files" (special driver self-access)

CREATE POLICY "Roles can view company_files" ON public.company_files FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','safety','supervisor','chicago_management']::app_role[]));
CREATE POLICY "Roles can update company_files" ON public.company_files FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting']::app_role[]));
CREATE POLICY "Roles can delete company_files" ON public.company_files FOR DELETE
  USING (has_any_role(ARRAY['manager','admin','accounting']::app_role[]));

-- ==================== DRIVER_TERMINATION_NOTES (4 → 2) ====================
DROP POLICY IF EXISTS "Dispatch and higher roles can view termination notes" ON public.driver_termination_notes;
DROP POLICY IF EXISTS "Chicago Management can view driver termination notes" ON public.driver_termination_notes;
DROP POLICY IF EXISTS "Maintenance can view termination notes" ON public.driver_termination_notes;
DROP POLICY IF EXISTS "Managers, admins and accounting can delete termination notes" ON public.driver_termination_notes;

CREATE POLICY "Roles can view driver_termination_notes" ON public.driver_termination_notes FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));
CREATE POLICY "Roles can delete driver_termination_notes" ON public.driver_termination_notes FOR DELETE
  USING (has_any_role(ARRAY['manager','admin','accounting']::app_role[]));

-- ==================== DRIVER_YARD_ACTIONS (4 → 2) ====================
DROP POLICY IF EXISTS "Yard can view driver yard actions" ON public.driver_yard_actions;
DROP POLICY IF EXISTS "Accounting can delete driver yard actions" ON public.driver_yard_actions;
DROP POLICY IF EXISTS "Maintenance can delete yard arrivals" ON public.driver_yard_actions;
DROP POLICY IF EXISTS "Managers and admins can delete driver yard actions" ON public.driver_yard_actions;

CREATE POLICY "Roles can view driver_yard_actions" ON public.driver_yard_actions FOR SELECT
  USING (has_any_role(ARRAY['yard','dispatch','afterhours','manager','admin','accounting','supervisor','maintenance']::app_role[]));
CREATE POLICY "Roles can delete driver_yard_actions" ON public.driver_yard_actions FOR DELETE
  USING (has_any_role(ARRAY['manager','admin','accounting','maintenance']::app_role[]));

-- ==================== YARD_LOADS (4 → 3) ====================
DROP POLICY IF EXISTS "Dispatch and higher can view yard loads" ON public.yard_loads;
DROP POLICY IF EXISTS "Yard role can view yard loads" ON public.yard_loads;
DROP POLICY IF EXISTS "Dispatch and higher can update yard loads" ON public.yard_loads;
DROP POLICY IF EXISTS "Managers and admins can delete yard loads" ON public.yard_loads;

CREATE POLICY "Roles can view yard_loads" ON public.yard_loads FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','yard']::app_role[]));
CREATE POLICY "Roles can update yard_loads" ON public.yard_loads FOR UPDATE
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor']::app_role[]));
CREATE POLICY "Roles can delete yard_loads" ON public.yard_loads FOR DELETE
  USING (has_any_role(ARRAY['manager','admin']::app_role[]));

-- ==================== CANCELED_ORDERS_BACKUP (3 → 2) ====================
DROP POLICY IF EXISTS "Dispatch and higher can view canceled order backups" ON public.canceled_orders_backup;
DROP POLICY IF EXISTS "Chicago Management can view canceled orders backup" ON public.canceled_orders_backup;
DROP POLICY IF EXISTS "Managers, admins and accounting can delete canceled order backu" ON public.canceled_orders_backup;

CREATE POLICY "Roles can view canceled_orders_backup" ON public.canceled_orders_backup FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','chicago_management']::app_role[]));
CREATE POLICY "Roles can delete canceled_orders_backup" ON public.canceled_orders_backup FOR DELETE
  USING (has_any_role(ARRAY['manager','admin','accounting']::app_role[]));

-- ==================== DISPATCHER_NOTES (3 → 3, consolidated) ====================
DROP POLICY IF EXISTS "Managers, admins and chicago_management can view dispatcher not" ON public.dispatcher_notes;
DROP POLICY IF EXISTS "Managers, admins and chicago_management can update dispatcher n" ON public.dispatcher_notes;
DROP POLICY IF EXISTS "Managers, admins and chicago_management can delete dispatcher n" ON public.dispatcher_notes;

CREATE POLICY "Roles can view dispatcher_notes" ON public.dispatcher_notes FOR SELECT
  USING (has_any_role(ARRAY['manager','admin','chicago_management']::app_role[]));
CREATE POLICY "Roles can update dispatcher_notes" ON public.dispatcher_notes FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','chicago_management']::app_role[]) AND date = CURRENT_DATE);
CREATE POLICY "Roles can delete dispatcher_notes" ON public.dispatcher_notes FOR DELETE
  USING (has_any_role(ARRAY['manager','admin','chicago_management']::app_role[]) AND date = CURRENT_DATE);

-- ==================== DISPATCHER_DAILY_DRIVER_COUNTS (2 → 1) ====================
DROP POLICY IF EXISTS "Dispatch and higher can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts;
DROP POLICY IF EXISTS "Chicago Management can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts;

CREATE POLICY "Roles can view dispatcher_daily_driver_counts" ON public.dispatcher_daily_driver_counts FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','chicago_management']::app_role[]));

-- ==================== ASSIGNMENT_HISTORY (2 → 1) ====================
DROP POLICY IF EXISTS "Authenticated users can view assignment history" ON public.assignment_history;
DROP POLICY IF EXISTS "Chicago Management can view assignment history" ON public.assignment_history;

CREATE POLICY "Roles can view assignment_history" ON public.assignment_history FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));

-- ==================== DISPATCHER_SUPERVISORS (1 → 1) ====================
DROP POLICY IF EXISTS "Managers and admins can manage dispatcher supervisors" ON public.dispatcher_supervisors;

CREATE POLICY "Roles can manage dispatcher_supervisors" ON public.dispatcher_supervisors FOR ALL
  USING (has_any_role(ARRAY['admin','manager']::app_role[]))
  WITH CHECK (has_any_role(ARRAY['admin','manager']::app_role[]));

-- ==================== DELETED_DRIVERS/TRAILERS/TRUCKS (1 each → 1 each) ====================
DROP POLICY IF EXISTS "Authenticated users can view deleted drivers" ON public.deleted_drivers;
CREATE POLICY "Roles can view deleted_drivers" ON public.deleted_drivers FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

DROP POLICY IF EXISTS "Authenticated users can view deleted trailers" ON public.deleted_trailers;
CREATE POLICY "Roles can view deleted_trailers" ON public.deleted_trailers FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

DROP POLICY IF EXISTS "Authenticated users can view deleted trucks" ON public.deleted_trucks;
CREATE POLICY "Roles can view deleted_trucks" ON public.deleted_trucks FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

-- ==================== REMAINING SMALL TABLES ====================

-- analytics_calculation_log (1 → 1)
DROP POLICY IF EXISTS "Admins can view calculation logs" ON public.analytics_calculation_log;
CREATE POLICY "Roles can view analytics_calculation_log" ON public.analytics_calculation_log FOR SELECT
  USING (has_any_role(ARRAY['admin','manager']::app_role[]));

-- analytics_dispatcher_period (4 → 3, keep special cases)
DROP POLICY IF EXISTS "Admins and managers can view all analytics" ON public.analytics_dispatcher_period;
DROP POLICY IF EXISTS "Dispatchers can view own analytics" ON public.analytics_dispatcher_period;
DROP POLICY IF EXISTS "Safety can view all analytics" ON public.analytics_dispatcher_period;
DROP POLICY IF EXISTS "Supervisors can view office analytics" ON public.analytics_dispatcher_period;

CREATE POLICY "Roles can view all analytics" ON public.analytics_dispatcher_period FOR SELECT
  USING (has_any_role(ARRAY['admin','manager','accounting','chicago_management','safety']::app_role[]));
CREATE POLICY "Dispatchers can view own analytics" ON public.analytics_dispatcher_period FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours']::app_role[]) AND dispatcher_id = auth.uid());
CREATE POLICY "Supervisors can view office analytics" ON public.analytics_dispatcher_period FOR SELECT
  USING (has_role(auth.uid(), 'supervisor'::app_role) AND office = (SELECT profiles.office::text FROM profiles WHERE profiles.user_id = auth.uid()));

-- archive_version (1 → 1)
DROP POLICY IF EXISTS "Managers admins accounting can update archive version" ON public.archive_version;
CREATE POLICY "Roles can update archive_version" ON public.archive_version FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting']::app_role[]));

-- archived_orders_metadata (2 → 2)
DROP POLICY IF EXISTS "Admins managers accounting can update archived_orders_metadata" ON public.archived_orders_metadata;
DROP POLICY IF EXISTS "Admins and accounting can delete archived_orders_metadata" ON public.archived_orders_metadata;
CREATE POLICY "Roles can update archived_orders_metadata" ON public.archived_orders_metadata FOR UPDATE
  USING (has_any_role(ARRAY['admin','manager','accounting']::app_role[]));
CREATE POLICY "Roles can delete archived_orders_metadata" ON public.archived_orders_metadata FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting']::app_role[]));

-- afterhours_schedule (1 → 1, preserve is_schedule_manager)
DROP POLICY IF EXISTS "Admins managers and schedule managers can delete afterhours sch" ON public.afterhours_schedule;
CREATE POLICY "Roles can delete afterhours_schedule" ON public.afterhours_schedule FOR DELETE
  USING (has_any_role(ARRAY['admin','manager']::app_role[]) OR is_schedule_manager(auth.uid()));

-- driver_expenses (3 → 3)
DROP POLICY IF EXISTS "Dispatch and higher can view driver expenses" ON public.driver_expenses;
DROP POLICY IF EXISTS "Managers admins accounting can update driver expenses" ON public.driver_expenses;
DROP POLICY IF EXISTS "Admins and accounting can delete driver expenses" ON public.driver_expenses;
CREATE POLICY "Roles can view driver_expenses" ON public.driver_expenses FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));
CREATE POLICY "Roles can update driver_expenses" ON public.driver_expenses FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting']::app_role[]));
CREATE POLICY "Roles can delete driver_expenses" ON public.driver_expenses FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting']::app_role[]));

-- driver_email_log (1 → 1)
DROP POLICY IF EXISTS "Dispatch and higher can view driver email log" ON public.driver_email_log;
CREATE POLICY "Roles can view driver_email_log" ON public.driver_email_log FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor']::app_role[]));

-- exported_weeks (1 → 1)
DROP POLICY IF EXISTS "Authenticated users can view exported weeks" ON public.exported_weeks;
CREATE POLICY "Roles can view exported_weeks" ON public.exported_weeks FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

-- fuel_driver_mappings (3 → 3)
DROP POLICY IF EXISTS "Dispatch and higher can view fuel driver mappings" ON public.fuel_driver_mappings;
DROP POLICY IF EXISTS "Managers, admins and accounting can update fuel driver mappings" ON public.fuel_driver_mappings;
DROP POLICY IF EXISTS "Managers, admins and accounting can delete fuel driver mappings" ON public.fuel_driver_mappings;
CREATE POLICY "Roles can view fuel_driver_mappings" ON public.fuel_driver_mappings FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor']::app_role[]));
CREATE POLICY "Roles can update fuel_driver_mappings" ON public.fuel_driver_mappings FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting']::app_role[]));
CREATE POLICY "Roles can delete fuel_driver_mappings" ON public.fuel_driver_mappings FOR DELETE
  USING (has_any_role(ARRAY['manager','admin','accounting']::app_role[]));

-- ifta_records (2 → 2)
DROP POLICY IF EXISTS "Dispatch and higher can view IFTA records" ON public.ifta_records;
DROP POLICY IF EXISTS "Admins and accounting can delete IFTA records" ON public.ifta_records;
CREATE POLICY "Roles can view ifta_records" ON public.ifta_records FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor']::app_role[]));
CREATE POLICY "Roles can delete ifta_records" ON public.ifta_records FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting']::app_role[]));

-- late_notifications (2 → 2)
DROP POLICY IF EXISTS "Dispatch and higher can view late notifications" ON public.late_notifications;
DROP POLICY IF EXISTS "Managers and admins can delete late notifications" ON public.late_notifications;
CREATE POLICY "Roles can view late_notifications" ON public.late_notifications FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor']::app_role[]));
CREATE POLICY "Roles can delete late_notifications" ON public.late_notifications FOR DELETE
  USING (has_any_role(ARRAY['manager','admin']::app_role[]));

-- order_week_overrides (4 → 3)
DROP POLICY IF EXISTS "Managers admins accounting can view week overrides" ON public.order_week_overrides;
DROP POLICY IF EXISTS "Dispatch and other roles can view week overrides" ON public.order_week_overrides;
DROP POLICY IF EXISTS "Managers admins accounting can update week overrides" ON public.order_week_overrides;
DROP POLICY IF EXISTS "Managers admins accounting can delete week overrides" ON public.order_week_overrides;
CREATE POLICY "Roles can view order_week_overrides" ON public.order_week_overrides FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));
CREATE POLICY "Roles can update order_week_overrides" ON public.order_week_overrides FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting']::app_role[]));
CREATE POLICY "Roles can delete order_week_overrides" ON public.order_week_overrides FOR DELETE
  USING (has_any_role(ARRAY['manager','admin','accounting']::app_role[]));

-- repairs (3 → 3)
DROP POLICY IF EXISTS "Admins managers accounting maintenance chicago_mgmt can view re" ON public.repairs;
DROP POLICY IF EXISTS "Admins managers accounting maintenance can update repairs" ON public.repairs;
DROP POLICY IF EXISTS "Admins managers accounting can delete repairs" ON public.repairs;
CREATE POLICY "Roles can view repairs" ON public.repairs FOR SELECT
  USING (has_any_role(ARRAY['admin','manager','accounting','maintenance','chicago_management']::app_role[]));
CREATE POLICY "Roles can update repairs" ON public.repairs FOR UPDATE
  USING (has_any_role(ARRAY['admin','manager','accounting','maintenance']::app_role[]));
CREATE POLICY "Roles can delete repairs" ON public.repairs FOR DELETE
  USING (has_any_role(ARRAY['admin','manager','accounting']::app_role[]));

-- trailer_termination_notes (3 → 3)
DROP POLICY IF EXISTS "Authenticated users can view trailer termination notes" ON public.trailer_termination_notes;
DROP POLICY IF EXISTS "Managers admins can update trailer termination notes" ON public.trailer_termination_notes;
DROP POLICY IF EXISTS "Managers admins can delete trailer termination notes" ON public.trailer_termination_notes;
CREATE POLICY "Roles can view trailer_termination_notes" ON public.trailer_termination_notes FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));
CREATE POLICY "Roles can update trailer_termination_notes" ON public.trailer_termination_notes FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin']::app_role[]));
CREATE POLICY "Roles can delete trailer_termination_notes" ON public.trailer_termination_notes FOR DELETE
  USING (has_any_role(ARRAY['manager','admin']::app_role[]));

-- truck_termination_notes (3 → 3)
DROP POLICY IF EXISTS "Authenticated users can view truck termination notes" ON public.truck_termination_notes;
DROP POLICY IF EXISTS "Managers admins can update truck termination notes" ON public.truck_termination_notes;
DROP POLICY IF EXISTS "Managers admins can delete truck termination notes" ON public.truck_termination_notes;
CREATE POLICY "Roles can view truck_termination_notes" ON public.truck_termination_notes FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));
CREATE POLICY "Roles can update truck_termination_notes" ON public.truck_termination_notes FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin']::app_role[]));
CREATE POLICY "Roles can delete truck_termination_notes" ON public.truck_termination_notes FOR DELETE
  USING (has_any_role(ARRAY['manager','admin']::app_role[]));
