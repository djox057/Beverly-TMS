-- Add restrictive policy to block unauthenticated access to profiles table
-- This prevents public access to employee email addresses and personal information

CREATE POLICY "Block all unauthenticated access to profiles"
ON public.profiles
FOR ALL
TO anon
USING (false)
WITH CHECK (false);
