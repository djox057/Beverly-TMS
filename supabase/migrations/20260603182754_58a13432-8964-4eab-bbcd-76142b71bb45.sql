
-- Make 'safety' role inherit all permissions of 'accounting' by treating
-- safety as also having the accounting role in the two helper functions
-- that all RLS policies and SECURITY DEFINER checks use.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'accounting'::app_role AND role = 'safety'::app_role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_roles()
RETURNS app_role[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN 'safety'::app_role = ANY(arr) AND NOT ('accounting'::app_role = ANY(arr))
      THEN arr || ARRAY['accounting'::app_role]
    ELSE arr
  END
  FROM (
    SELECT COALESCE(array_agg(role), ARRAY[]::app_role[]) AS arr
    FROM public.user_roles
    WHERE user_id = auth.uid()
  ) s;
$$;
