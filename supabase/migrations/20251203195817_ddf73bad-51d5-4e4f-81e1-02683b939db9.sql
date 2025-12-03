-- ==============================================
-- PART 1: ADD INDEXES FOR UNINDEXED FOREIGN KEYS
-- ==============================================

-- assignment_history
CREATE INDEX IF NOT EXISTS idx_assignment_history_changed_by ON public.assignment_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_assignment_history_driver1_id ON public.assignment_history(driver1_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_driver2_id ON public.assignment_history(driver2_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_trailer_id ON public.assignment_history(trailer_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_truck_id ON public.assignment_history(truck_id);

-- canceled_orders_backup
CREATE INDEX IF NOT EXISTS idx_canceled_orders_backup_canceled_by ON public.canceled_orders_backup(canceled_by);

-- driver_drug_tests
CREATE INDEX IF NOT EXISTS idx_driver_drug_tests_tested_by ON public.driver_drug_tests(tested_by);

-- driver_email_log
CREATE INDEX IF NOT EXISTS idx_driver_email_log_sent_by ON public.driver_email_log(sent_by);

-- driver_termination_notes
CREATE INDEX IF NOT EXISTS idx_driver_termination_notes_created_by ON public.driver_termination_notes(created_by);
CREATE INDEX IF NOT EXISTS idx_driver_termination_notes_driver_id ON public.driver_termination_notes(driver_id);

-- driver_yard_actions
CREATE INDEX IF NOT EXISTS idx_driver_yard_actions_created_by ON public.driver_yard_actions(created_by);
CREATE INDEX IF NOT EXISTS idx_driver_yard_actions_driver_id ON public.driver_yard_actions(driver_id);

-- exported_weeks
CREATE INDEX IF NOT EXISTS idx_exported_weeks_exported_by ON public.exported_weeks(exported_by);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_booked_by_company_id ON public.orders(booked_by_company_id);
CREATE INDEX IF NOT EXISTS idx_orders_broker_id ON public.orders(broker_id);
CREATE INDEX IF NOT EXISTS idx_orders_original_driver1_id ON public.orders(original_driver1_id);
CREATE INDEX IF NOT EXISTS idx_orders_original_driver2_id ON public.orders(original_driver2_id);
CREATE INDEX IF NOT EXISTS idx_orders_original_trailer_id ON public.orders(original_trailer_id);
CREATE INDEX IF NOT EXISTS idx_orders_original_truck_id ON public.orders(original_truck_id);
CREATE INDEX IF NOT EXISTS idx_orders_trailer_id ON public.orders(trailer_id);

-- recovery_history
CREATE INDEX IF NOT EXISTS idx_recovery_history_original_dispatcher_id ON public.recovery_history(original_dispatcher_id);
CREATE INDEX IF NOT EXISTS idx_recovery_history_original_driver1_id ON public.recovery_history(original_driver1_id);
CREATE INDEX IF NOT EXISTS idx_recovery_history_original_driver2_id ON public.recovery_history(original_driver2_id);
CREATE INDEX IF NOT EXISTS idx_recovery_history_original_trailer_id ON public.recovery_history(original_trailer_id);
CREATE INDEX IF NOT EXISTS idx_recovery_history_original_truck_id ON public.recovery_history(original_truck_id);
CREATE INDEX IF NOT EXISTS idx_recovery_history_recovery_driver1_id ON public.recovery_history(recovery_driver1_id);
CREATE INDEX IF NOT EXISTS idx_recovery_history_recovery_driver2_id ON public.recovery_history(recovery_driver2_id);
CREATE INDEX IF NOT EXISTS idx_recovery_history_recovery_trailer_id ON public.recovery_history(recovery_trailer_id);
CREATE INDEX IF NOT EXISTS idx_recovery_history_recovery_truck_id ON public.recovery_history(recovery_truck_id);
CREATE INDEX IF NOT EXISTS idx_recovery_history_reverted_by ON public.recovery_history(reverted_by);

-- truck_note_history
CREATE INDEX IF NOT EXISTS idx_truck_note_history_edited_by ON public.truck_note_history(edited_by);

-- trucks
CREATE INDEX IF NOT EXISTS idx_trucks_left_by_driver_id ON public.trucks(left_by_driver_id);

-- ==============================================
-- PART 2: DROP UNUSED INDEXES
-- ==============================================

DROP INDEX IF EXISTS public.idx_orders_company_status;
DROP INDEX IF EXISTS public.idx_orders_created_at_desc;
DROP INDEX IF EXISTS public.idx_trucks_updated_at_desc;
DROP INDEX IF EXISTS public.idx_trailers_status;
DROP INDEX IF EXISTS public.idx_exported_weeks_dates;
DROP INDEX IF EXISTS public.idx_orders_status_active;
DROP INDEX IF EXISTS public.idx_orders_canceled_updated_covering;
DROP INDEX IF EXISTS public.idx_dispatcher_status_is_active;
DROP INDEX IF EXISTS public.idx_driver_files_created_at;
DROP INDEX IF EXISTS public.idx_driver_performance_created_at;
DROP INDEX IF EXISTS public.idx_driver_performance_driver_name;
DROP INDEX IF EXISTS public.idx_driver_pii_audit_accessed_at;
DROP INDEX IF EXISTS public.idx_driver_pii_audit_accessed_by;
DROP INDEX IF EXISTS public.idx_driver_pii_audit_driver_id;
DROP INDEX IF EXISTS public.idx_driver_pii_audit_operation;
DROP INDEX IF EXISTS public.idx_drivers_hos_last_updated;
DROP INDEX IF EXISTS public.idx_drivers_license_number;
DROP INDEX IF EXISTS public.idx_lost_day_notes_updated_by;
DROP INDEX IF EXISTS public.idx_profiles_office;
DROP INDEX IF EXISTS public.idx_truck_files_created_at;
DROP INDEX IF EXISTS public.idx_truck_locations_timestamp;
DROP INDEX IF EXISTS public.idx_truck_locations_truck_id;
DROP INDEX IF EXISTS public.idx_truck_locations_truck_id_timestamp;
DROP INDEX IF EXISTS public.idx_truck_locations_truck_number;
DROP INDEX IF EXISTS public.idx_truck_note_history_edited_at;
DROP INDEX IF EXISTS public.idx_truck_note_history_truck_id;
DROP INDEX IF EXISTS public.idx_truck_notes_created_at;
DROP INDEX IF EXISTS public.idx_user_roles_role;
DROP INDEX IF EXISTS public.idx_trucks_company_id;
DROP INDEX IF EXISTS public.idx_trucks_needs_recovery;
DROP INDEX IF EXISTS public.idx_driver_email_log_order_id;
DROP INDEX IF EXISTS public.idx_driver_email_log_driver_id;
DROP INDEX IF EXISTS public.idx_lost_day_notes_note_type;
DROP INDEX IF EXISTS public.idx_company_files_company_id;