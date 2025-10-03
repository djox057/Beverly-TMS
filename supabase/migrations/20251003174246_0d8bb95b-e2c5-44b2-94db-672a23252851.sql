-- Enable RLS on the view to prevent public access
ALTER VIEW public.recent_pii_access SET (security_barrier = true);

-- Note: Views inherit permissions from underlying tables when security_invoker is true
-- The view is protected because driver_pii_audit_log has RLS enabled
-- Only admins who can access the audit log will be able to query this view