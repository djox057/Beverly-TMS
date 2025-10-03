-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Dispatchers can view other dispatchers (limited)" ON public.profiles;

-- Create new policy allowing dispatchers to view all dispatcher profiles
CREATE POLICY "Dispatchers can view other dispatchers" 
ON public.profiles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'dispatch'::app_role) 
  AND role = 'dispatch'::app_role
);