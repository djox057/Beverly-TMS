-- Allow afterhours to view all user_roles (needed to see all dispatchers in fleet management)
CREATE POLICY "Afterhours can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'afterhours'::app_role));