-- Allow dispatch users to view user_roles for dispatch, afterhours, manager, and supervisor roles
CREATE POLICY "Dispatch can view dispatcher-related user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role) 
  AND role IN ('dispatch'::app_role, 'afterhours'::app_role, 'manager'::app_role, 'supervisor'::app_role)
);

-- Allow dispatch users to view profiles of dispatchers, managers, supervisors
CREATE POLICY "Dispatch can view dispatcher-related profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'dispatch'::app_role)
  AND user_id IN (
    SELECT user_id 
    FROM user_roles 
    WHERE role IN ('dispatch'::app_role, 'afterhours'::app_role, 'manager'::app_role, 'supervisor'::app_role)
  )
);

-- Allow dispatch users to view dispatcher_status
CREATE POLICY "Dispatch can view dispatcher status"
ON public.dispatcher_status
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'dispatch'::app_role));