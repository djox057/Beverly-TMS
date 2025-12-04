-- Fix foreign key constraints that block user deletion
-- Change NO ACTION to SET NULL for audit/tracking fields

-- driver_drug_tests.tested_by
ALTER TABLE public.driver_drug_tests DROP CONSTRAINT IF EXISTS driver_drug_tests_tested_by_fkey;
ALTER TABLE public.driver_drug_tests 
  ADD CONSTRAINT driver_drug_tests_tested_by_fkey 
  FOREIGN KEY (tested_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- driver_termination_notes.created_by
ALTER TABLE public.driver_termination_notes DROP CONSTRAINT IF EXISTS driver_termination_notes_created_by_fkey;
ALTER TABLE public.driver_termination_notes 
  ADD CONSTRAINT driver_termination_notes_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- truck_notes.updated_by
ALTER TABLE public.truck_notes DROP CONSTRAINT IF EXISTS truck_notes_updated_by_fkey;
ALTER TABLE public.truck_notes 
  ADD CONSTRAINT truck_notes_updated_by_fkey 
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- canceled_orders_backup.canceled_by
ALTER TABLE public.canceled_orders_backup DROP CONSTRAINT IF EXISTS canceled_orders_backup_canceled_by_fkey;
ALTER TABLE public.canceled_orders_backup 
  ADD CONSTRAINT canceled_orders_backup_canceled_by_fkey 
  FOREIGN KEY (canceled_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- assignment_history.changed_by (fix any remaining NO ACTION)
ALTER TABLE public.assignment_history DROP CONSTRAINT IF EXISTS assignment_history_changed_by_fkey;
ALTER TABLE public.assignment_history 
  ADD CONSTRAINT assignment_history_changed_by_fkey 
  FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- driver_yard_actions.created_by
ALTER TABLE public.driver_yard_actions DROP CONSTRAINT IF EXISTS driver_yard_actions_created_by_fkey;
ALTER TABLE public.driver_yard_actions 
  ADD CONSTRAINT driver_yard_actions_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- exported_weeks.exported_by
ALTER TABLE public.exported_weeks DROP CONSTRAINT IF EXISTS exported_weeks_exported_by_fkey;
ALTER TABLE public.exported_weeks 
  ADD CONSTRAINT exported_weeks_exported_by_fkey 
  FOREIGN KEY (exported_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- driver_email_log.sent_by
ALTER TABLE public.driver_email_log DROP CONSTRAINT IF EXISTS driver_email_log_sent_by_fkey;
ALTER TABLE public.driver_email_log 
  ADD CONSTRAINT driver_email_log_sent_by_fkey 
  FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;