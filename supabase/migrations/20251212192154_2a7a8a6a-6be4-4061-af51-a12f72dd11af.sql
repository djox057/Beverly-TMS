-- Drop the old restrictive policy for dispatch
DROP POLICY IF EXISTS "Dispatch can view dispatcher-related user roles" ON public.user_roles;

-- Create a new policy that allows dispatch to also see maintenance roles (needed for weekend schedule)
CREATE POLICY "Dispatch can view dispatcher-related user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) 
  AND role = ANY (ARRAY['dispatch'::app_role, 'afterhours'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'maintenance'::app_role])
);