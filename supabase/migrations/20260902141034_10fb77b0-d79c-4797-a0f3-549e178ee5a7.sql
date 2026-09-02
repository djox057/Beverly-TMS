-- Idempotent hardening of the recovery badge RPC privileges.
-- Postgres grants EXECUTE to PUBLIC by default for new functions, and the
-- prior migration left `anon` with EXECUTE. Revoke both explicitly.
REVOKE ALL ON FUNCTION public.get_recovery_loads_badge() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_recovery_loads_badge() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_recovery_loads_badge() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recovery_loads_badge() TO service_role;