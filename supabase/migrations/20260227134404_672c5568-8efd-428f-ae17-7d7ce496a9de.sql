-- Rollback commands (for manual revert if needed):
-- DROP TRIGGER IF EXISTS enforce_manager_supervisor_field_restrictions ON public.orders;
-- DROP FUNCTION IF EXISTS public.prevent_manager_supervisor_restricted_fields();

CREATE OR REPLACE FUNCTION public.prevent_manager_supervisor_restricted_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_roles app_role[];
BEGIN
  user_roles := public.auth_user_roles();

  IF user_roles && ARRAY['manager'::app_role, 'supervisor'::app_role]
     AND NOT user_roles && ARRAY['admin'::app_role, 'accounting'::app_role]
  THEN
    IF OLD.locked IS DISTINCT FROM NEW.locked THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change lock status';
    END IF;
    IF OLD.invoiced IS DISTINCT FROM NEW.invoiced THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change invoiced status';
    END IF;
    IF OLD.invoiced_at IS DISTINCT FROM NEW.invoiced_at THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change invoiced_at';
    END IF;
    IF OLD.paid IS DISTINCT FROM NEW.paid THEN
      RAISE EXCEPTION 'Manager/Supervisor cannot change paid status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_manager_supervisor_field_restrictions
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_manager_supervisor_restricted_fields();