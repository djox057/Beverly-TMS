-- Allow managers to view all profiles
CREATE POLICY "Managers can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'manager'));

-- Allow supervisors to view all profiles
CREATE POLICY "Supervisors can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'supervisor'));

-- Allow managers to view user roles
CREATE POLICY "Managers can view user roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'manager'));

-- Allow supervisors to view user roles
CREATE POLICY "Supervisors can view user roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'supervisor'));