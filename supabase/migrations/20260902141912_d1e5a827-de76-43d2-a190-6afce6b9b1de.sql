-- Idempotent final privilege state for the recovery badge function
REVOKE ALL ON FUNCTION public.get_recovery_loads_badge() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_recovery_loads_badge() FROM anon;
REVOKE ALL ON FUNCTION public.get_recovery_loads_badge() FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_recovery_loads_badge() TO authenticated;

-- Cleanup: temporary verification helper (no longer needed)
DROP FUNCTION IF EXISTS public.tmp_verify_recovery_badge();