
-- Create optimized role-checking functions (no table locks needed)
CREATE OR REPLACE FUNCTION public.auth_user_roles()
RETURNS app_role[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(role), ARRAY[]::app_role[])
  FROM public.user_roles
  WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(roles app_role[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.auth_user_roles() && roles;
$$;
