-- Drop the view since it cannot have RLS policies
-- The underlying driver_pii_audit_log table already has proper RLS (admins only)
-- Applications can query the audit log table directly
DROP VIEW IF EXISTS public.recent_pii_access;

-- Add helpful comment on the audit log table
COMMENT ON TABLE public.driver_pii_audit_log IS 'Audit log for all access to driver sensitive PII. Tracks who accessed what data and when for security compliance. Access restricted to admins only via RLS policies.';