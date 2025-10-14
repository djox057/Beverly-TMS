-- Add INSERT policy for trailers for safety role
CREATE POLICY "Safety can create trailers"
ON public.trailers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'safety'::app_role));