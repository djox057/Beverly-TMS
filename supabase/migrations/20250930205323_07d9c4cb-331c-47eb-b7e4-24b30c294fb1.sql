-- Add policy for dispatchers to view other dispatchers
CREATE POLICY "Dispatchers can view other dispatchers"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) 
  AND role = 'dispatch'::app_role
);