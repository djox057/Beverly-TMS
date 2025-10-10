-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Dispatchers can view other dispatchers" ON public.profiles;

-- Create new policy allowing dispatchers to view dispatchers, supervisors, and managers
CREATE POLICY "Dispatchers can view dispatchers, supervisors, and managers" 
ON public.profiles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) 
  AND (
    has_role(user_id, 'dispatch'::app_role) 
    OR has_role(user_id, 'supervisor'::app_role)
    OR has_role(user_id, 'manager'::app_role)
  )
);