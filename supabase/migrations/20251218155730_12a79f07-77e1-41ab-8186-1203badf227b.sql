-- Create a function to check if user is a schedule manager
CREATE OR REPLACE FUNCTION public.is_schedule_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND LOWER(email) IN ('tommyj@bfprime.net', 'acccoc225@gmail.com')
  );
$$;

-- Drop old INSERT policy
DROP POLICY IF EXISTS "Admins and managers can insert afterhours schedule" ON public.afterhours_schedule;

-- Create new INSERT policy that includes schedule managers
CREATE POLICY "Admins managers and schedule managers can insert afterhours schedule" 
ON public.afterhours_schedule 
FOR INSERT 
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role) 
  OR has_role((SELECT auth.uid()), 'manager'::app_role)
  OR is_schedule_manager((SELECT auth.uid()))
);

-- Drop old DELETE policy
DROP POLICY IF EXISTS "Admins and managers can delete afterhours schedule" ON public.afterhours_schedule;

-- Create new DELETE policy that includes schedule managers
CREATE POLICY "Admins managers and schedule managers can delete afterhours schedule" 
ON public.afterhours_schedule 
FOR DELETE 
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) 
  OR has_role((SELECT auth.uid()), 'manager'::app_role)
  OR is_schedule_manager((SELECT auth.uid()))
);