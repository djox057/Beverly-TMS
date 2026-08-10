CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'accounting'::app_role AND role IN ('safety'::app_role, 'claims'::app_role))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.auth_user_roles()
 RETURNS app_role[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN ('safety'::app_role = ANY(arr) OR 'claims'::app_role = ANY(arr))
         AND NOT ('accounting'::app_role = ANY(arr))
      THEN arr || ARRAY['accounting'::app_role]
    ELSE arr
  END
  FROM (
    SELECT COALESCE(array_agg(role), ARRAY[]::app_role[]) AS arr
    FROM public.user_roles
    WHERE user_id = auth.uid()
  ) s;
$function$;