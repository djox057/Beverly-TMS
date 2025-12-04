-- Add indexes for unindexed foreign keys
CREATE INDEX IF NOT EXISTS idx_company_files_company_id ON public.company_files(company_id);
CREATE INDEX IF NOT EXISTS idx_truck_locations_truck_id ON public.truck_locations(truck_id);
CREATE INDEX IF NOT EXISTS idx_truck_note_history_truck_id ON public.truck_note_history(truck_id);
CREATE INDEX IF NOT EXISTS idx_trucks_company_id ON public.trucks(company_id);

-- Drop unused indexes
DROP INDEX IF EXISTS public.idx_assignment_history_changed_by;
DROP INDEX IF EXISTS public.idx_assignment_history_driver2_id;
DROP INDEX IF EXISTS public.idx_canceled_orders_backup_canceled_by;
DROP INDEX IF EXISTS public.idx_driver_drug_tests_tested_by;
DROP INDEX IF EXISTS public.idx_driver_email_log_sent_by;
DROP INDEX IF EXISTS public.idx_driver_termination_notes_created_by;
DROP INDEX IF EXISTS public.idx_driver_yard_actions_created_by;
DROP INDEX IF EXISTS public.idx_driver_yard_actions_driver_id;
DROP INDEX IF EXISTS public.idx_exported_weeks_exported_by;
DROP INDEX IF EXISTS public.idx_orders_booked_by_company_id;
DROP INDEX IF EXISTS public.idx_orders_broker_id;
DROP INDEX IF EXISTS public.idx_orders_original_driver1_id;
DROP INDEX IF EXISTS public.idx_orders_original_driver2_id;
DROP INDEX IF EXISTS public.idx_orders_original_trailer_id;
DROP INDEX IF EXISTS public.idx_orders_original_truck_id;
DROP INDEX IF EXISTS public.idx_orders_trailer_id;
DROP INDEX IF EXISTS public.idx_recovery_history_original_dispatcher_id;
DROP INDEX IF EXISTS public.idx_recovery_history_original_driver1_id;
DROP INDEX IF EXISTS public.idx_recovery_history_original_driver2_id;
DROP INDEX IF EXISTS public.idx_recovery_history_original_trailer_id;
DROP INDEX IF EXISTS public.idx_recovery_history_original_truck_id;
DROP INDEX IF EXISTS public.idx_recovery_history_recovery_driver1_id;
DROP INDEX IF EXISTS public.idx_recovery_history_recovery_driver2_id;
DROP INDEX IF EXISTS public.idx_recovery_history_recovery_trailer_id;
DROP INDEX IF EXISTS public.idx_recovery_history_recovery_truck_id;
DROP INDEX IF EXISTS public.idx_recovery_history_reverted_by;
DROP INDEX IF EXISTS public.idx_truck_note_history_edited_by;
DROP INDEX IF EXISTS public.idx_trucks_left_by_driver_id;