-- Drop and recreate the view as SECURITY INVOKER (safer, relies on RLS)
DROP VIEW IF EXISTS public.recent_pii_access;

CREATE VIEW public.recent_pii_access
WITH (security_invoker = true)
AS
SELECT 
  al.id,
  al.accessed_at,
  al.operation,
  al.fields_accessed,
  al.access_reason,
  d.name as driver_name,
  p.full_name as accessed_by_name,
  p.email as accessed_by_email,
  p.role as accessed_by_role
FROM public.driver_pii_audit_log al
JOIN public.drivers d ON d.id = al.driver_id
LEFT JOIN public.profiles p ON p.user_id = al.accessed_by
WHERE al.accessed_at > NOW() - INTERVAL '30 days'
ORDER BY al.accessed_at DESC
LIMIT 1000;