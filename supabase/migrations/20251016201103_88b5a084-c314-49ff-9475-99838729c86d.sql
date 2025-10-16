-- Allow afterhours to view all profiles (needed for fleet management)
CREATE POLICY "Afterhours can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'afterhours'::app_role));