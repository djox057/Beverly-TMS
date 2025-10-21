-- Allow safety role to view dispatch, supervisor, manager, and admin user roles
CREATE POLICY "Safety can view dispatch, supervisor, manager and admin roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'safety'::app_role) AND
  role IN ('dispatch'::app_role, 'supervisor'::app_role, 'manager'::app_role, 'admin'::app_role)
);