-- Drop the foreign key constraint on driver_pii_audit_log.driver_id
-- Audit logs are historical records and should remain even after drivers are deleted
ALTER TABLE public.driver_pii_audit_log 
DROP CONSTRAINT IF EXISTS driver_pii_audit_log_driver_id_fkey;

-- The driver_id column will still store the UUID for reference, 
-- but won't enforce referential integrity
-- This allows audit logs to persist as historical records