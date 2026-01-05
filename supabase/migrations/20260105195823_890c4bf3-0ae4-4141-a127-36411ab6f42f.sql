-- Add UPDATE policy for efs_other_requests table
CREATE POLICY "Authenticated users can update EFS other requests"
ON public.efs_other_requests
FOR UPDATE
USING (true)
WITH CHECK (true);