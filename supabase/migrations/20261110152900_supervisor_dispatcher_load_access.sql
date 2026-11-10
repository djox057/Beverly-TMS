-- Supervisors inherit dispatcher load access; team membership remains available
-- for supervisor reporting, salaries and team-management features.
DROP POLICY IF EXISTS "Supervisor assigned team only" ON public.orders;

CREATE OR REPLACE FUNCTION public.supervisor_can_view_order(
  _booked_by text, _driver1 uuid, _driver2 uuid, _original_driver1 uuid, _original_driver2 uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  SELECT NOT public.is_supervisor_dispatch_user()
    OR public.has_role(auth.uid(), 'dispatch'::public.app_role);
$function$;

-- Keep the supervisor role itself while adding inherited dispatcher access.
CREATE OR REPLACE FUNCTION public.auth_user_roles()
RETURNS public.app_role[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT arr
    || CASE WHEN 'supervisor'::public.app_role = ANY(arr) AND NOT ('dispatch'::public.app_role = ANY(arr))
       THEN ARRAY['dispatch'::public.app_role] ELSE ARRAY[]::public.app_role[] END
    || CASE WHEN ('safety'::public.app_role = ANY(arr) OR 'claims'::public.app_role = ANY(arr))
       AND NOT ('accounting'::public.app_role = ANY(arr))
       THEN ARRAY['accounting'::public.app_role] ELSE ARRAY[]::public.app_role[] END
  FROM (
    SELECT COALESCE(array_agg(DISTINCT role), ARRAY[]::public.app_role[]) arr
    FROM public.user_roles WHERE user_id = auth.uid()
  ) s;
$function$;
